// Serveur Node de Bio Star Monde Éden : développement local et hébergement Docker.
// La logique de l'API est partagée avec la fonction Supabase de production (supabase/functions/api/handler.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../supabase/functions/api/handler.js';

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
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, product_id TEXT NOT NULL,
    amount REAL NOT NULL, memo TEXT NOT NULL, payment_id TEXT UNIQUE,
    txid TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL
  );
`);
const store = {
  kind: 'sqlite',
  async getOrder(paymentId) { return db.prepare('SELECT * FROM orders WHERE payment_id = ?').get(paymentId); },
  async insertOrder(o) {
    db.prepare('INSERT INTO orders (id, username, product_id, amount, memo, payment_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(o.id, o.username, o.product_id, o.amount, o.memo, o.payment_id, o.status, o.created_at);
  },
  async completeOrder(paymentId, txid) { db.prepare("UPDATE orders SET txid = ?, status = 'completed' WHERE payment_id = ?").run(txid, paymentId); },
  async cancelOrder(paymentId) { db.prepare("UPDATE orders SET status = 'cancelled' WHERE payment_id = ? AND status != 'completed'").run(paymentId); }
};

// Catalogue : supabase/functions/api/catalogue.json, validé par le promoteur.
const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/functions/api/catalogue.json'), 'utf8')).items;
const api = createApi({
  catalogue, store,
  piApiKey: env.PI_API_KEY || '',
  sandbox: piSandbox, network: piNetwork,
  validationKey: env.PI_VALIDATION_KEY || '',
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
    // Sur ce serveur, l'interface appelle l'API sur le même domaine.
    if (req.method === 'GET' && url.pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', ...securityHeaders });
      return res.end("window.BSME_API_BASE = '';\n");
    }
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
