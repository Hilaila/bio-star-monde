// Fonction Appwrite de Bio Star Monde Éden : sert les pages (public/) et l'API Pi (core/handler.js) sur un seul domaine.
// Réglages de la fonction (console Appwrite) :
//   Entrée : appwrite/main.js — Dossier racine : ./ — Environnement : Node.js 22 — Exécution : « Any »
//   Portées : databases, tables, columns, indexes, rows (lecture et écriture)
//   Variables : PI_API_KEY (secrète) ; facultatives : PI_NETWORK (testnet|mainnet), PI_SANDBOX (true|false), PI_VALIDATION_KEY
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from '../core/handler.js';
import { createAppwriteStore } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, '../public');
const catalogue = JSON.parse(await fs.readFile(path.resolve(here, '../core/catalogue.json'), 'utf8')).items;

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
// Le Sandbox et le Pi Browser affichent l'application dans un cadre : frame-ancestors autorise les domaines Pi.
const CSP = "default-src 'self'; script-src 'self' https://sdk.minepi.com https://*.minepi.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.minepi.com https://*.minepi.com; frame-src https://*.minepi.com; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.minepi.com https://*.pinet.com";

export default async ({ req, res, log, error }) => {
  const env = process.env;
  const store = createAppwriteStore({
    endpoint: env.APPWRITE_FUNCTION_API_ENDPOINT,
    projectId: env.APPWRITE_FUNCTION_PROJECT_ID,
    key: req.headers['x-appwrite-key'] || ''
  });
  const api = createApi({
    catalogue, store,
    piApiKey: env.PI_API_KEY || '',
    sandbox: env.PI_SANDBOX === 'true',
    network: env.PI_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
    validationKey: env.PI_VALIDATION_KEY || '',
    exposeErrors: false,
    log: (...parts) => error(parts.join(' '))
  });

  // Préparation de la base (à ouvrir une fois après le déploiement) : crée la base, la table, les colonnes et les index.
  if (req.method === 'GET' && req.path === '/api/setup') {
    try {
      await store.prepare();
      return res.json({ ok: true, message: 'Base prête : biostar / orders.' }, 200, SECURITY);
    } catch (e) {
      error('Préparation de la base : ' + e.message);
      return res.json({ ok: false, error: 'Préparation impossible. Consultez les journaux de la fonction (portées, délai).' }, 500, SECURITY);
    }
  }

  const url = `https://${req.host || 'localhost'}${req.path || '/'}${req.queryString ? '?' + req.queryString : ''}`;
  const skip = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);
  const headers = Object.entries(req.headers || {}).filter(([k, v]) => typeof v === 'string' && !k.startsWith('x-appwrite') && !skip.has(k));
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = req.bodyText ?? '';
  const response = await api(new Request(url, init));
  if (response) {
    return res.text(await response.text(), response.status, { ...Object.fromEntries(response.headers), ...SECURITY });
  }

  if (req.method !== 'GET') return res.json({ error: 'Méthode non autorisée.' }, 405, SECURITY);
  let rel;
  try { rel = req.path === '/' || !req.path ? 'index.html' : decodeURIComponent(req.path).replace(/^\/+/, ''); }
  catch { return res.text('Adresse invalide', 400, { 'Content-Type': 'text/plain; charset=utf-8' }); }
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return res.text('Interdit', 403, { 'Content-Type': 'text/plain; charset=utf-8' });
  try {
    const content = await fs.readFile(file, 'utf8');
    return res.text(content, 200, {
      'Content-Type': MIME[path.extname(file)] || 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Content-Security-Policy': CSP,
      ...SECURITY
    });
  } catch {
    log('Page introuvable : ' + req.path);
    return res.text('Page introuvable', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
};
