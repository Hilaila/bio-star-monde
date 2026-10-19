// Tests de la fonction Appwrite (appwrite/main.js) avec Appwrite TablesDB et l'API Pi simulés.
// Lancement : npm test (aucune dépendance à installer).
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';
const repo = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Appwrite TablesDB simulé ---
const db = { databases: new Set(), tables: new Map(), calls: [] };
const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const SYSTEM = new Set(['$id']);
function appwrite(url, opts) {
  const u = new URL(url); const p = u.pathname.replace('/v1', ''); const m = opts.method;
  db.calls.push(m + ' ' + p);
  assert.equal(opts.headers['X-Appwrite-Project'], 'proj-1'); assert.equal(opts.headers['X-Appwrite-Key'], 'dyn-key');
  const body = opts.body ? JSON.parse(opts.body) : {};
  let r;
  if (m === 'GET' && (r = p.match(/^\/tablesdb\/([^/]+)$/))) return db.databases.has(r[1]) ? reply(200, { $id: r[1] }) : reply(404, { message: 'Database not found' });
  if (m === 'POST' && p === '/tablesdb') { db.databases.add(body.databaseId); return reply(201, { $id: body.databaseId }); }
  if (m === 'POST' && (r = p.match(/^\/tablesdb\/([^/]+)\/tables$/))) {
    if (!db.databases.has(r[1])) return reply(404, { message: 'Database not found' });
    db.tables.set(body.tableId, { $id: body.tableId, name: body.name, columns: [], indexes: [], rows: [] }); return reply(201, {});
  }
  if ((r = p.match(/^\/tablesdb\/([^/]+)\/tables\/([^/]+)(.*)$/))) {
    if (!db.databases.has(r[1])) return reply(404, { message: 'Database not found' });
    const t = db.tables.get(r[2]); const rest = r[3];
    if (!t) return reply(404, { message: 'Table not found' });
    if (m === 'GET' && rest === '') {
      const snapshot = JSON.parse(JSON.stringify({ $id: t.$id, columns: t.columns, indexes: t.indexes }));
      t.columns.forEach((c) => { c.status = 'available'; }); // disponibles à la lecture suivante
      return reply(200, snapshot);
    }
    let x;
    if (m === 'POST' && (x = rest.match(/^\/columns\/(\w+)$/))) {
      assert.ok(!(body.required && body.default !== undefined), 'colonne obligatoire avec valeur par défaut refusée par Appwrite');
      t.columns.push({ ...body, type: x[1], status: 'processing' }); return reply(202, {});
    }
    if (m === 'DELETE' && (x = rest.match(/^\/columns\/(\w+)$/))) { t.columns = t.columns.filter((c) => c.key !== x[1]); return new Response(null, { status: 204 }); }
    if (m === 'POST' && rest === '/indexes') {
      assert.ok(t.columns.every((c) => c.status === 'available'), 'index créé avant la disponibilité des colonnes');
      for (const col of body.columns) assert.ok(t.columns.some((c) => c.key === col), 'index sur colonne inconnue ' + col);
      t.indexes.push({ key: body.key, type: body.type, columns: body.columns }); return reply(202, {});
    }
    if (m === 'GET' && rest === '/rows') {
      const q = [...u.searchParams.entries()].map(([, v]) => JSON.parse(v));
      const eqs = q.filter((y) => y.method === 'equal'); const lim = q.find((y) => y.method === 'limit'); const off = q.find((y) => y.method === 'offset');
      assert.ok(!lim || lim.values[0] <= 100, 'pages de 100 lignes au plus');
      let rows = t.rows.filter((row) => eqs.every((e) => e.values.includes(row[e.attribute])));
      const total = rows.length;
      if (off) rows = rows.slice(off.values[0]);
      if (lim) rows = rows.slice(0, lim.values[0]);
      return reply(200, { total, rows });
    }
    if (m === 'POST' && rest === '/rows') {
      const keys = new Set(t.columns.map((c) => c.key));
      for (const k of Object.keys(body.data)) if (!keys.has(k)) return reply(400, { message: 'Invalid document structure: Unknown attribute: "' + k + '"' });
      for (const c of t.columns) if (c.required && (body.data[c.key] === undefined || body.data[c.key] === null)) return reply(400, { message: 'Missing required attribute "' + c.key + '"' });
      if (t.rows.some((row) => row.$id === body.rowId)) return reply(409, { message: 'Document with the requested ID already exists' });
      for (const ix of t.indexes.filter((i) => i.type === 'unique')) {
        if (t.rows.some((row) => ix.columns.every((c) => row[c] === body.data[c]))) return reply(409, { message: 'Document with the requested ID already exists' });
      }
      const row = { $id: body.rowId };
      for (const c of t.columns) row[c.key] = body.data[c.key] ?? (c.default !== undefined ? c.default : null);
      t.rows.push(row); return reply(201, row);
    }
    if ((x = rest.match(/^\/rows\/([^/]+)$/))) {
      const id = decodeURIComponent(x[1]); const row = t.rows.find((y) => y.$id === id);
      if (!row) return reply(404, { message: 'Row not found' });
      if (m === 'GET') return reply(200, row);
      if (m === 'PATCH') {
        for (const k of Object.keys(body.data)) if (!t.columns.some((c) => c.key === k) && !SYSTEM.has(k)) return reply(400, { message: 'Unknown attribute ' + k });
        for (const c of t.columns) if (c.required && body.data[c.key] === null) return reply(400, { message: 'Missing required attribute' });
        Object.assign(row, body.data); return reply(200, row);
      }
    }
  }
  return reply(500, { message: 'route simulée inconnue ' + m + ' ' + p });
}

