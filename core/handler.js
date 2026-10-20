// Cœur de l'API Bio Star Monde Éden.
// Utilisé tel quel par la fonction Appwrite (production) et par le serveur Node (local, Docker).
// Uniquement des API web standard : Request, Response, fetch, crypto.randomUUID.

import { EVENT_TYPES } from './schema.js';

const PI_API = 'https://api.minepi.com/v2';

// Codes de lot : « BSME- » suivi de 8 caractères sans 0, O, 1, I ni L, pour être recopiés sans erreur.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_RE = new RegExp('^BSME-[' + CODE_ALPHABET + ']{8}$');
// Codes d'attestation : « ATT- » suivi de 8 caractères du même alphabet.
const ATTESTATION_RE = new RegExp('^ATT-[' + CODE_ALPHABET + ']{8}$');
export const UNITS = ['kg', 't', 'sac', 'litre', 'unité', 'botte', 'plateau', 'tête'];
const LIMITS = { plots: 50, lots: 500, events: 200, ownerEvents: 3000, progress: 500, attestations: 50, openAdvice: 20, messages: 100, adminRows: 300 };

export function newLotCode() {
  let out = '';
  while (out.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(12))) {
      if (b < 248 && out.length < 8) out += CODE_ALPHABET[b % 31];
    }
  }
  return 'BSME-' + out;
}
export function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
function randomCode(length) {
  let out = '';
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length + 4))) {
      if (b < 248 && out.length < length) out += CODE_ALPHABET[b % 31];
    }
  }
  return out;
}
export function normalizeAttestationCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return ATTESTATION_RE.test(code) ? code : null;
}
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Contenus de BioStar Academy (core/academy.json) : uniquement pour des formations du catalogue.
export function validateAcademy(academy, products) {
  const courses = (academy && academy.courses) || {};
  for (const [id, course] of Object.entries(courses)) {
    const product = products.find((p) => p.id === id);
    if (!product || product.category !== 'Formation') throw new Error('Académie : formation inconnue dans le catalogue : ' + id);
    if (!Array.isArray(course.modules) || !course.modules.length) throw new Error('Académie : aucun module pour ' + id);
    for (const m of course.modules) {
      if (typeof m.title !== 'string' || !m.title.trim() || !Array.isArray(m.points) || !m.points.length) throw new Error('Académie : module incomplet dans ' + id);
    }
  }
  return courses;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Le prix de référence d'un paiement est toujours celui du catalogue, jamais celui envoyé par le navigateur.
export function validateCatalogue(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Catalogue vide ou mal formé');
  const ids = new Set();
  return items.map((p) => {
    if (typeof p.id !== 'string' || !/^[a-z0-9-]{3,64}$/.test(p.id) || ids.has(p.id)) throw new Error('Catalogue : identifiant invalide ou en double : ' + p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) throw new Error('Catalogue : nom invalide pour ' + p.id);
    if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) throw new Error('Catalogue : montant invalide pour ' + p.id);
    ids.add(p.id);
    return { ...p, currency: 'Pi' };
  });
}

// Liste des comptes Pi autorisés à l'administration, par exemple « 4Nathanel, Hilaila » (sans @, casse ignorée).
export function parseAdminUsernames(value) {
  return String(value || '').split(/[\s,;]+/).map((u) => u.replace(/^@/, '').trim().toLowerCase()).filter(Boolean);
}

const round = (n) => Math.round(n * 1e7) / 1e7;

