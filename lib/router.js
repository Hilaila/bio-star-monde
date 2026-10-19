"use strict";
const crypto = require("crypto");
const pi = require("./pi");
const session = require("./session");
const { getStore } = require("./db");
const { toSvg } = require("./qr");
const catalog = require("../public/data/catalog.json");

const COURSES = Object.fromEntries(catalog.courses.map((c) => [c.id, c]));
const CATEGORIES = ["Fruits et légumes", "Élevage", "Transformés", "Intrants"];
const CERT_CODE = /^BSE-\d{4}-[A-Z0-9]{2,4}-[A-F0-9]{6}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const now = () => new Date().toISOString();
const round7 = (n) => Math.round(n * 1e7) / 1e7;

/* ---------- Utilitaires HTTP ---------- */

function send(res, status, data, headers = {}) {
  const isText = typeof data === "string";
  res.statusCode = status;
  const h = {
    "Content-Type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    ...headers,
  };
  for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
  res.end(isText ? data : JSON.stringify(data));
}

async function readJson(req) {
  let pre;
  try { pre = req.body; } catch { fail(400, "Corps de requête JSON invalide."); }
  if (pre !== undefined && pre !== null) {
    if (typeof pre === "object" && !Buffer.isBuffer(pre)) return pre;
    const s = Buffer.isBuffer(pre) ? pre.toString("utf8") : String(pre);
    if (!s) return {};
    try { return JSON.parse(s); } catch { fail(400, "Corps de requête JSON invalide."); }
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 3 * 1024 * 1024) fail(413, "Requête trop volumineuse (3 Mo maximum).");
    chunks.push(c);
  }
  const s = Buffer.concat(chunks).toString("utf8");
  if (!s) return {};
  try { return JSON.parse(s); } catch { fail(400, "Corps de requête JSON invalide."); }
}

const buckets = new Map();
function limit(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || t > b.reset) { buckets.set(key, { n: 1, reset: t + windowMs }); return; }
  b.n += 1;
  if (b.n > max) fail(429, "Trop de demandes en peu de temps. Patientez un instant puis réessayez.");
  if (buckets.size > 5000) for (const [k, v] of buckets) if (t > v.reset) buckets.delete(k);
}

function ipOf(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "inconnu";
}

function text(v, { min = 0, max = 200, field = "Champ" } = {}) {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min) fail(400, `${field} : ${min} caractères minimum.`);
  if (s.length > max) fail(400, `${field} : ${max} caractères maximum.`);
  return s;
}

/* ---------- Authentification ---------- */