// --- API Pi simulée ---
const payments = new Map();
const users = { 'Bearer tok-alice-1234': { uid: 'u1', username: 'alice' }, 'Bearer tok-zougba-1234': { uid: 'uz', username: 'Zougba' }, 'Bearer tok-bob-12345': { uid: 'ub', username: 'bob' } };
function pi(url, opts) {
  if (url.endsWith('/v2/me')) return users[opts.headers.Authorization] ? reply(200, users[opts.headers.Authorization]) : reply(401, {});
  assert.equal(opts.headers.Authorization, 'Key pi-test');
  const m = url.match(/payments\/([^/]+)(?:\/(approve|complete))?$/); const p = payments.get(m[1]);
  if (m[2] === 'approve') p.status.developer_approved = true;
  if (m[2] === 'complete') { assert.equal(JSON.parse(opts.body).txid, p.transaction.txid); p.status.developer_completed = true; }
  return reply(200, p);
}
globalThis.fetch = async (url, opts = {}) => { const s = String(url); return s.startsWith(ENDPOINT) ? appwrite(s, opts) : pi(s, opts); };

Object.assign(process.env, { APPWRITE_FUNCTION_API_ENDPOINT: ENDPOINT, APPWRITE_FUNCTION_PROJECT_ID: 'proj-1', PI_API_KEY: 'pi-test', ADMIN_USERNAMES: 'zougba' });
const { default: main } = await import(path.join(repo, 'appwrite/main.js'));
const { TABLES } = await import(path.join(repo, 'core/schema.js'));

// --- Contexte Appwrite simulé ---
async function run(method, p, body, queryString = '') {
  const out = {}; const errors = [];
  const res = {
    text: (b, status = 200, headers = {}) => Object.assign(out, { body: b, status, headers }),
    json: (b, status = 200, headers = {}) => Object.assign(out, { body: JSON.stringify(b), status, headers })
  };
  const req = { method, path: p, host: 'bio.fra.appwrite.run', queryString, headers: { 'x-appwrite-key': 'dyn-key', 'content-type': 'application/json', host: 'bio.fra.appwrite.run' }, bodyText: body ? JSON.stringify(body) : '' };
  await main({ req, res, log: () => {}, error: (m) => errors.push(m) });
  let json = null; try { json = JSON.parse(out.body); } catch {}
  return { ...out, json, errors };
}
const ok = (n) => console.log('OK  ', n);
const orders = () => db.tables.get('orders').rows;

