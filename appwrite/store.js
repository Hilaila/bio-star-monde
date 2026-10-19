// Stockage dans Appwrite (TablesDB), par l'API REST : aucune dépendance à installer.
// La base « biostar » et ses tables (core/schema.js) sont créées automatiquement : au premier usage de chaque table,
// ou toutes ensemble par /api/setup.
// Portées nécessaires pour la clé dynamique de la fonction : databases.*, tables.*, columns.*, indexes.*, rows.* (lecture et écriture).
import { TABLES, columnKeys, booleanKeys } from '../core/schema.js';

export const DATABASE_ID = 'biostar';
export const TABLE_ID = 'orders';

const ready = new Set();
let databaseReady = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createAppwriteStore({ endpoint, projectId, key, fetchImpl, waitMs = 1000 }) {
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);
  const base = String(endpoint || '').replace(/\/+$/, '');
  const tablePath = (table) => `/tablesdb/${DATABASE_ID}/tables/${table}`;

  async function call(method, path, body, queries) {
    if (!base || !projectId || !key) throw new Error('Appwrite non configuré : endpoint, projet ou clé dynamique manquant (vérifiez les portées de la fonction).');
    const url = new URL(base + path);
    (queries || []).forEach((q, i) => url.searchParams.append(`queries[${i}]`, JSON.stringify(q)));
    const response = await doFetch(url, {
      method,
      headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) {
      const err = new Error(`Appwrite ${method} ${path} : HTTP ${response.status} ${data.message || ''}`.trim());
      err.code = response.status;
      throw err;
    }
    return data;
  }

  async function ensureDatabase() {
    if (databaseReady) return;
    try { await call('GET', `/tablesdb/${DATABASE_ID}`); } catch (e) {
      if (e.code !== 404) throw e;
      await call('POST', '/tablesdb', { databaseId: DATABASE_ID, name: 'Bio Star Monde Éden' });
    }
    databaseReady = true;
  }

  // Étape 1 : table et colonnes manquantes (première installation, nouvelle version ou installation interrompue).
  async function createMissing(table) {
    let current;
    try { current = await call('GET', tablePath(table)); } catch (e) {
      if (e.code !== 404) throw e;
      await ensureDatabase();
      await call('POST', `/tablesdb/${DATABASE_ID}/tables`, { tableId: table, name: TABLES[table].name, permissions: [], rowSecurity: false });
      current = await call('GET', tablePath(table));
    }
    const existing = new Set((current.columns || []).map((c) => c.key));
    for (const c of TABLES[table].columns) {
      if (!existing.has(c.body.key)) await call('POST', `${tablePath(table)}/columns/${c.type}`, c.body);
    }
  }

  // Étape 2 : Appwrite crée les colonnes en arrière-plan ; on attend qu'elles soient disponibles avant les index.
  async function finish(table) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const current = await call('GET', tablePath(table));
      const columns = current.columns || [];
      const failed = columns.find((c) => c.status === 'failed' || c.status === 'stuck');
      if (failed) throw new Error(`Colonne Appwrite en échec : ${table}.${failed.key}`);
      if (TABLES[table].columns.every((c) => columns.some((x) => x.key === c.body.key && x.status === 'available'))) {
        const indexes = new Set((current.indexes || []).map((x) => x.key));
        for (const ix of TABLES[table].indexes) if (!indexes.has(ix.key)) await call('POST', `${tablePath(table)}/indexes`, ix);
        ready.add(table);
        return;
      }
      await pause(waitMs);
    }
    throw new Error(`La table Appwrite « ${table} » est en cours de création : réessayez dans quelques secondes.`);
  }

  async function ensureTable(table) {
    if (ready.has(table)) return;
    await createMissing(table);
    await finish(table);
  }

  // Toutes les tables : d'abord toutes les créations, puis une seule attente.
  async function prepare() {
    const tables = Object.keys(TABLES).filter((t) => !ready.has(t));
    for (const t of tables) await createMissing(t);
    for (const t of tables) await finish(t);
  }

  function fromRow(table, row) {
    if (!row) return null;
    const out = { id: row.$id };
    const bools = booleanKeys(table);
    for (const k of columnKeys(table)) out[k] = row[k] === undefined ? null : row[k];
    for (const k of bools) out[k] = Boolean(out[k]);
    return out;
  }
  // Création : les valeurs vides sont omises. Mise à jour : null efface la valeur, undefined la laisse intacte.
  function pick(table, data, keepNull = false) {
    const out = {};
    for (const k of columnKeys(table)) if (data[k] !== undefined && (keepNull || data[k] !== null)) out[k] = data[k];
    return out;
  }

  // Lecture par pages de 100 lignes ; le tri est fait ensuite par l'API.
  async function find(table, where = {}, limit = 200) {
    await ensureTable(table);
    const keys = columnKeys(table);
    const filters = Object.entries(where).map(([attribute, value]) => {
      if (!keys.includes(attribute)) throw new Error('Filtre inconnu : ' + attribute);
      return { method: 'equal', attribute, values: [value] };
    });
    const rows = [];
    const page = 100;
    while (rows.length < limit) {
      const want = Math.min(page, limit - rows.length);
      const list = await call('GET', `${tablePath(table)}/rows`, null, [...filters, { method: 'limit', values: [want] }, { method: 'offset', values: [rows.length] }]);
      const batch = list.rows || [];
      rows.push(...batch);
      if (batch.length < want) break;
    }
    return rows.map((r) => fromRow(table, r));
  }
  async function get(table, id) {
    await ensureTable(table);
    try { return fromRow(table, await call('GET', `${tablePath(table)}/rows/${encodeURIComponent(id)}`)); } catch (e) {
      if (e.code === 404) return null;
      throw e;
    }
  }
  async function insert(table, row) {
    await ensureTable(table);
    try {
      await call('POST', `${tablePath(table)}/rows`, { rowId: row.id, data: pick(table, row) });
    } catch (e) {
      if (e.code === 409) { const err = new Error('Doublon'); err.duplicate = true; throw err; }
      throw e;
    }
  }
  async function update(table, id, data) {
    await ensureTable(table);
    await call('PATCH', `${tablePath(table)}/rows/${encodeURIComponent(id)}`, { data: pick(table, data, true) });
  }
  async function count(table) {
    await ensureTable(table);
    const list = await call('GET', `${tablePath(table)}/rows`, null, [{ method: 'limit', values: [1] }]);
    return Number(list.total || 0);
  }

  const getOrder = async (paymentId) => (await find('orders', { payment_id: paymentId }, 1))[0] || null;

  return {
    kind: 'appwrite',
    prepare,
    find, get, insert, update, count,
    getOrder,
    async listOrders({ username, limit = 200 } = {}) { return find('orders', username ? { username } : {}, limit); },
    async insertOrder(o) {
      await insert('orders', { id: o.id, username: o.username, product_id: o.product_id, amount: o.amount, memo: o.memo, payment_id: o.payment_id, status: o.status, created_at: o.created_at });
    },
    async completeOrder(paymentId, txid) {
      const order = await getOrder(paymentId);
      if (!order) throw new Error('Commande introuvable pour la finalisation.');
      await update('orders', order.id, { txid, status: 'completed' });
    },
    async cancelOrder(paymentId) {
      const order = await getOrder(paymentId);
      if (order && order.status !== 'completed') await update('orders', order.id, { status: 'cancelled' });
    }
  };
}

// Pour les tests uniquement.
export function resetSchemaCache() { ready.clear(); databaseReady = false; }
