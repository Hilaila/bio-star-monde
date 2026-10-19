import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

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

const products = [
  { id: 'formation-sol-vivant', name: 'Formation : comprendre le sol vivant', category: 'Formation', amount: 0.1, currency: 'Pi', description: 'Contenu de démonstration à remplacer par la formation réelle.' },
  { id: 'guide-agroecologie', name: 'Guide pratique d’agroécologie', category: 'Guide', amount: 0.05, currency: 'Pi', description: 'Produit de démonstration. Vérifiez le contenu avant toute vente.' },
  { id: 'diagnostic-parcelle', name: 'Diagnostic initial de parcelle', category: 'Service', amount: 0.2, currency: 'Pi', description: 'Exemple de service à personnaliser selon vos capacités réelles.' }
];

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store',
    ...extra
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function json(res, status, body) { send(res, status, body); }
function readBody(req, limit = 32_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) { reject(new Error('Requête trop volumineuse')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}
function requirePiConfig() {
  if (!env.PI_API_KEY) throw new Error('PI_API_KEY non configurée côté serveur');
}
async function piApi(endpoint, options = {}) {
  requirePiConfig();
  const response = await fetch('https://api.minepi.com/v2' + endpoint, {
    ...options,
    headers: { Authorization: 'Key ' + env.PI_API_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const err = new Error('API Pi a répondu HTTP ' + response.status);
    err.status = response.status;
    throw err;
  }
  return data;
}
async function piMe(accessToken) {
  if (typeof accessToken !== 'string' || accessToken.length < 10 || accessToken.length > 4096) throw new Error('Jeton Pi manquant ou invalide');
  const response = await fetch('https://api.minepi.com/v2/me', { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!response.ok) throw new Error('Vérification du compte Pi impossible (HTTP ' + response.status + ')');
  const me = await response.json();
  if (!me.uid || !me.username) throw new Error('Réponse du compte Pi incomplète');
  return me;
}
function getProduct(id) { return products.find(p => p.id === id); }
function publicProduct(p) { return { ...p }; }
function validPaymentId(id) { return typeof id === 'string' && id.length > 0 && id.length <= 256; }
function getOrder(paymentId) { return db.prepare('SELECT * FROM orders WHERE payment_id = ?').get(paymentId); }
function isCancelled(payment) { return Boolean(payment.status?.cancelled || payment.status?.user_cancelled); }
function markCancelled(paymentId) { db.prepare("UPDATE orders SET status = 'cancelled' WHERE payment_id = ? AND status != 'completed'").run(paymentId); }

// Finalise une commande approuvée. Le txid de référence est celui enregistré par l'API Pi ;
// celui du navigateur ne sert que si l'API ne l'a pas encore renvoyé (l'API Pi le vérifie à la finalisation).
async function finalizeOrder(order, payment, paymentId, clientTxid) {
  const piTxid = payment.transaction?.txid;
  if (piTxid && clientTxid && piTxid !== clientTxid) return { ok: false, httpStatus: 409, error: 'La transaction ne correspond pas à celle enregistrée par Pi.' };
  const txid = piTxid || (typeof clientTxid === 'string' && clientTxid.length <= 256 ? clientTxid : '');
  if (!txid) return { ok: false, httpStatus: 409, error: 'Transaction absente : le paiement n’a pas encore été signé.' };
  if (Number(payment.amount) !== order.amount) return { ok: false, httpStatus: 400, error: 'Montant inattendu.' };
  if (!payment.status?.developer_completed) {
    await piApi('/payments/' + encodeURIComponent(paymentId) + '/complete', { method: 'POST', body: JSON.stringify({ txid }) });
  }
  db.prepare('UPDATE orders SET txid = ?, status = ? WHERE payment_id = ?').run(txid, 'completed', paymentId);
  return { ok: true };
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { sandbox: piSandbox, network: piNetwork });
  if (req.method === 'GET' && url.pathname === '/api/products') return json(res, 200, { products: products.map(publicProduct) });
  if (req.method === 'GET' && url.pathname === '/api/me') return json(res, 200, { authenticated: false, message: 'Connectez-vous avec Pi Browser.' });

  if (req.method === 'POST' && url.pathname === '/api/pi-auth') {
    const body = await readBody(req);
    const me = await piMe(body.accessToken);
    return json(res, 200, { ok: true, uid: me.uid, username: me.username });
  }

  if (req.method === 'POST' && url.pathname === '/api/payments/approve') {
    const body = await readBody(req);
    const me = await piMe(body.accessToken);
    const product = getProduct(body.productId);
    if (!product) return json(res, 400, { error: 'Produit inconnu.' });
    if (!validPaymentId(body.paymentId)) return json(res, 400, { error: 'Identifiant de paiement invalide.' });
    const existing = getOrder(body.paymentId);
    if (existing) {
      if (existing.username !== me.username || existing.product_id !== product.id) return json(res, 409, { error: 'Paiement déjà associé à une autre commande.' });
      return json(res, 200, { ok: true, status: existing.status });
    }
    const payment = await piApi('/payments/' + encodeURIComponent(body.paymentId));
    if (payment.user_uid !== me.uid) return json(res, 403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
    if (Number(payment.amount) !== product.amount) return json(res, 400, { error: 'Le montant du paiement ne correspond pas au prix enregistré côté serveur.' });
    if (isCancelled(payment)) return json(res, 409, { error: 'Ce paiement a été annulé.' });
    if (payment.status?.developer_approved || payment.status?.developer_completed) return json(res, 409, { error: 'Ce paiement a déjà été traité.' });
    await piApi('/payments/' + encodeURIComponent(body.paymentId) + '/approve', { method: 'POST', body: '{}' });
    const orderId = crypto.randomUUID();
    db.prepare('INSERT INTO orders (id, username, product_id, amount, memo, payment_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(orderId, me.username, product.id, product.amount, product.name, body.paymentId, 'approved', new Date().toISOString());
    return json(res, 200, { ok: true, orderId, status: 'approved' });
  }

  if (req.method === 'POST' && url.pathname === '/api/payments/complete') {
    const body = await readBody(req);
    const me = await piMe(body.accessToken);
    if (!validPaymentId(body.paymentId) || !body.txid || typeof body.txid !== 'string') return json(res, 400, { error: 'Identifiant de paiement ou transaction manquant.' });
    const order = getOrder(body.paymentId);
    if (!order || order.username !== me.username) return json(res, 404, { error: 'Commande approuvée introuvable pour ce compte.' });
    if (order.status === 'completed') return json(res, 200, { ok: true, status: 'completed' });
    const payment = await piApi('/payments/' + encodeURIComponent(body.paymentId));
    if (payment.user_uid !== me.uid) return json(res, 403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
    if (isCancelled(payment)) { markCancelled(body.paymentId); return json(res, 409, { error: 'Ce paiement a été annulé.' }); }
    const result = await finalizeOrder(order, payment, body.paymentId, body.txid);
    if (!result.ok) return json(res, result.httpStatus, { error: result.error });
    return json(res, 200, { ok: true, status: 'completed', message: 'Paiement confirmé par l’API Pi. Livrez le produit après vérification.' });
  }

  // Paiement signé mais non finalisé (fermeture de l'application, coupure réseau…).
  // Signalé par Pi.authenticate ; à traiter, sinon l'utilisateur ne peut plus payer.
  if (req.method === 'POST' && url.pathname === '/api/payments/incomplete') {
    const body = await readBody(req);
    const me = await piMe(body.accessToken);
    if (!validPaymentId(body.paymentId)) return json(res, 400, { error: 'Identifiant de paiement invalide.' });
    const payment = await piApi('/payments/' + encodeURIComponent(body.paymentId));
    if (payment.user_uid !== me.uid) return json(res, 403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
    let order = getOrder(body.paymentId);
    if (order && order.username !== me.username) return json(res, 403, { error: 'Cette commande appartient à un autre compte.' });
    if (isCancelled(payment)) { markCancelled(body.paymentId); return json(res, 200, { ok: true, status: 'cancelled' }); }
    if (order?.status === 'completed') return json(res, 200, { ok: true, status: 'completed' });
    if (!payment.transaction?.txid && !body.txid) return json(res, 200, { ok: true, status: 'pending', message: 'Paiement non signé : il sera annulé au prochain paiement.' });
    if (!order) {
      // Paiement approuvé auprès de Pi mais commande absente de la base (arrêt du serveur, par exemple).
      const product = getProduct(payment.metadata?.productId);
      if (!payment.status?.developer_approved || !product || Number(payment.amount) !== product.amount) {
        console.error(new Date().toISOString(), 'Paiement incomplet sans commande correspondante', body.paymentId);
        return json(res, 409, { error: 'Paiement incomplet sans commande correspondante : vérification manuelle nécessaire.' });
      }
      db.prepare('INSERT INTO orders (id, username, product_id, amount, memo, payment_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), me.username, product.id, product.amount, product.name, body.paymentId, 'approved', new Date().toISOString());
      order = getOrder(body.paymentId);
    }
    const result = await finalizeOrder(order, payment, body.paymentId, body.txid);
    if (!result.ok) return json(res, result.httpStatus, { error: result.error });
    return json(res, 200, { ok: true, status: 'completed', message: 'Paiement précédent finalisé.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/payments/cancel') {
    const body = await readBody(req);
    const me = await piMe(body.accessToken);
    if (!body.paymentId || typeof body.paymentId !== 'string') return json(res, 400, { error: 'Identifiant de paiement manquant.' });
    const order = getOrder(body.paymentId);
    if (order && order.username !== me.username) return json(res, 403, { error: 'Cette commande appartient à un autre compte.' });
    if (order) markCancelled(body.paymentId);
    return json(res, 200, { ok: true, status: 'cancelled' });
  }
  return json(res, 404, { error: 'Route API inconnue.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, appUrl);
    if (req.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/api/health')) {
      return json(res, 200, { ok: true, app: 'Bio Star Monde Éden', network: piNetwork, environment: piSandbox ? 'sandbox-configured' : 'non-sandbox', piApiKeyConfigured: Boolean(env.PI_API_KEY), database: 'sqlite' });
    }
    if (req.method === 'GET' && url.pathname === '/validation-key.txt') {
      if (!env.PI_VALIDATION_KEY) return send(res, 404, 'Clé de validation non configurée.\n', 'text/plain; charset=utf-8');
      return send(res, 200, env.PI_VALIDATION_KEY + '\n', 'text/plain; charset=utf-8');
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Méthode non autorisée.' }, 'application/json; charset=utf-8', { Allow: 'GET, HEAD' });

    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(ROOT, 'public', rel);
    if (!file.startsWith(path.resolve(ROOT, 'public') + path.sep)) return send(res, 403, 'Interdit');
    let stat;
    try { stat = fs.statSync(file); } catch { return send(res, 404, 'Page introuvable', 'text/plain; charset=utf-8'); }
    if (!stat.isFile()) return send(res, 404, 'Page introuvable', 'text/plain; charset=utf-8');
    const ext = path.extname(file);
    const headers = isProd ? { 'Content-Security-Policy': "default-src 'self'; script-src 'self' https://sdk.minepi.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.minepi.com https://sdk.minepi.com; base-uri 'self'; form-action 'self'; frame-ancestors " + frameAncestors } : {};
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...headers });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    const status = err.status || (err.message?.includes('non configurée') ? 503 : 400);
    console.error(new Date().toISOString(), req.method, req.url, err.message);
    return json(res, status, { error: isProd ? 'Requête impossible. Vérifiez la configuration et les journaux serveur.' : err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Bio Star Monde Éden disponible sur http://localhost:' + PORT);
  console.log('Réseau Pi :', piNetwork, '— Mode Sandbox :', piSandbox);
  if (!fs.existsSync(path.join(ROOT, '.env'))) console.warn('ATTENTION : fichier .env absent. Copiez .env.example en .env.');
});
process.on('SIGINT', () => { server.close(() => { db.close(); process.exit(0); }); });
process.on('SIGTERM', () => { server.close(() => { db.close(); process.exit(0); }); });