let r = await run('GET', '/');
assert.equal(r.status, 200); assert.match(r.headers['Content-Type'], /text\/html/); assert.match(r.body, /Bio Star Monde Éden/); assert.match(r.headers['Content-Security-Policy'], /frame-ancestors 'self' https:\/\/\*\.minepi\.com/); ok('page d’accueil servie avec CSP compatible Pi');
r = await run('GET', '/lot.html'); assert.equal(r.status, 200); assert.match(r.body, /BIOTRACE/); ok('page publique de traçabilité servie');
r = await run('GET', '/qr.js'); assert.match(r.headers['Content-Type'], /javascript/); ok('générateur de code QR servi');
r = await run('GET', '/config.js'); assert.match(r.body, /BSME_API_BASE = ''/); ok('config.js (API sur le même domaine)');
r = await run('GET', '/../server/index.js'); assert.notEqual(r.status, 200); ok('aucun accès hors du dossier public');
r = await run('GET', '/api/health'); assert.equal(r.json.database, 'appwrite'); assert.equal(r.json.piApiKeyConfigured, true); ok('état technique');
r = await run('GET', '/api/products'); assert.equal(r.json.products.length, 12); ok('catalogue (12 offres)');
assert.equal(db.calls.length, 0); ok('aucun appel à la base pour les pages et le catalogue');

r = await run('GET', '/api/setup'); assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.json.ok, true);
assert.ok(db.databases.has('biostar'));
for (const [name, def] of Object.entries(TABLES)) {
  const t = db.tables.get(name);
  assert.ok(t, 'table créée : ' + name);
  assert.equal(t.columns.length, def.columns.length, 'colonnes de ' + name); assert.equal(t.indexes.length, def.indexes.length, 'index de ' + name);
}
ok('préparation des 5 tables par /api/setup (commandes, exploitations, parcelles, lots, étapes)');
const structure = () => db.calls.filter((c) => /^(POST \/tablesdb$|POST .*\/(tables|columns\/\w+|indexes)$)/.test(c)).length;
let before = structure();
r = await run('GET', '/api/setup'); assert.equal(r.json.ok, true); assert.equal(structure(), before); ok('préparation relancée sans effet de bord');

payments.set('p1', { identifier: 'p1', user_uid: 'u1', amount: 1, metadata: { productId: 'fondamentaux-agrobio' }, status: {}, transaction: null });
r = await run('POST', '/api/payments/approve', { paymentId: 'p1', productId: 'fondamentaux-agrobio', accessToken: 'tok-alice-1234' });
assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.json.status, 'approved'); assert.equal(orders().length, 1); assert.equal(orders()[0].status, 'approved');
ok('premier paiement enregistré dans la table');
payments.get('p1').transaction = { txid: 'tx-1' };
r = await run('POST', '/api/payments/complete', { paymentId: 'p1', txid: 'tx-1', accessToken: 'tok-alice-1234' });
assert.equal(r.json.status, 'completed'); assert.equal(orders()[0].status, 'completed'); assert.equal(orders()[0].txid, 'tx-1'); ok('finalisation enregistrée');

before = structure();
payments.set('p2', { identifier: 'p2', user_uid: 'u1', amount: 0.3, metadata: { productId: 'biochar' }, status: { developer_approved: true }, transaction: { txid: 'tx-2' } });
r = await run('POST', '/api/payments/incomplete', { paymentId: 'p2', accessToken: 'tok-alice-1234' });
assert.equal(r.json.status, 'completed'); assert.equal(orders().find((x) => x.payment_id === 'p2').status, 'completed'); assert.equal(structure(), before);
ok('paiement incomplet sans commande : reconstruit puis finalisé');
payments.set('p3', { identifier: 'p3', user_uid: 'u1', amount: 0.5, metadata: {}, status: {}, transaction: null });
await run('POST', '/api/payments/approve', { paymentId: 'p3', productId: 'compost-biofertilisants', accessToken: 'tok-alice-1234' });
r = await run('POST', '/api/payments/cancel', { paymentId: 'p3', accessToken: 'tok-alice-1234' });
assert.equal(r.json.status, 'cancelled'); assert.equal(orders().find((x) => x.payment_id === 'p3').status, 'cancelled'); ok('annulation');
r = await run('POST', '/api/payments/approve', { paymentId: 'p9', productId: 'biochar', accessToken: 'mauvais-jeton-xx' }); assert.equal(r.status, 400); ok('jeton Pi invalide refusé');