function bearer(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return m ? session.verify(m[1]) : null;
}
function auth(req) {
  const s = bearer(req);
  if (!s) fail(401, "Connectez-vous avec Pi pour continuer.");
  return s;
}
function isAdmin(req, sess) {
  const token = req.headers["x-admin-token"];
  if (process.env.ADMIN_TOKEN && session.safeEqual(String(token || ""), process.env.ADMIN_TOKEN)) return true;
  if (sess && sess.username) {
    const list = String(process.env.ADMIN_USERNAMES || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    return list.includes(String(sess.username).toLowerCase());
  }
  return false;
}
function requireAdmin(req) {
  const s = bearer(req);
  if (!isAdmin(req, s)) fail(403, "Accès réservé à l'administration de l'institut.");
  return s;
}

/* ---------- Représentations publiques ---------- */

const pubProgress = (p) => ({ courseId: p.course_id, moduleIndex: p.module_index, status: p.status });
const pubCert = (c) => ({ code: c.code, username: c.username, courseId: c.course_id, courseTitle: c.course_title, issuedAt: c.issued_at, hash: c.hash, status: c.status });
const pubProduct = (p) => ({
  id: p.id, name: p.name, category: p.category, seller: p.seller, place: p.place, country: p.country,
  pricePi: Number(p.price_pi), unit: p.unit, cert: p.cert, inputs: p.inputs || [], gps: p.gps || null,
  status: p.status, createdAt: p.created_at,
});
const pubOrder = (o) => ({ id: o.id, items: o.items, amount: Number(o.amount), memo: o.memo, status: o.status, paymentId: o.payment_id || null, txid: o.txid || null, createdAt: o.created_at, paidAt: o.paid_at || null });
const REQ_COLS = "id,uid,username,crop,symptom,cause,message,has_photo,status,answer,created_at,answered_at";
const pubRequest = (r) => ({ id: r.id, crop: r.crop, symptom: r.symptom, cause: r.cause, message: r.message, hasPhoto: !!(r.has_photo || r.photo), status: r.status, answer: r.answer || null, createdAt: r.created_at, answeredAt: r.answered_at || null });

/* ---------- Certificats ---------- */

async function maybeIssueCertificate(db, uid, username, course) {
  const rows = await db.select("progress", { uid, course_id: course.id, status: "done" });
  const done = new Set(rows.map((r) => Number(r.module_index)));
  for (let i = 0; i < course.modules.length; i++) if (!done.has(i)) return null;
  const existing = (await db.select("certificates", { uid, course_id: course.id }))[0];
  if (existing) return existing;
  const issued_at = now();
  const code = `BSE-${new Date().getFullYear()}-${course.code}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const hash = crypto.createHash("sha256").update([code, uid, course.id, issued_at].join("|")).digest("hex");
  return db.insert("certificates", { code, uid, username, course_id: course.id, course_title: course.title, issued_at, hash, status: "valid" });
}

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  return `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

/* ---------- Paiements ---------- */

async function orderForPayment(db, payment, uid) {
  const orderId = payment && payment.metadata && payment.metadata.orderId;
  if (!orderId) fail(400, "Ce paiement n'est lié à aucune commande.");
  const order = (await db.select("orders", { id: String(orderId) }))[0];
  if (!order || order.uid !== uid) fail(404, "Commande introuvable.");
  return order;
}

function checkPaymentMatches(payment, order, uid) {
  if (payment.user_uid !== uid) fail(403, "Ce paiement appartient à un autre utilisateur.");
  if (Math.abs(Number(payment.amount) - Number(order.amount)) > 1e-7) fail(409, "Le montant du paiement ne correspond pas à la commande.");
  if (process.env.PI_NETWORK && payment.network && payment.network !== process.env.PI_NETWORK) {
    fail(409, `Réseau inattendu : ${payment.network}.`);
  }
}

/* ---------- Routes ---------- */

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route("GET", /^\/api\/health$/, async ({ db }) => ({
  ok: true, app: catalog.institute.app, db: db.kind, piApiKey: !!process.env.PI_API_KEY,
  sandbox: process.env.PI_SANDBOX === "true", time: now(),
}));

route("GET", /^\/api\/config$/, async () => ({
  appName: catalog.institute.app,
  sandbox: process.env.PI_SANDBOX === "true",
  network: process.env.PI_NETWORK || null,
}));

route("GET", /^\/api\/validation-key$/, async ({ res }) => {
  const key = process.env.VALIDATION_KEY;
  if (!key) fail(404, "Clé de validation non configurée.");
  send(res, 200, key.trim(), { "Cache-Control": "public, max-age=300" });
  return undefined;
});

route("GET", /^\/api\/stats$/, async ({ db, res }) => {
  const [learners, certificates, answered, products] = await Promise.all([
    db.count("users"), db.count("certificates"), db.count("requests", { status: "answered" }), db.count("products", { status: "approved" }),
  ]);
  send(res, 200, { learners, certificates, answered, products }, { "Cache-Control": "public, max-age=60" });
  return undefined;
});

route("POST", /^\/api\/auth\/signin$/, async ({ req, body, db }) => {
  limit(`signin:${ipOf(req)}`, 30, 60000);
  const token = body.accessToken;
  if (!token || typeof token !== "string" || token.length > 4096) fail(400, "Jeton Pi manquant.");
  let me;
  try { me = await pi.me(token); } catch (e) {
    if (e.status === 401) fail(401, "Votre session Pi a expiré. Reconnectez-vous.");
    throw e;
  }
  if (!me || !me.uid) fail(401, "Identité Pi non confirmée.");
  const username = String(me.username || "pionnier").slice(0, 60);
  const existing = (await db.select("users", { uid: me.uid }))[0];
  if (existing) await db.update("users", { uid: me.uid }, { username, last_seen: now() });
  else await db.insert("users", { uid: me.uid, username, created_at: now(), last_seen: now() });
  const sess = { uid: me.uid, username };
  return { token: session.sign(sess), user: { uid: me.uid, username, isAdmin: isAdmin(req, sess) } };
});

route("GET", /^\/api\/me$/, async ({ req, db }) => {
  const s = auth(req);
  const [progress, certificates] = await Promise.all([
    db.select("progress", { uid: s.uid }),
    db.select("certificates", { uid: s.uid }, { order: "issued_at.desc" }),
  ]);
  return { user: { uid: s.uid, username: s.username, isAdmin: isAdmin(req, s) }, progress: progress.map(pubProgress), certificates: certificates.map(pubCert) };
});

route("POST", /^\/api\/progress$/, async ({ req, body, db }) => {
  const s = auth(req);
  limit(`progress:${s.uid}`, 120, 60000);
  const course = COURSES[body.courseId];
  if (!course) fail(404, "Parcours introuvable.");
  const idx = Number(body.moduleIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= course.modules.length) fail(400, "Module introuvable.");
  const mod = course.modules[idx];
  const key = { uid: s.uid, course_id: course.id, module_index: idx };
  const existing = (await db.select("progress", key))[0];
  const certified = (await db.select("certificates", { uid: s.uid, course_id: course.id })).length > 0;
  const conflict = ["uid", "course_id", "module_index"];

  if (body.action === "done") {
    if (mod.practical) fail(409, "Ce module pratique est validé par votre formateur : demandez la validation.");
    await db.upsert("progress", { ...key, username: s.username, status: "done", updated_at: now() }, conflict);
  } else if (body.action === "request") {
    if (!mod.practical) fail(400, "Ce module ne demande pas de validation.");
    if (!existing || existing.status !== "done") {
      await db.upsert("progress", { ...key, username: s.username, status: "pending", updated_at: now() }, conflict);
    }
  } else if (body.action === "undo") {
    if (certified) fail(409, "Ce parcours est déjà certifié : sa progression est figée.");
    if (existing && existing.status === "done" && mod.practical) fail(409, "Un module pratique validé ne peut pas être annulé.");
    if (existing) await db.remove("progress", key);
  } else {
    fail(400, "Action inconnue.");
  }
  const cert = await maybeIssueCertificate(db, s.uid, s.username, course);
  const progress = (await db.select("progress", { uid: s.uid })).map(pubProgress);
  return { progress, certificate: cert ? pubCert(cert) : null };
});

route("GET", /^\/api\/certificates\/([A-Z0-9-]+)$/, async ({ params, db }) => {
  const code = params[0];
  if (!CERT_CODE.test(code)) return { valid: false };
  const c = (await db.select("certificates", { code }))[0];
  if (!c) return { valid: false };
  return { valid: c.status === "valid", certificate: pubCert(c), institute: catalog.institute.name };
});

route("GET", /^\/api\/qr\/([A-Z0-9-]+)$/, async ({ req, res, params }) => {
  const code = params[0];
  if (!CERT_CODE.test(code)) fail(400, "Code de certificat invalide.");
  send(res, 200, toSvg(`${appUrl(req)}/verify/${code}`), { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" });
  return undefined;
});

route("GET", /^\/api\/products$/, async ({ db }) => {
  const rows = await db.select("products", { status: "approved" }, { order: "created_at.asc" });
  return { products: rows.map(pubProduct) };
});

route("GET", /^\/api\/products\/mine$/, async ({ req, db }) => {
  const s = auth(req);
  const rows = await db.select("products", { owner_uid: s.uid }, { order: "created_at.desc" });
  return { products: rows.map(pubProduct) };
});

route("POST", /^\/api\/products$/, async ({ req, body, db }) => {
  const s = auth(req);
  limit(`products:${s.uid}`, 10, 3600000);
  const name = text(body.name, { min: 2, max: 60, field: "Produit" });
  const category = CATEGORIES.includes(body.category) ? body.category : fail(400, "Catégorie inconnue.");
  const price = Number(body.pricePi);
  if (!Number.isFinite(price) || price <= 0 || price > 100000) fail(400, "Prix en Pi invalide.");
  const unit = text(body.unit, { min: 1, max: 20, field: "Unité" });
  const place = text(body.place, { min: 2, max: 60, field: "Lieu" });
  const row = await db.insert("products", {
    id: crypto.randomUUID(), name, category, seller: `@${s.username}`, place, country: text(body.country, { max: 40, field: "Pays" }) || null,
    price_pi: round7(price), unit, cert: "pending", status: "pending", owner_uid: s.uid, owner_username: s.username,
    inputs: [], gps: null, created_at: now(),
  });
  return { product: pubProduct(row) };
});

route("POST", /^\/api\/orders$/, async ({ req, body, db }) => {
  const s = auth(req);
  limit(`orders:${s.uid}`, 30, 600000);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 20) fail(400, "Le panier doit contenir entre 1 et 20 produits.");
  const lines = [];
  let amount = 0;
  for (const it of items) {
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) fail(400, "Quantité invalide.");
    const p = (await db.select("products", { id: String(it.productId) }))[0];
    if (!p || p.status !== "approved") fail(404, "Un produit du panier n'est plus disponible.");
    const unitPrice = Number(p.price_pi);
    lines.push({ productId: p.id, name: p.name, qty, unitPrice, unit: p.unit, seller: p.seller });
    amount += unitPrice * qty;
  }
  amount = round7(amount);
  if (amount <= 0) fail(400, "Montant invalide.");
  const id = crypto.randomUUID();
  const row = await db.insert("orders", {
    id, uid: s.uid, username: s.username, items: lines, amount, memo: `Bio Star Monde Eden - commande ${id.slice(0, 8)}`,
    status: "created", payment_id: null, txid: null, created_at: now(), updated_at: now(), paid_at: null,
  });
  return { order: pubOrder(row) };
});

route("GET", /^\/api\/orders\/mine$/, async ({ req, db }) => {
  const s = auth(req);
  const rows = await db.select("orders", { uid: s.uid }, { order: "created_at.desc", limit: 50 });
  return { orders: rows.map(pubOrder) };
});

route("POST", /^\/api\/payments\/approve$/, async ({ req, body, db }) => {
  const s = auth(req);
  limit(`pay:${s.uid}`, 30, 60000);
  const paymentId = text(body.paymentId, { min: 1, max: 200, field: "Paiement" });
  const payment = await pi.getPayment(paymentId);
  const order = await orderForPayment(db, payment, s.uid);
  checkPaymentMatches(payment, order, s.uid);
  if (order.status === "paid") fail(409, "Cette commande est déjà payée.");
  if (order.payment_id && order.payment_id !== paymentId) fail(409, "Un autre paiement est déjà associé à cette commande.");
  if (!payment.status || !payment.status.developer_approved) await pi.approve(paymentId);
  await db.update("orders", { id: order.id }, { status: "approved", payment_id: paymentId, updated_at: now() });
  return { ok: true, orderId: order.id };
});

route("POST", /^\/api\/payments\/complete$/, async ({ req, body, db }) => {
  const s = auth(req);
  limit(`pay:${s.uid}`, 30, 60000);
  const paymentId = text(body.paymentId, { min: 1, max: 200, field: "Paiement" });
  const txid = text(body.txid, { min: 1, max: 200, field: "Transaction" });
  const payment = await pi.getPayment(paymentId);
  const order = await orderForPayment(db, payment, s.uid);
  checkPaymentMatches(payment, order, s.uid);
  if (order.payment_id !== paymentId) fail(409, "Ce paiement n'a pas été approuvé pour cette commande.");
  if (payment.transaction && payment.transaction.txid && payment.transaction.txid !== txid) fail(409, "Identifiant de transaction incohérent.");
  if (!payment.status || !payment.status.developer_completed) await pi.complete(paymentId, txid);
  const [row] = await db.update("orders", { id: order.id }, { status: "paid", txid, paid_at: now(), updated_at: now() });
  return { ok: true, order: pubOrder(row) };
});

route("POST", /^\/api\/payments\/cancel$/, async ({ req, body, db }) => {
  const s = auth(req);
  const orderId = text(body.orderId, { min: 1, max: 100, field: "Commande" });
  const order = (await db.select("orders", { id: orderId }))[0];
  if (!order || order.uid !== s.uid) fail(404, "Commande introuvable.");
  if (order.status !== "paid") await db.update("orders", { id: order.id }, { status: "cancelled", updated_at: now() });
  return { ok: true };
});

route("POST", /^\/api\/payments\/incomplete$/, async ({ req, body, db }) => {
  const s = auth(req);
  limit(`pay:${s.uid}`, 30, 60000);
  const paymentId = text(body.payment && body.payment.identifier, { min: 1, max: 200, field: "Paiement" });
  const payment = await pi.getPayment(paymentId); // on ne fait confiance qu'au serveur Pi
  if (payment.user_uid !== s.uid) fail(403, "Ce paiement appartient à un autre utilisateur.");
  const orderId = payment.metadata && payment.metadata.orderId;
  const order = orderId ? (await db.select("orders", { id: String(orderId) }))[0] : null;
  const tx = payment.transaction;
  if (tx && tx.txid) {
    const ok = await pi.txMemoMatches(tx._link, payment.identifier);
    if (!ok) fail(409, "La transaction n'a pas pu être vérifiée sur la blockchain Pi.");
    if (!payment.status || !payment.status.developer_completed) await pi.complete(paymentId, tx.txid);
    if (order && order.uid === s.uid) {
      await db.update("orders", { id: order.id }, { status: "paid", payment_id: paymentId, txid: tx.txid, paid_at: now(), updated_at: now() });
    }
    return { status: "completed", orderId: order ? order.id : null };
  }
  try { await pi.cancel(paymentId); } catch (e) { console.warn("Annulation Pi impossible", paymentId, e.message); }
  if (order && order.uid === s.uid && order.status !== "paid") {
    await db.update("orders", { id: order.id }, { status: "cancelled", updated_at: now() });
  }
  return { status: "cancelled", orderId: order ? order.id : null };
});

route("POST", /^\/api\/requests$/, async ({ req, body, db }) => {
  const s = auth(req);
  limit(`requests:${s.uid}`, 10, 3600000);
  const crop = text(body.crop, { min: 1, max: 40, field: "Culture" });
  const symptom = text(body.symptom, { max: 200, field: "Symptôme" });
  const cause = text(body.cause, { max: 200, field: "Cause probable" });
  const message = text(body.message, { max: 1000, field: "Message" });
  let photo = null;
  if (body.photo) {
    if (typeof body.photo !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo)) fail(400, "Format de photo non accepté.");
    if (body.photo.length > 1600000) fail(413, "Photo trop lourde (1,2 Mo maximum).");
    photo = body.photo;
  }
  if (!symptom && !message && !photo) fail(400, "Décrivez le problème ou joignez une photo.");
  const row = await db.insert("requests", {
    id: crypto.randomUUID(), uid: s.uid, username: s.username, crop, symptom, cause, message, photo, has_photo: !!photo,
    status: "open", answer: null, created_at: now(), answered_at: null,
  });
  return { request: pubRequest(row) };
});

route("GET", /^\/api\/requests\/mine$/, async ({ req, db }) => {
  const s = auth(req);
  const rows = await db.select("requests", { uid: s.uid }, { order: "created_at.desc", limit: 30, columns: REQ_COLS });
  return { requests: rows.map(pubRequest) };
});

route("POST", /^\/api\/messages$/, async ({ req, body, db }) => {
  const s = auth(req);
  limit(`messages:${s.uid}`, 10, 3600000);
  const message = text(body.message, { min: 5, max: 1000, field: "Message" });
  await db.insert("messages", { id: crypto.randomUUID(), uid: s.uid, username: s.username, message, created_at: now() });
  return { ok: true };
});

/* ---------- Administration ---------- */

route("GET", /^\/api\/admin\/overview$/, async ({ req, db }) => {
  requireAdmin(req);
  const [users, products, pending, requests, orders, messages, certificates] = await Promise.all([
    db.count("users"),
    db.select("products", null, { order: "created_at.desc", limit: 200 }),
    db.select("progress", { status: "pending" }, { order: "updated_at.asc", limit: 200 }),
    db.select("requests", null, { order: "created_at.desc", limit: 100, columns: REQ_COLS }),
    db.select("orders", null, { order: "created_at.desc", limit: 100 }),
    db.select("messages", null, { order: "created_at.desc", limit: 100 }),
    db.count("certificates"),
  ]);
  const paid = orders.filter((o) => o.status === "paid");
  return {
    stats: {
      users, certificates,
      pendingValidations: pending.length,
      openRequests: requests.filter((r) => r.status === "open").length,
      pendingProducts: products.filter((p) => p.status === "pending").length,
      paidOrders: paid.length,
      paidAmount: round7(paid.reduce((t, o) => t + Number(o.amount), 0)),
    },
    products: products.map((p) => ({ ...pubProduct(p), owner: p.owner_username })),
    validations: pending.map((p) => {
      const c = COURSES[p.course_id];
      return { uid: p.uid, username: p.username, courseId: p.course_id, courseTitle: c ? c.title : p.course_id, moduleIndex: p.module_index, moduleTitle: c && c.modules[p.module_index] ? c.modules[p.module_index].title : "", requestedAt: p.updated_at };
    }),
    requests: requests.map((r) => ({ ...pubRequest(r), username: r.username })),
    orders: orders.map((o) => ({ ...pubOrder(o), username: o.username })),
    messages: messages.map((m) => ({ id: m.id, username: m.username, message: m.message, createdAt: m.created_at })),
  };
});

route("POST", /^\/api\/admin\/products\/([A-Za-z0-9-]+)$/, async ({ req, body, params, db }) => {
  requireAdmin(req);
  const patch = {};
  if (body.status !== undefined) {
    if (!["approved", "pending", "rejected"].includes(body.status)) fail(400, "Statut inconnu.");
    patch.status = body.status;
  }
  if (body.cert !== undefined) {
    if (!["spg", "bio", "conv", "pending"].includes(body.cert)) fail(400, "Garantie inconnue.");
    patch.cert = body.cert;
  }
  if (body.pricePi !== undefined) {
    const p = Number(body.pricePi);
    if (!Number.isFinite(p) || p <= 0 || p > 100000) fail(400, "Prix en Pi invalide.");
    patch.price_pi = round7(p);
  }
  if (!Object.keys(patch).length) fail(400, "Aucune modification demandée.");
  const [row] = await db.update("products", { id: params[0] }, patch);
  if (!row) fail(404, "Produit introuvable.");
  return { product: pubProduct(row) };
});

route("POST", /^\/api\/admin\/validations$/, async ({ req, body, db }) => {
  requireAdmin(req);
  const course = COURSES[body.courseId];
  if (!course) fail(404, "Parcours introuvable.");
  const idx = Number(body.moduleIndex);
  const key = { uid: String(body.uid || ""), course_id: course.id, module_index: idx };
  const row = (await db.select("progress", key))[0];
  if (!row || row.status !== "pending") fail(404, "Aucune demande de validation en attente pour ce module.");
  if (body.decision === "approve") {
    await db.update("progress", key, { status: "done", updated_at: now() });
    const cert = await maybeIssueCertificate(db, row.uid, row.username, course);
    return { ok: true, certificate: cert ? pubCert(cert) : null };
  }
  if (body.decision === "reject") {
    await db.remove("progress", key);
    return { ok: true, certificate: null };
  }
  fail(400, "Décision inconnue.");
});

route("GET", /^\/api\/admin\/requests\/([A-Za-z0-9-]+)\/photo$/, async ({ req, params, db }) => {
  requireAdmin(req);
  const row = (await db.select("requests", { id: params[0] }, { columns: "id,photo" }))[0];
  if (!row || !row.photo) fail(404, "Aucune photo pour cette demande.");
  return { photo: row.photo };
});

route("POST", /^\/api\/admin\/requests\/([A-Za-z0-9-]+)$/, async ({ req, body, params, db }) => {
  requireAdmin(req);
  const answer = text(body.answer, { min: 2, max: 2000, field: "Réponse" });
  const [row] = await db.update("requests", { id: params[0] }, { status: "answered", answer, answered_at: now() });
  if (!row) fail(404, "Demande introuvable.");
  return { request: pubRequest(row) };
});

/* ---------- Point d'entrée ---------- */

function corsHeaders(req) {
  const origin = req.headers.origin;
  const allowed = String(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      Vary: "Origin",
    };
  }
  return {};
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  let path = url.pathname.replace(/\/+$/, "") || "/";
  const forwarded = url.searchParams.get("path");
  if ((path === "/api" || path === "/api/index") && forwarded) path = `/api/${forwarded.replace(/^\/+/, "")}`;
  if (path === "/validation-key.txt") path = "/api/validation-key";
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  try {
    const r = routes.find((x) => x.method === req.method && x.pattern.test(path));
    if (!r) fail(404, "Ressource introuvable.");
    const params = path.match(r.pattern).slice(1);
    const body = req.method === "POST" ? await readJson(req) : {};
    const db = getStore();
    const out = await r.handler({ req, res, params, body: body || {}, db, url });
    if (out !== undefined && !res.writableEnded) send(res, 200, out);
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    if (status >= 500) console.error("[api]", req.method, path, e.message, e.pi || "");
    if (!res.writableEnded) send(res, status, { error: status === 500 && !(e instanceof HttpError) && !e.pi ? "Erreur interne du serveur." : e.message });
  }
}

module.exports = { handle };
