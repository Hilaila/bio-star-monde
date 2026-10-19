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
  // Une colonne restée en échec est supprimée, puis recréée au passage suivant.
  async function createMissing(table, deadline = Infinity) {
    let current;
    try { current = await call('GET', tablePath(table)); } catch (e) {
      if (e.code !== 404) throw e;
      await ensureDatabase();
      await call('POST', `/tablesdb/${DATABASE_ID}/tables`, { tableId: table, name: TABLES[table].name, permissions: [], rowSecurity: false });
      current = await call('GET', tablePath(table));
    }
    const existing = new Map((current.columns || []).map((c) => [c.key, c]));
    for (const c of TABLES[table].columns) {
      if (Date.now() > deadline) return;
      const found = existing.get(c.body.key);
      if (found && (found.status === 'failed' || found.status === 'stuck')) {
        await call('DELETE', `${tablePath(table)}/columns/${c.body.key}`);
      } else if (!found) {
        await call('POST', `${tablePath(table)}/columns/${c.type}`, c.body);
      }
    }
  }

  // Étape 2 : Appwrite crée les colonnes en arrière-plan ; les index ne sont créés qu'une fois toutes les colonnes disponibles.
  async function checkTable(table) {
    const current = await call('GET', tablePath(table));
    const columns = current.columns || [];
    if (!TABLES[table].columns.every((c) => columns.some((x) => x.key === c.body.key && x.status === 'available'))) return false;
    const indexes = new Map((current.indexes || []).map((x) => [x.key, x]));
    for (const ix of TABLES[table].indexes) if (!indexes.has(ix.key)) await call('POST', `${tablePath(table)}/indexes`, ix);
    if (TABLES[table].indexes.some((ix) => indexes.has(ix.key) && indexes.get(ix.key).status && indexes.get(ix.key).status !== 'available')) return false;
    ready.add(table);
    return true;
  }

  // Prépare des tables dans un temps limité, pour rester sous le délai d'exécution de la fonction.
  async function prepareTables(tables, budgetMs) {
    const deadline = Date.now() + budgetMs;
    let pending = tables.filter((t) => !ready.has(t));
    while (pending.length) {
      for (const t of pending) {
        if (Date.now() > deadline) break;
        await createMissing(t, deadline);
        if (Date.now() > deadline) break;
        await checkTable(t);
      }
      pending = pending.filter((t) => !ready.has(t));
      if (!pending.length || Date.now() + waitMs > deadline) break;
      await pause(waitMs);
    }
    return { ready: pending.length === 0, pending };
  }

  async function ensureTable(table) {
    if (ready.has(table)) return;
    const result = await prepareTables([table], 8000);
    if (!result.ready) throw new Error(`La table Appwrite « ${table} » est en cours de création : réessayez dans quelques secondes.`);
  }

  // Toutes les tables (adresse /api/setup) : renvoie { ready, pending } sans dépasser le budget de temps.
  const prepare = ({ budgetMs = 7000 } = {}) => prepareTables(Object.keys(TABLES), budgetMs);

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