r = await run('POST', '/api/my-orders', { accessToken: 'tok-alice-1234' });
assert.equal(r.status, 200, JSON.stringify(r)); assert.deepEqual(r.json.orders.map((o) => o.paymentId).sort(), ['p1', 'p2', 'p3']); ok('mes inscriptions (Appwrite)');
r = await run('POST', '/api/admin/orders', { accessToken: 'tok-alice-1234' }); assert.equal(r.status, 403); ok('administration refusée à un apprenant (Appwrite)');

// --- Chaîne connectée sur Appwrite ---
r = await run('POST', '/api/farm/save', { accessToken: 'tok-alice-1234', farm: { name: 'Ferme Éden', country: 'Burkina Faso', region: 'Centre', locality: 'Koubri', areaHa: 3, practices: 'Compost', showTraining: true } });
assert.equal(r.status, 200, JSON.stringify(r)); const farmId = r.json.farm.id;
r = await run('POST', '/api/farm/save', { accessToken: 'tok-alice-1234', farm: { name: 'Ferme Éden', country: 'Burkina Faso', region: 'Centre', showTraining: true } });
assert.equal(r.status, 200, JSON.stringify(r)); const farmRow = db.tables.get('farms').rows[0];
assert.equal(db.tables.get('farms').rows.length, 1); assert.equal(farmRow.$id, farmId); assert.equal(farmRow.locality, null); assert.equal(farmRow.area_ha, null);
ok('exploitation créée puis modifiée (champs vidés)');
r = await run('POST', '/api/plots/save', { accessToken: 'tok-alice-1234', plot: { name: 'Parcelle nord', soil: 'Sableux', crop: 'Tomate' } });
assert.equal(r.status, 200, JSON.stringify(r)); const plotId = r.json.plot.id;
r = await run('POST', '/api/lots/create', { accessToken: 'tok-alice-1234', lot: { product: 'Tomates', plotId, quantity: 50, unit: 'kg' } });
assert.equal(r.status, 200, JSON.stringify(r)); const code = r.json.lot.code; assert.match(code, /^BSME-/);
assert.equal(db.tables.get('lots').rows[0].$id, code); ok('lot créé, code utilisé comme identifiant de ligne');
r = await run('POST', '/api/lots/event', { accessToken: 'tok-alice-1234', code, event: { type: 'recolte', date: '2026-10-12', note: 'Matin' } }); assert.equal(r.status, 200, JSON.stringify(r));
r = await run('POST', '/api/lots/event', { accessToken: 'tok-alice-1234', code, event: { type: 'semis', date: '2026-08-01' } }); assert.equal(r.status, 200);
r = await run('POST', '/api/lots/event', { accessToken: 'tok-bob-12345', code, event: { type: 'vente', date: '2026-10-12' } }); assert.equal(r.status, 404);
ok('étapes enregistrées, compte étranger refusé');
r = await run('GET', '/api/trace', null, 'code=' + code.toLowerCase());
assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.json.farm.name, 'Ferme Éden'); assert.equal(r.json.plot.name, 'Parcelle nord');
assert.deepEqual(r.json.events.map((e) => e.type), ['semis', 'recolte']); assert.equal(r.json.trainings.length, 2);
assert.equal(r.body.includes('alice'), false); ok('traçabilité publique (Appwrite) : formations liées, aucun nom d’utilisateur');
r = await run('POST', '/api/farm', { accessToken: 'tok-alice-1234' });
assert.equal(r.json.lots[0].events.length, 2); assert.equal(r.json.plots.length, 1); ok('tableau de bord de l’exploitation');

