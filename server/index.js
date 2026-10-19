// Serveur Node de Bio Star Monde Éden : développement local et hébergement Docker.
// La logique de l'API est partagée avec la fonction Appwrite de production (core/handler.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi, parseAdminUsernames } from '../core/handler.js';
import { TABLES, columnKeys, booleanKeys } from '../core/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
loadEnv(path.join(ROOT, '.env'));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[m[1]] = value;
  }
}

const env = process.env;
const PORT = Number(env.PORT || 3000);
const isProd = env.NODE_ENV === 'production';
const appUrl = env.APP_URL || 'http://localhost:3000';
// PI_SANDBOX=true uniquement pour le Sandbox sur ordinateur ; false dans le Pi Browser (Testnet ou Mainnet).
const piSandbox = env.PI_SANDBOX === 'true';
const piNetwork = env.PI_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
// Le Sandbox et le Pi Browser affichent l'application dans un cadre : 'none' la bloquerait.
const frameAncestors = env.FRAME_ANCESTORS || "'self' https://*.minepi.com https://*.pinet.com";

const dbPath = path.resolve(ROOT, env.DATABASE_PATH || './data/biostar.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
// Tables créées à partir du schéma partagé (core/schema.js) ; une table existante n'est jamais modifiée.
const sqlType = { string: 'TEXT', enum: 'TEXT', datetime: 'TEXT', float: 'REAL', boolean: 'INTEGER' };
for (const [table, def] of Object.entries(TABLES)) {
  const cols = def.columns.map((c) => `${c.body.key} ${sqlType[c.type]}${c.body.required ? ' NOT NULL' : ''}`);
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, ${cols.join(', ')})`);
  for (const ix of def.indexes) {
    db.exec(`CREATE ${ix.type === 'unique' ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${table}_${ix.key} ON ${table} (${ix.columns.join(', ')})`);
  }
}
const checkTable = (table) => { if (!TABLES[table]) throw new Error('Table inconnue : ' + table); };
const toSql = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);
function fromSql(table, row) {
  if (!row) return null;
  const out = { ...row };
  for (const k of booleanKeys(table)) out[k] = Boolean(out[k]);
  return out;
}
function whereClause(table, where) {
  const keys = columnKeys(table);
  const entries = Object.entries(where || {});
  for (const [k] of entries) if (!keys.includes(k)) throw new Error('Filtre inconnu : ' + k);
  return { sql: entries.length ? ' WHERE ' + entries.map(([k]) => `${k} = ?`).join(' AND ') : '', values: entries.map(([, v]) => toSql(v)) };
}
const store = {
  kind: 'sqlite',
  async find(table, where = {}, limit = 200) {
    checkTable(table);
    const w = whereClause(table, where);
    return db.prepare(`SELECT * FROM ${table}${w.sql} ORDER BY created_at DESC LIMIT ?`).all(...w.values, limit).map((r) => fromSql(table, r));
  },
  async get(table, id) { checkTable(table); return fromSql(table, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)); },
  async insert(table, row) {
    checkTable(table);
    const keys = ['id', ...columnKeys(table)].filter((k) => row[k] !== undefined && row[k] !== null);
    try {
      db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => toSql(row[k])));
    } catch (e) {
      if (/UNIQUE/.test(e.message)) { const err = new Error('Doublon'); err.duplicate = true; throw err; }
      throw e;
    }
  },
  async update(table, id, data) {
    checkTable(table);
    const keys = columnKeys(table).filter((k) => data[k] !== undefined);
    if (!keys.length) return;
    db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => toSql(data[k])), id);
  },
  async count(table) { checkTable(table); return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; },
  async getOrder(paymentId) { return db.prepare('SELECT * FROM orders WHERE payment_id = ?').get(paymentId); },
  async insertOrder(o) {
    db.prepare('INSERT INTO orders (id, username, product_id, amount, memo, payment_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(o.id, o.username, o.product_id, o.amount, o.memo, o.payment_id, o.status, o.created_at);
  },
  async completeOrder(paymentId, txid) { db.prepare("UPDATE orders SET txid = ?, status = 'completed' WHERE payment_id = ?").run(txid, paymentId); },
  async cancelOrder(paymentId) { db.prepare("UPDATE orders SET status = 'cancelled' WHERE payment_id = ? AND status != 'completed'").run(paymentId); },
  async listOrders({ username, limit = 200 } = {}) {
    return username
      ? db.prepare('SELECT * FROM orders WHERE username = ? ORDER BY created_at DESC LIMIT ?').all(username, limit)
      : db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit);
  }
};

// Catalogue : core/catalogue.json, validé par le promoteur.
const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'core/catalogue.json'), 'utf8')).items;
const api = createApi({
  catalogue, store,
  piApiKey: env.PI_API_KEY || '',
  sandbox: piSandbox, network: piNetwork,
  validationKey: env.PI_VALIDATION_KEY || '',
  adminUsernames: parseAdminUsernames(env.ADMIN_USERNAMES),
  exposeErrors: !isProd
});

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const securityHeaders = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
const csp = "default-src 'self'; script-src 'self' https://sdk.minepi.com https://*.minepi.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.minepi.com https://*.minepi.com; frame-src https://*.minepi.com; base-uri 'self'; form-action 'self'; frame-ancestors " + frameAncestors;

function readRaw(req, limit = 32_000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function sendResponse(res, response) {
  const headers = { ...Object.fromEntries(response.headers), ...securityHeaders };
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, appUrl);
    const init = { method: req.method, headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string') };
    if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await readRaw(req);
    const response = await api(new Request(url, init));
    if (response) return await sendResponse(res, response);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, HEAD', ...securityHeaders });
      return res.end(JSON.stringify({ error: 'Méthode non autorisée.' }));
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(ROOT, 'public', rel);
    if (!file.startsWith(path.resolve(ROOT, 'public') + path.sep)) { res.writeHead(403); return res.end('Interdit'); }
    let stat;
    try { stat = fs.statSync(file); } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Page introuvable'); }
    if (!stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Page introuvable'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', ...securityHeaders, ...(isProd ? { 'Content-Security-Policy': csp } : {}) });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(new Date().toISOString(), req.method, req.url, err.message);
    if (!res.headersSent) res.writeHead(err.status || 400, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders });
    res.end(JSON.stringify({ error: isProd ? 'Requête impossible.' : err.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Bio Star Monde Éden disponible sur http://localhost:' + PORT);
  console.log('Réseau Pi :', piNetwork, '— Mode Sandbox :', piSandbox);
  if (!fs.existsSync(path.join(ROOT, '.env'))) console.warn('ATTENTION : fichier .env absent. Copiez .env.example en .env.');
});
process.on('SIGINT', () => { server.close(() => { db.close(); process.exit(0); }); });
process.on('SIGTERM', () => { server.close(() => { db.close(); process.exit(0); }); });
