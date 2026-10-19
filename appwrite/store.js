// Stockage des commandes dans Appwrite (TablesDB), par l'API REST : aucune dépendance à installer.
// La base « biostar » et la table « orders » sont créées automatiquement au premier usage.
// Portées nécessaires pour la clé dynamique de la fonction : databases.*, tables.*, columns.*, indexes.*, rows.* (lecture et écriture).

export const DATABASE_ID = 'biostar';
export const TABLE_ID = 'orders';

const COLUMNS = [
  { type: 'string', body: { key: 'username', size: 64, required: true } },
  { type: 'string', body: { key: 'product_id', size: 64, required: true } },
  { type: 'float', body: { key: 'amount', required: true } },
  { type: 'string', body: { key: 'memo', size: 200, required: true } },
  { type: 'string', body: { key: 'payment_id', size: 128, required: true } },
  { type: 'string', body: { key: 'txid', size: 256, required: false } },
  { type: 'enum', body: { key: 'status', elements: ['approved', 'completed', 'cancelled'], required: true } },
  { type: 'datetime', body: { key: 'created_at', required: true } }
];
const INDEXES = [
  { key: 'payment_id_unique', type: 'unique', columns: ['payment_id'] },
  { key: 'username_idx', type: 'key', columns: ['username'] }
];

let schemaReady = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createAppwriteStore({ endpoint, projectId, key, fetchImpl, waitMs = 1000 }) {
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);
  const base = String(endpoint || '').replace(/\/+$/, '');
  const tablePath = `/tablesdb/${DATABASE_ID}/tables/${TABLE_ID}`;

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

  async function ensureSchema() {
    if (schemaReady) return;
    let table;
    try {
      table = await call('GET', tablePath);
    } catch (e) {
      if (e.code !== 404) throw e;
      try { await call('GET', `/tablesdb/${DATABASE_ID}`); } catch (e2) {
        if (e2.code !== 404) throw e2;
        await call('POST', '/tablesdb', { databaseId: DATABASE_ID, name: 'Bio Star Monde Éden' });
      }
      await call('POST', `/tablesdb/${DATABASE_ID}/tables`, { tableId: TABLE_ID, name: 'Commandes', permissions: [], rowSecurity: false });
      table = await call('GET', tablePath);
    }
    // Colonnes manquantes (première installation ou installation interrompue).
    const existing = new Set((table.columns || []).map((c) => c.key));
    for (const c of COLUMNS) {
      if (!existing.has(c.body.key)) await call('POST', `${tablePath}/columns/${c.type}`, c.body);
    }
    // Appwrite crée les colonnes en arrière-plan : on attend qu'elles soient disponibles avant les index.
    for (let attempt = 0; attempt < 20; attempt++) {
      table = await call('GET', tablePath);
      const columns = table.columns || [];
      const failed = columns.find((c) => c.status === 'failed' || c.status === 'stuck');
      if (failed) throw new Error('Colonne Appwrite en échec : ' + failed.key);
      if (COLUMNS.every((c) => columns.some((x) => x.key === c.body.key && x.status === 'available'))) {
        const indexes = new Set((table.indexes || []).map((x) => x.key));
        for (const ix of INDEXES) if (!indexes.has(ix.key)) await call('POST', `${tablePath}/indexes`, ix);
        schemaReady = true;
        return;
      }
      await pause(waitMs);
    }
    throw new Error('La table Appwrite est en cours de création : réessayez dans quelques secondes.');
  }

  async function findRow(paymentId) {
    await ensureSchema();
    const list = await call('GET', `${tablePath}/rows`, null, [
      { method: 'equal', attribute: 'payment_id', values: [paymentId] },
      { method: 'limit', values: [1] }
    ]);
    return (list.rows || [])[0] || null;
  }
  const toOrder = (row) => row && ({
    id: row.$id, username: row.username, product_id: row.product_id, amount: row.amount, memo: row.memo,
    payment_id: row.payment_id, txid: row.txid ?? null, status: row.status, created_at: row.created_at
  });

  // Lecture par pages de 100 lignes ; le tri par date est fait ensuite par l'API.
  async function listRows(username, limit) {
    await ensureSchema();
    const rows = [];
    const page = 100;
    while (rows.length < limit) {
      const want = Math.min(page, limit - rows.length);
      const queries = [{ method: 'limit', values: [want] }, { method: 'offset', values: [rows.length] }];
      if (username) queries.unshift({ method: 'equal', attribute: 'username', values: [username] });
      const list = await call('GET', `${tablePath}/rows`, null, queries);
      const batch = list.rows || [];
      rows.push(...batch);
      if (batch.length < want) break;
    }
    return rows;
  }

  return {
    kind: 'appwrite',
    prepare: ensureSchema,
    async getOrder(paymentId) { return toOrder(await findRow(paymentId)); },
    async listOrders({ username, limit = 200 } = {}) { return (await listRows(username, limit)).map(toOrder); },
    async insertOrder(o) {
      await ensureSchema();
      await call('POST', `${tablePath}/rows`, {
        rowId: o.id,
        data: { username: o.username, product_id: o.product_id, amount: o.amount, memo: o.memo, payment_id: o.payment_id, status: o.status, created_at: o.created_at }
      });
    },
    async completeOrder(paymentId, txid) {
      const row = await findRow(paymentId);
      if (!row) throw new Error('Commande introuvable pour la finalisation.');
      await call('PATCH', `${tablePath}/rows/${encodeURIComponent(row.$id)}`, { data: { txid, status: 'completed' } });
    },
    async cancelOrder(paymentId) {
      const row = await findRow(paymentId);
      if (row && row.status !== 'completed') await call('PATCH', `${tablePath}/rows/${encodeURIComponent(row.$id)}`, { data: { status: 'cancelled' } });
    }
  };
}

// Pour les tests uniquement.
export function resetSchemaCache() { schemaReady = false; }