for (let i = 0; i < 230; i++) orders().push({ $id: 'x' + i, username: 'carol', product_id: 'diagnostic-parcelle', amount: 0.2, memo: 'Diagnostic', payment_id: 'px' + i, txid: 'tx' + i, status: 'completed', created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() });
r = await run('POST', '/api/admin/orders', { accessToken: 'tok-zougba-1234' });
assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.json.summary.orders, 233); assert.equal(r.json.summary.completed, 232); assert.equal(r.json.summary.cancelled, 1);
assert.equal(r.json.summary.totalPi, 47.3); assert.ok(r.json.orders.every((o, i, a) => i === 0 || a[i - 1].createdAt >= o.createdAt), 'plus récentes d’abord');
assert.deepEqual(r.json.chain, { farms: 1, plots: 1, lots: 1, events: 2 });
ok('administration : 233 inscriptions lues par pages de 100, totaux et chaîne exacts');
r = await run('GET', '/api/health'); assert.equal(r.json.adminConfigured, true); ok('administration configurée');
r = await run('DELETE', '/'); assert.equal(r.status, 405); ok('méthode non autorisée');

// Sans portées configurées : pas de clé dynamique → erreur claire dans les journaux, réponse générique.
const { resetSchemaCache } = await import(path.join(repo, 'appwrite/store.js')); resetSchemaCache();
const out = {}; const errs = [];
await main({ req: { method: 'POST', path: '/api/payments/approve', host: 'x', queryString: '', headers: {}, bodyText: JSON.stringify({ paymentId: 'p4', productId: 'biochar', accessToken: 'tok-alice-1234' }) }, res: { text: (b, s) => Object.assign(out, { b, s }), json: () => {} }, log: () => {}, error: (m) => errs.push(m) });
assert.equal(out.s, 500); assert.ok(errs.some((m) => /Appwrite non configuré/.test(m)), errs.join(' | ')); ok('portées manquantes : erreur explicite dans les journaux Appwrite');

// Mise à jour d'une installation existante : seules les tables nouvelles sont créées, la table des commandes reste intacte.
resetSchemaCache();
for (const t of ['farms', 'plots', 'lots', 'lot_events']) db.tables.delete(t);
const ordersBefore = orders().length; before = structure();
r = await run('GET', '/api/setup'); assert.equal(r.json.ok, true, JSON.stringify(r));
assert.equal(orders().length, ordersBefore); assert.equal(structure() - before, 4 + 31 + 5, 'tables, colonnes et index nouveaux uniquement');
ok('mise à jour : 4 tables nouvelles créées, commandes conservées');

// Colonne restée en échec dans Appwrite : supprimée puis recréée par /api/setup.
resetSchemaCache();
db.tables.get('farms').columns.find((c) => c.key === 'region').status = 'failed';
r = await run('GET', '/api/setup');
assert.equal(r.status, 200); assert.equal(r.json.ok, true, JSON.stringify(r.json));
assert.ok(db.calls.includes('DELETE /tablesdb/biostar/tables/farms/columns/region'));
assert.equal(db.tables.get('farms').columns.find((c) => c.key === 'region').status, 'available');
ok('colonne en échec réparée automatiquement');

// Erreur d'Appwrite : message lisible renvoyé par /api/setup (sans clé).
resetSchemaCache();
const savedFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => (String(url).startsWith(ENDPOINT) ? reply(401, { message: 'The current user is not authorized to perform the requested action.' }) : savedFetch(url, opts));
r = await run('GET', '/api/setup');
globalThis.fetch = savedFetch;
assert.equal(r.status, 200); assert.equal(r.json.ok, false); assert.match(r.json.error, /HTTP 401 The current user is not authorized/); assert.equal(r.body.includes('dyn-key'), false);
ok('erreur d’Appwrite lisible sur /api/setup, sans la clé');
console.log('Tous les tests Appwrite sont passés');