// store : { kind, getOrder(paymentId), insertOrder(order), completeOrder(paymentId, txid), cancelOrder(paymentId),
//           listOrders({ username?, limit }) } — méthodes asynchrones ; listOrders renvoie les plus récentes d'abord.
export function createApi({ catalogue, academy = { courses: {} }, store, piApiKey = '', sandbox = false, network = 'testnet', validationKey = '', adminUsernames = [], exposeErrors = false, fetchImpl, log = (...a) => console.error(...a) }) {
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);
  const products = validateCatalogue(catalogue);
  const getProduct = (id) => products.find((p) => p.id === id);
  const courses = validateAcademy(academy, products);
  const admins = new Set(adminUsernames.map((u) => String(u).toLowerCase()));
  const isAdmin = (me) => admins.has(String(me.username).toLowerCase());
  // Vue d'une commande renvoyée au navigateur ; le nom d'utilisateur n'est ajouté que pour l'administration.
  function orderView(o, withUser) {
    const product = getProduct(o.product_id);
    const view = {
      paymentId: o.payment_id, productId: o.product_id, name: product?.name || o.memo, category: product?.category || '',
      amount: Number(o.amount), status: o.status, createdAt: o.created_at, txid: o.txid || null
    };
    if (withUser) view.username = o.username;
    return view;
  }
  const byDateDesc = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
  const validPaymentId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 128;
  const isCancelled = (payment) => Boolean(payment.status?.cancelled || payment.status?.user_cancelled);

  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }
  async function readBody(request) {
    const text = await request.text();
    if (text.length > 32_000) throw new HttpError(413, 'Requête trop volumineuse');
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new HttpError(400, 'JSON invalide'); }
  }
  async function piApi(endpoint, options = {}) {
    if (!piApiKey) throw new HttpError(503, 'PI_API_KEY non configurée côté serveur');
    const response = await doFetch(PI_API + endpoint, {
      ...options,
      headers: { Authorization: 'Key ' + piApiKey, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) throw new HttpError(response.status, 'API Pi a répondu HTTP ' + response.status);
    return data;
  }
  async function piMe(accessToken) {
    if (typeof accessToken !== 'string' || accessToken.length < 10 || accessToken.length > 4096) throw new HttpError(400, 'Jeton Pi manquant ou invalide');
    const response = await doFetch(PI_API + '/me', { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!response.ok) throw new HttpError(400, 'Vérification du compte Pi impossible (HTTP ' + response.status + ')');
    const me = await response.json();
    if (!me.uid || !me.username) throw new HttpError(400, 'Réponse du compte Pi incomplète');
    return me;
  }
  const getPayment = (paymentId) => piApi('/payments/' + encodeURIComponent(paymentId));

  // Finalise une commande approuvée. Le txid de référence est celui enregistré par l'API Pi ;
  // celui du navigateur ne sert que si l'API ne l'a pas encore renvoyé (l'API Pi le vérifie à la finalisation).
  async function finalizeOrder(order, payment, paymentId, clientTxid) {
    const piTxid = payment.transaction?.txid;
    if (piTxid && clientTxid && piTxid !== clientTxid) return { ok: false, httpStatus: 409, error: 'La transaction ne correspond pas à celle enregistrée par Pi.' };
    const txid = piTxid || (typeof clientTxid === 'string' && clientTxid.length <= 256 ? clientTxid : '');
    if (!txid) return { ok: false, httpStatus: 409, error: 'Transaction absente : le paiement n’a pas encore été signé.' };
    if (Number(payment.amount) !== Number(order.amount)) return { ok: false, httpStatus: 400, error: 'Montant inattendu.' };
    if (!payment.status?.developer_completed) {
      await piApi('/payments/' + encodeURIComponent(paymentId) + '/complete', { method: 'POST', body: JSON.stringify({ txid }) });
    }
    await store.completeOrder(paymentId, txid);
    return { ok: true };
  }
  function newOrder(me, product, paymentId) {
    return { id: crypto.randomUUID(), username: me.username, product_id: product.id, amount: product.amount, memo: product.name, payment_id: paymentId, status: 'approved', created_at: new Date().toISOString() };
  }


  // --- Contrôle des saisies (exploitation, parcelles, lots) ---
  function cleanText(value, max, label, required = false, multiline = false) {
    if (value === undefined || value === null || value === '') {
      if (required) throw new HttpError(400, 'Champ obligatoire : ' + label + '.');
      return null;
    }
    if (typeof value !== 'string') throw new HttpError(400, 'Champ invalide : ' + label + '.');
    const controls = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
    const t = value.replace(controls, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!t) {
      if (required) throw new HttpError(400, 'Champ obligatoire : ' + label + '.');
      return null;
    }
    if (t.length > max) throw new HttpError(400, label + ' : ' + max + ' caractères au maximum.');
    return t;
  }
  function optNumber(value, label, max = 1e6) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(typeof value === 'string' ? value.replace(',', '.') : value);
    if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, 'Valeur invalide : ' + label + '.');
    return Math.round(n * 1e4) / 1e4;
  }
  function isoDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Date invalide (format AAAA-MM-JJ).');
    const d = new Date(value + 'T00:00:00.000Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new HttpError(400, 'Date invalide.');
    if (d.getUTCFullYear() < 2000) throw new HttpError(400, 'Date trop ancienne.');
    if (d.getTime() > Date.now() + 36 * 3600 * 1000) throw new HttpError(400, 'La date ne peut pas être dans le futur.');
    return d.toISOString();
  }
  const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9-]{1,36}$/.test(id);

  // --- Vues renvoyées au navigateur ---
  const farmView = (f) => f && ({
    id: f.id, name: f.name, country: f.country, region: f.region, locality: f.locality || '', areaHa: f.area_ha ?? null,
    practices: f.practices || '', showTraining: Boolean(f.show_training), createdAt: f.created_at, updatedAt: f.updated_at
  });
  const plotView = (p) => ({ id: p.id, name: p.name, areaHa: p.area_ha ?? null, soil: p.soil || '', crop: p.crop || '' });
  const eventView = (e) => ({ type: e.type, date: e.date, note: e.note || '', createdAt: e.created_at });
  const byEventDate = (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at).localeCompare(String(b.created_at));
  const myFarm = async (me) => (await store.find('farms', { owner: me.username }, 1))[0] || null;

  // Lien Academy → exploitation : formations dont l'inscription est confirmée.
  async function trainingsOf(username) {
    const names = new Set();
    for (const o of await store.listOrders({ username, limit: 200 })) {
      const product = getProduct(o.product_id);
      if (o.username === username && o.status === 'completed' && product?.category === 'Formation') names.add(product.name);
    }
    return [...names];
  }

  // Attestations obtenues, telles qu'affichées sur la page publique d'un lot : intitulé et date, sans code ni compte.
  async function attestationsOf(username) {
    return (await store.find('attestations', { owner: username }, LIMITS.attestations))
      .filter((a) => a.status === 'valid')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((a) => ({ courseTitle: a.course_title, issuedAt: a.created_at }));
  }

  // --- BioStar Academy : progression, modules pratiques validés par le formateur, attestations ---
  async function enrolledCourses(username) {
    const ids = new Set();
    for (const o of await store.listOrders({ username, limit: 200 })) {
      if (o.username === username && o.status === 'completed' && courses[o.product_id]) ids.add(o.product_id);
    }
    return ids;
  }
  const progressId = async (owner, courseId, index) => 'p' + (await sha256Hex(owner + '|' + courseId + '|' + index)).slice(0, 32);
  const attestationView = (a) => ({ code: a.id, courseId: a.course_id, courseTitle: a.course_title, issuedAt: a.created_at, hash: a.hash, status: a.status });
  function moduleIndexOf(courseId, value) {
    const index = Number(value);
    if (!courses[courseId] || !Number.isInteger(index) || index < 0 || index >= courses[courseId].modules.length) throw new HttpError(400, 'Module inconnu.');
    return index;
  }
  async function setProgress(owner, courseId, index, status) {
    const id = await progressId(owner, courseId, index);
    const now = new Date().toISOString();
    const row = await store.get('progress', id);
    if (row) await store.update('progress', id, { status, updated_at: now });
    else {
      try { await store.insert('progress', { id, owner, course_id: courseId, module_index: index, status, created_at: now, updated_at: now }); }
      catch (e) { if (!e.duplicate) throw e; await store.update('progress', id, { status, updated_at: now }); }
    }
  }
  async function progressMap(owner) {
    const map = new Map();
    for (const r of await store.find('progress', { owner }, LIMITS.progress)) map.set(r.course_id + '|' + Number(r.module_index), r.status);
    return map;
  }
  async function attestationOf(owner, courseId) {
    return (await store.find('attestations', { owner, course_id: courseId }, 1))[0] || null;
  }
  // Délivre l'attestation quand tous les modules du cours sont terminés (une seule par compte et par cours).
  async function issueIfComplete(owner, courseId) {
    const existing = await attestationOf(owner, courseId);
    if (existing) return existing;
    const map = await progressMap(owner);
    const course = courses[courseId];
    if (!course.modules.every((_, i) => map.get(courseId + '|' + i) === 'done')) return null;
    const product = getProduct(courseId);
    const now = new Date().toISOString();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = 'ATT-' + randomCode(8);
      const row = { id: code, owner, course_id: courseId, course_title: product.name, hash: await sha256Hex([code, owner, courseId, now].join('|')), status: 'valid', created_at: now };
      try { await store.insert('attestations', row); return row; } catch (e) {
        if (!e.duplicate) throw e;
        const again = await attestationOf(owner, courseId);
        if (again) return again;
      }
    }
    throw new HttpError(500, 'Création de l’attestation impossible.');
  }
  function courseView(courseId, map, enrolled, attestation, preview) {
    const product = getProduct(courseId);
    const course = courses[courseId];
    const open = enrolled || preview;
    const modules = course.modules.map((m, index) => ({
      index, title: m.title, format: m.format || '', practical: Boolean(m.practical),
      status: map.get(courseId + '|' + index) === 'todo' ? null : (map.get(courseId + '|' + index) || null),
      points: open ? m.points : null
    }));
    return {
      id: courseId, name: product.name, duration: product.duration || '', format: product.format || '', amount: product.amount,
      enrolled, preview: !enrolled && preview, done: modules.filter((m) => m.status === 'done').length, total: modules.length,
      attestation: attestation ? attestationView(attestation) : null, modules
    };
  }
  const adviceView = (a, withUser) => {
    const v = { id: a.id, crop: a.crop, symptom: a.symptom || '', cause: a.cause || '', message: a.message || '', status: a.status, answer: a.answer || '', createdAt: a.created_at, answeredAt: a.answered_at || null };
    if (withUser) v.username = a.owner;
    return v;
  };
  const byCreatedDesc = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

  const routes = {
    'GET /api/config': async () => json(200, { sandbox, network }),
    'GET /api/products': async () => json(200, { products }),
    'GET /api/me': async () => json(200, { authenticated: false, message: 'Connectez-vous avec Pi Browser.' }),

    'POST /api/pi-auth': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      return json(200, { ok: true, uid: me.uid, username: me.username, isAdmin: isAdmin(me) });
    },

    // Espace apprenant : les inscriptions du compte Pi connecté, et seulement les siennes.
    'POST /api/my-orders': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const orders = (await store.listOrders({ username: me.username, limit: 200 })).filter((o) => o.username === me.username).sort(byDateDesc);
      return json(200, { ok: true, username: me.username, orders: orders.map((o) => orderView(o, false)) });
    },

    // Administration : toutes les inscriptions et les totaux, réservés aux comptes listés dans ADMIN_USERNAMES.
    'POST /api/admin/orders': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!isAdmin(me)) return json(403, { error: 'Espace réservé au promoteur.' });
      const orders = (await store.listOrders({ limit: 2000 })).sort(byDateDesc);
      const summary = { orders: orders.length, completed: 0, pending: 0, cancelled: 0, totalPi: 0, byProduct: [] };
      const perProduct = new Map();
      for (const o of orders) {
        if (o.status === 'completed') {
          summary.completed++;
          summary.totalPi = round(summary.totalPi + Number(o.amount));
          const line = perProduct.get(o.product_id) || { productId: o.product_id, name: getProduct(o.product_id)?.name || o.memo, completed: 0, totalPi: 0 };
          line.completed++;
          line.totalPi = round(line.totalPi + Number(o.amount));
          perProduct.set(o.product_id, line);
        } else if (o.status === 'cancelled') summary.cancelled++;
        else summary.pending++;
      }
      summary.byProduct = [...perProduct.values()].sort((a, b) => b.totalPi - a.totalPi);
      const [farms, plots, lots, events] = await Promise.all(['farms', 'plots', 'lots', 'lot_events'].map((t) => store.count(t)));
      return json(200, { ok: true, network, summary, chain: { farms, plots, lots, events }, orders: orders.map((o) => orderView(o, true)) });
    },

    'POST /api/payments/approve': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const product = getProduct(body.productId);
      if (!product) return json(400, { error: 'Produit inconnu.' });
      if (!validPaymentId(body.paymentId)) return json(400, { error: 'Identifiant de paiement invalide.' });
      const existing = await store.getOrder(body.paymentId);
      if (existing) {
        if (existing.username !== me.username || existing.product_id !== product.id) return json(409, { error: 'Paiement déjà associé à une autre commande.' });
        return json(200, { ok: true, status: existing.status });
      }
      const payment = await getPayment(body.paymentId);
      if (payment.user_uid !== me.uid) return json(403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
      if (Number(payment.amount) !== product.amount) return json(400, { error: 'Le montant du paiement ne correspond pas au prix enregistré côté serveur.' });
      if (isCancelled(payment)) return json(409, { error: 'Ce paiement a été annulé.' });
      if (payment.status?.developer_approved || payment.status?.developer_completed) return json(409, { error: 'Ce paiement a déjà été traité.' });
      await piApi('/payments/' + encodeURIComponent(body.paymentId) + '/approve', { method: 'POST', body: '{}' });
      const order = newOrder(me, product, body.paymentId);
      await store.insertOrder(order);
      return json(200, { ok: true, orderId: order.id, status: 'approved' });
    },

    'POST /api/payments/complete': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!validPaymentId(body.paymentId) || !body.txid || typeof body.txid !== 'string') return json(400, { error: 'Identifiant de paiement ou transaction manquant.' });
      const order = await store.getOrder(body.paymentId);
      if (!order || order.username !== me.username) return json(404, { error: 'Commande approuvée introuvable pour ce compte.' });
      if (order.status === 'completed') return json(200, { ok: true, status: 'completed' });
      const payment = await getPayment(body.paymentId);
      if (payment.user_uid !== me.uid) return json(403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
      if (isCancelled(payment)) { await store.cancelOrder(body.paymentId); return json(409, { error: 'Ce paiement a été annulé.' }); }
      const result = await finalizeOrder(order, payment, body.paymentId, body.txid);
      if (!result.ok) return json(result.httpStatus, { error: result.error });
      return json(200, { ok: true, status: 'completed', message: 'Paiement confirmé par l’API Pi. Livrez le produit après vérification.' });
    },

    // Paiement signé mais non finalisé (fermeture de l'application, coupure réseau…).
    // Signalé par Pi.authenticate ; à traiter, sinon l'utilisateur ne peut plus payer.
    'POST /api/payments/incomplete': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!validPaymentId(body.paymentId)) return json(400, { error: 'Identifiant de paiement invalide.' });
      const payment = await getPayment(body.paymentId);
      if (payment.user_uid !== me.uid) return json(403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
      let order = await store.getOrder(body.paymentId);
      if (order && order.username !== me.username) return json(403, { error: 'Cette commande appartient à un autre compte.' });
      if (isCancelled(payment)) { await store.cancelOrder(body.paymentId); return json(200, { ok: true, status: 'cancelled' }); }
      if (order?.status === 'completed') return json(200, { ok: true, status: 'completed' });
      if (!payment.transaction?.txid && !body.txid) return json(200, { ok: true, status: 'pending', message: 'Paiement non signé : il sera annulé au prochain paiement.' });
      if (!order) {
        // Paiement approuvé auprès de Pi mais commande absente de la base (arrêt du serveur, par exemple).
        const product = getProduct(payment.metadata?.productId);
        if (!payment.status?.developer_approved || !product || Number(payment.amount) !== product.amount) {
          log(new Date().toISOString(), 'Paiement incomplet sans commande correspondante', body.paymentId);
          return json(409, { error: 'Paiement incomplet sans commande correspondante : vérification manuelle nécessaire.' });
        }
        await store.insertOrder(newOrder(me, product, body.paymentId));
        order = await store.getOrder(body.paymentId);
      }
      const result = await finalizeOrder(order, payment, body.paymentId, body.txid);
      if (!result.ok) return json(result.httpStatus, { error: result.error });
      return json(200, { ok: true, status: 'completed', message: 'Paiement précédent finalisé.' });
    },

    // --- Socle de la chaîne : exploitation, parcelles, lots et étapes (BioFarm Manager, BioTrace) ---
    'POST /api/farm': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const farm = await myFarm(me);
      const trainings = await trainingsOf(me.username);
      const attestations = await attestationsOf(me.username);
      if (!farm) return json(200, { ok: true, farm: null, plots: [], lots: [], trainings, attestations });
      const [plots, lots, events] = await Promise.all([
        store.find('plots', { owner: me.username }, LIMITS.plots),
        store.find('lots', { owner: me.username }, LIMITS.lots),
        store.find('lot_events', { owner: me.username }, LIMITS.ownerEvents)
      ]);
      const plotName = new Map(plots.map((p) => [p.id, p.name]));
      const eventsByLot = new Map();
      for (const e of events.sort(byEventDate)) {
        if (!eventsByLot.has(e.lot_id)) eventsByLot.set(e.lot_id, []);
        eventsByLot.get(e.lot_id).push(eventView(e));
      }
      return json(200, {
        ok: true, farm: farmView(farm), trainings, attestations,
        plots: plots.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(plotView),
        lots: lots.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((l) => ({
          code: l.id, product: l.product, quantity: l.quantity ?? null, unit: l.unit || '', plotId: l.plot_id || null,
          plotName: plotName.get(l.plot_id) || '', createdAt: l.created_at, events: eventsByLot.get(l.id) || []
        }))
      });
    },

    'POST /api/farm/save': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const input = body.farm || {};
      const now = new Date().toISOString();
      const data = {
        name: cleanText(input.name, 120, 'nom de l’exploitation', true),
        country: cleanText(input.country, 60, 'pays', true),
        region: cleanText(input.region, 80, 'région', true),
        locality: cleanText(input.locality, 80, 'village ou commune'),
        area_ha: optNumber(input.areaHa, 'superficie'),
        practices: cleanText(input.practices, 500, 'pratiques', false, true),
        show_training: input.showTraining === true,
        updated_at: now
      };
      const existing = await myFarm(me);
      if (existing) {
        await store.update('farms', existing.id, data);
        return json(200, { ok: true, farm: farmView({ ...existing, ...data }) });
      }
      const farm = { id: crypto.randomUUID(), owner: me.username, created_at: now, ...data };
      try { await store.insert('farms', farm); } catch (e) {
        if (e.duplicate) return json(409, { error: 'Votre exploitation existe déjà : actualisez la page.' });
        throw e;
      }
      return json(200, { ok: true, farm: farmView(farm) });
    },

    'POST /api/plots/save': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const farm = await myFarm(me);
      if (!farm) return json(409, { error: 'Créez d’abord la fiche de votre exploitation.' });
      const input = body.plot || {};
      const now = new Date().toISOString();
      const data = {
        name: cleanText(input.name, 80, 'nom de la parcelle', true),
        area_ha: optNumber(input.areaHa, 'superficie'),
        soil: cleanText(input.soil, 80, 'type de sol'),
        crop: cleanText(input.crop, 80, 'culture'),
        updated_at: now
      };
      if (input.id !== undefined && input.id !== null && input.id !== '') {
        if (!validId(input.id)) return json(400, { error: 'Parcelle invalide.' });
        const plot = await store.get('plots', input.id);
        if (!plot || plot.owner !== me.username) return json(404, { error: 'Parcelle introuvable pour ce compte.' });
        await store.update('plots', plot.id, data);
        return json(200, { ok: true, plot: plotView({ ...plot, ...data }) });
      }
      if ((await store.find('plots', { owner: me.username }, LIMITS.plots)).length >= LIMITS.plots) return json(409, { error: 'Nombre maximal de parcelles atteint (' + LIMITS.plots + ').' });
      const plot = { id: crypto.randomUUID(), farm_id: farm.id, owner: me.username, created_at: now, ...data };
      await store.insert('plots', plot);
      return json(200, { ok: true, plot: plotView(plot) });
    },

    'POST /api/lots/create': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const farm = await myFarm(me);
      if (!farm) return json(409, { error: 'Créez d’abord la fiche de votre exploitation.' });
      const input = body.lot || {};
      const product = cleanText(input.product, 120, 'produit', true);
      const quantity = optNumber(input.quantity, 'quantité', 1e7);
      const unit = input.unit ? String(input.unit) : null;
      if (unit && !UNITS.includes(unit)) return json(400, { error: 'Unité inconnue.' });
      let plot = null;
      if (input.plotId) {
        if (!validId(input.plotId)) return json(400, { error: 'Parcelle invalide.' });
        plot = await store.get('plots', input.plotId);
        if (!plot || plot.owner !== me.username) return json(404, { error: 'Parcelle introuvable pour ce compte.' });
      }
      if ((await store.find('lots', { owner: me.username }, LIMITS.lots)).length >= LIMITS.lots) return json(409, { error: 'Nombre maximal de lots atteint (' + LIMITS.lots + ').' });
      const now = new Date().toISOString();
      for (let attempt = 0; attempt < 4; attempt++) {
        const lot = { id: newLotCode(), farm_id: farm.id, plot_id: plot?.id || null, owner: me.username, product, quantity, unit, created_at: now };
        try {
          await store.insert('lots', lot);
          return json(200, { ok: true, lot: { code: lot.id, product, quantity, unit: unit || '', plotId: lot.plot_id, plotName: plot?.name || '', createdAt: now, events: [] } });
        } catch (e) { if (!e.duplicate) throw e; }
      }
      throw new HttpError(500, 'Création du code de lot impossible.');
    },

    // Les étapes d'un lot ne se modifient ni ne s'effacent : une erreur se corrige par une étape « correction ».
    'POST /api/lots/event': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const code = normalizeCode(body.code);
      if (!code) return json(400, { error: 'Code de lot invalide.' });
      const lot = await store.get('lots', code);
      if (!lot || lot.owner !== me.username) return json(404, { error: 'Lot introuvable pour ce compte.' });
      const input = body.event || {};
      if (!EVENT_TYPES.includes(input.type)) return json(400, { error: 'Type d’étape inconnu.' });
      const event = {
        id: crypto.randomUUID(), lot_id: code, owner: me.username, type: input.type,
        date: isoDay(input.date), note: cleanText(input.note, 300, 'précision', false, true), created_at: new Date().toISOString()
      };
      if ((await store.find('lot_events', { lot_id: code }, LIMITS.events)).length >= LIMITS.events) return json(409, { error: 'Nombre maximal d’étapes atteint pour ce lot.' });
      await store.insert('lot_events', event);
      return json(200, { ok: true, event: eventView(event) });
    },

    // Page publique de traçabilité : aucune donnée de compte, seulement l'exploitation, le lot et ses étapes.
    'GET /api/trace': async (request) => {
      const code = normalizeCode(new URL(request.url).searchParams.get('code'));
      if (!code) return json(400, { error: 'Code de lot invalide. Format attendu : BSME- suivi de 8 caractères.' });
      const lot = await store.get('lots', code);
      if (!lot) return json(404, { error: 'Aucun lot ne porte ce code.' });
      const [farm, plot, events] = await Promise.all([
        store.get('farms', lot.farm_id),
        lot.plot_id ? store.get('plots', lot.plot_id) : null,
        store.find('lot_events', { lot_id: code }, LIMITS.events)
      ]);
      return json(200, {
        ok: true,
        lot: { code, product: lot.product, quantity: lot.quantity ?? null, unit: lot.unit || '', createdAt: lot.created_at },
        farm: farm ? { name: farm.name, country: farm.country, region: farm.region, locality: farm.locality || '', practices: farm.practices || '' } : null,
        plot: plot ? { name: plot.name, crop: plot.crop || '', soil: plot.soil || '' } : null,
        events: events.sort(byEventDate).map(eventView),
        trainings: farm?.show_training ? await trainingsOf(lot.owner) : [],
        attestations: farm?.show_training ? await attestationsOf(lot.owner) : []
      });
    },

    // --- BioStar Academy ---
    'POST /api/academy': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const [enrolled, map, attestations] = await Promise.all([
        enrolledCourses(me.username), progressMap(me.username), store.find('attestations', { owner: me.username }, LIMITS.attestations)
      ]);
      const admin = isAdmin(me);
      const byCourse = new Map(attestations.map((a) => [a.course_id, a]));
      return json(200, {
        ok: true,
        courses: Object.keys(courses).map((id) => courseView(id, map, enrolled.has(id), byCourse.get(id), admin)),
        attestations: attestations.sort(byCreatedDesc).map(attestationView)
      });
    },

    'POST /api/academy/progress': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const courseId = String(body.courseId || '');
      if (!courses[courseId]) return json(404, { error: 'Formation inconnue.' });
      const index = moduleIndexOf(courseId, body.moduleIndex);
      if (!(await enrolledCourses(me.username)).has(courseId)) return json(403, { error: 'Inscrivez-vous à cette formation pour suivre ses modules.' });
      const module = courses[courseId].modules[index];
      const status = (await progressMap(me.username)).get(courseId + '|' + index) || null;
      const attested = await attestationOf(me.username, courseId);
      if (body.action === 'done') {
        if (module.practical) return json(409, { error: 'Ce module pratique est validé par votre formateur : demandez la validation.' });
        await setProgress(me.username, courseId, index, 'done');
      } else if (body.action === 'request') {
        if (!module.practical) return json(400, { error: 'Ce module ne demande pas de validation.' });
        if (status !== 'done') await setProgress(me.username, courseId, index, 'pending');
      } else if (body.action === 'undo') {
        if (attested) return json(409, { error: 'Attestation délivrée : la progression de cette formation est figée.' });
        if (module.practical && status === 'done') return json(409, { error: 'Un module pratique validé ne peut pas être annulé.' });
        if (status) await setProgress(me.username, courseId, index, 'todo');
      } else return json(400, { error: 'Action inconnue.' });
      const attestation = await issueIfComplete(me.username, courseId);
      const map = await progressMap(me.username);
      return json(200, { ok: true, course: courseView(courseId, map, true, attestation, false), newAttestation: Boolean(attestation && !attested) });
    },

    // Vérification publique d'une attestation (code imprimé ou code QR).
    'GET /api/attestation': async (request) => {
      const code = normalizeAttestationCode(new URL(request.url).searchParams.get('code'));
      if (!code) return json(400, { error: 'Code d’attestation invalide. Format attendu : ATT- suivi de 8 caractères.' });
      const a = await store.get('attestations', code);
      if (!a) return json(404, { error: 'Aucune attestation ne porte ce code.' });
      return json(200, { ok: true, valid: a.status === 'valid', attestation: { ...attestationView(a), username: a.owner } });
    },

    // --- BioSmart : demandes d'avis à un conseiller ---
    'POST /api/advice': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const input = body.advice || {};
      const row = {
        crop: cleanText(input.crop, 40, 'culture ou animal', true),
        symptom: cleanText(input.symptom, 200, 'symptôme'),
        cause: cleanText(input.cause, 200, 'cause probable'),
        message: cleanText(input.message, 1000, 'message', false, true)
      };
      if (!row.symptom && !row.message) return json(400, { error: 'Choisissez un symptôme ou décrivez le problème.' });
      const mine = await store.find('advice', { owner: me.username }, LIMITS.adminRows);
      if (mine.filter((a) => a.status === 'open').length >= LIMITS.openAdvice) return json(409, { error: 'Trop de demandes en attente : patientez jusqu’aux réponses du conseiller.' });
      const advice = { id: crypto.randomUUID(), owner: me.username, ...row, status: 'open', created_at: new Date().toISOString() };
      await store.insert('advice', advice);
      return json(200, { ok: true, advice: adviceView(advice, false) });
    },
    'POST /api/advice/mine': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const rows = (await store.find('advice', { owner: me.username }, LIMITS.adminRows)).sort(byCreatedDesc);
      return json(200, { ok: true, advice: rows.map((a) => adviceView(a, false)) });
    },

    // Message à l'Institut, sans quitter l'application.
    'POST /api/contact': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const message = cleanText(body.message, 1000, 'message', true, true);
      if (message.length < 5) return json(400, { error: 'Écrivez au moins quelques mots.' });
      if ((await store.find('messages', { owner: me.username }, LIMITS.messages)).length >= LIMITS.messages) return json(409, { error: 'Nombre maximal de messages atteint.' });
      await store.insert('messages', { id: crypto.randomUUID(), owner: me.username, message, created_at: new Date().toISOString() });
      return json(200, { ok: true });
    },

    // --- Administration : validations pratiques, demandes de conseil, messages ---
    'POST /api/admin/academy': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!isAdmin(me)) return json(403, { error: 'Espace réservé au promoteur.' });
      const [pending, advice, messages, attestations] = await Promise.all([
        store.find('progress', { status: 'pending' }, LIMITS.progress),
        store.find('advice', {}, LIMITS.adminRows),
        store.find('messages', {}, LIMITS.adminRows),
        store.count('attestations')
      ]);
      return json(200, {
        ok: true, attestations,
        validations: pending.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at))).map((p) => {
          const index = Number(p.module_index);
          return { username: p.owner, courseId: p.course_id, courseTitle: getProduct(p.course_id)?.name || p.course_id, moduleIndex: index, moduleTitle: courses[p.course_id]?.modules[index]?.title || '', requestedAt: p.updated_at };
        }),
        advice: advice.sort(byCreatedDesc).map((a) => adviceView(a, true)),
        messages: messages.sort(byCreatedDesc).map((m) => ({ id: m.id, username: m.owner, message: m.message, createdAt: m.created_at }))
      });
    },
    'POST /api/admin/validate': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!isAdmin(me)) return json(403, { error: 'Espace réservé au promoteur.' });
      const owner = cleanText(body.username, 64, 'compte', true);
      const courseId = String(body.courseId || '');
      if (!courses[courseId]) return json(404, { error: 'Formation inconnue.' });
      const index = moduleIndexOf(courseId, body.moduleIndex);
      const row = await store.get('progress', await progressId(owner, courseId, index));
      if (!row || row.status !== 'pending') return json(404, { error: 'Aucune demande de validation en attente pour ce module.' });
      if (body.decision === 'approve') {
        await setProgress(owner, courseId, index, 'done');
        const attestation = await issueIfComplete(owner, courseId);
        return json(200, { ok: true, attestation: attestation ? attestationView(attestation) : null });
      }
      if (body.decision === 'reject') { await setProgress(owner, courseId, index, 'todo'); return json(200, { ok: true, attestation: null }); }
      return json(400, { error: 'Décision inconnue.' });
    },
    'POST /api/admin/answer': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!isAdmin(me)) return json(403, { error: 'Espace réservé au promoteur.' });
      if (!validId(body.id)) return json(400, { error: 'Demande invalide.' });
      const answer = cleanText(body.answer, 2000, 'réponse', true, true);
      const advice = await store.get('advice', body.id);
      if (!advice) return json(404, { error: 'Demande introuvable.' });
      const data = { status: 'answered', answer, answered_at: new Date().toISOString() };
      await store.update('advice', advice.id, data);
      return json(200, { ok: true, advice: adviceView({ ...advice, ...data }, true) });
    },

    'POST /api/payments/cancel': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!validPaymentId(body.paymentId)) return json(400, { error: 'Identifiant de paiement manquant.' });
      const order = await store.getOrder(body.paymentId);
      if (order && order.username !== me.username) return json(403, { error: 'Cette commande appartient à un autre compte.' });
      if (order) await store.cancelOrder(body.paymentId);
      return json(200, { ok: true, status: 'cancelled' });
    }
  };

  // Renvoie une Response, ou null si la requête ne concerne pas l'API (fichier statique côté Node).
  return async function handle(request) {
    const url = new URL(request.url);
    // On retire un éventuel préfixe /functions/v1 (hébergements qui le transmettent).
    const pathname = url.pathname.replace(/^\/functions\/v1(?=\/)/, '');
    try {
      if (request.method === 'GET' && (pathname === '/healthz' || pathname === '/api/health')) {
        return json(200, { ok: true, app: 'Bio Star Monde Éden', network, environment: sandbox ? 'sandbox-configured' : 'non-sandbox', piApiKeyConfigured: Boolean(piApiKey), adminConfigured: admins.size > 0, database: store.kind });
      }
      if (request.method === 'GET' && pathname === '/validation-key.txt') {
        return new Response((validationKey || 'Clé de validation non configurée.') + '\n', { status: validationKey ? 200 : 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      if (!pathname.startsWith('/api/')) return null;
      const route = routes[request.method + ' ' + pathname];
      if (!route) return json(404, { error: 'Route API inconnue.' });
      return await route(request);
    } catch (err) {
      const status = err.status || 500;
      log(new Date().toISOString(), request.method, pathname, err.message);
      // Les messages des erreurs de saisie (HttpError 4xx) sont écrits pour l'utilisateur ; les autres restent dans les journaux.
      const userFacing = err instanceof HttpError && status < 500;
      return json(status, { error: exposeErrors || userFacing ? err.message : 'Requête impossible. Vérifiez la configuration et les journaux serveur.' });
    }
  };
}
