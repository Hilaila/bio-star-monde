"use strict";
/*
 * Tests de bout en bout : le serveur réel tourne contre une fausse API Pi (même format de réponses
 * que https://api.minepi.com/v2) et un faux Horizon pour la vérification des transactions.
 * Lancer : npm test
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

/* ---------- Fausse API Pi ---------- */
const users = { "tok-alice": { uid: "uid-alice", username: "alice" }, "tok-bob": { uid: "uid-bob", username: "bob" }, "tok-admin": { uid: "uid-boss", username: "zougba" } };
const payments = new Map();
const calls = [];
let mockPort;
const mock = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    calls.push({ method: req.method, path: url.pathname, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
    const json = (s, d) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
    if (url.pathname === "/v2/me") {
      const tok = String(req.headers.authorization || "").replace(/^Bearer /, "");
      return users[tok] ? json(200, users[tok]) : json(401, { error: "invalid_token" });
    }
    let m = url.pathname.match(/^\/v2\/payments\/([^/]+)(?:\/(approve|complete|cancel))?$/);
    if (m) {
      if (req.headers.authorization !== "Key test-key") return json(401, { error: "bad_key" });
      const p = payments.get(m[1]);
      if (!p) return json(404, { error: "not_found" });
      if (m[2] === "approve") p.status.developer_approved = true;
      if (m[2] === "complete") { p.status.developer_completed = true; p.transaction = p.transaction || { txid: JSON.parse(body).txid, verified: true, _link: `http://127.0.0.1:${mockPort}/transactions/${JSON.parse(body).txid}` }; }
      if (m[2] === "cancel") p.status.cancelled = true;
      return json(200, p);
    }
    m = url.pathname.match(/^\/transactions\/([^/]+)$/);
    if (m) {
      const memo = m[1] === "tx-bad" ? "autre-chose" : [...payments.values()].find((p) => p.transaction && p.transaction.txid === m[1])?.identifier;
      return json(200, { id: m[1], memo });
    }
    json(404, { error: "unknown" });
  });
});

function makePayment(id, { uid, amount, orderId, txid = null }) {
  const p = {
    identifier: id, user_uid: uid, amount, memo: "test", metadata: { orderId }, from_address: "G...", to_address: "G...",
    direction: "user_to_app", network: "Pi Testnet", created_at: new Date().toISOString(),
    status: { developer_approved: false, transaction_verified: false, developer_completed: false, cancelled: false, user_cancelled: false },
    transaction: txid ? { txid, verified: true, _link: `http://127.0.0.1:${mockPort}/transactions/${txid}` } : null,
  };
  payments.set(id, p);
  return p;
}

/* ---------- Application ---------- */
let base;
let appServer;
async function call(path, { method, body, token, admin } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  if (admin) headers["X-Admin-Token"] = admin;
  const r = await fetch(base + path, { method: method || (body !== undefined ? "POST" : "GET"), headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = r.headers.get("content-type") || "";
  const data = type.includes("json") ? await r.json() : await r.text();
  return { status: r.status, data, type };
}
const signin = async (piToken) => (await call("/api/auth/signin", { body: { accessToken: piToken } })).data.token;

test.before(async () => {
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  mockPort = mock.address().port;
  Object.assign(process.env, {
    PI_API_BASE: `http://127.0.0.1:${mockPort}/v2`, PI_API_KEY: "test-key", SESSION_SECRET: "test-secret-0123456789",
    ADMIN_TOKEN: "admin-test", ADMIN_USERNAMES: "zougba", PI_HORIZON_HOSTS: `127.0.0.1:${mockPort}`, VALIDATION_KEY: "cle-de-validation-123",
    APP_URL: "https://bsme.test", PI_NETWORK: "Pi Testnet", PI_SANDBOX: "false",
  });
  const server = require("../server.js");
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  appServer = server;
});
test.after(() => { if (appServer) appServer.close(); mock.close(); });

test("santé, configuration et clé de validation du domaine", async () => {
  const h = await call("/api/health");
  assert.equal(h.status, 200); assert.equal(h.data.ok, true); assert.equal(h.data.piApiKey, true);
  const c = await call("/api/config");
  assert.equal(c.data.sandbox, false);
  const v = await call("/validation-key.txt");
  const v2 = await call("/api/index?path=validation-key");
  assert.equal(v2.data, "cle-de-validation-123");
  assert.equal(v.status, 200); assert.equal(v.data, "cle-de-validation-123"); assert.match(v.type, /text\/plain/);
});

test("pages statiques : application, Pi SDK, vérification, protections", async () => {
  const home = await call("/");
  assert.equal(home.status, 200); assert.match(home.data, /sdk\.minepi\.com\/pi-sdk\.js/); assert.match(home.data, /Bio Star Monde Eden/);
  const verify = await call("/verify/BSE-2026-MB1-ABCDEF");
  assert.equal(verify.status, 200); assert.match(verify.data, /Vérification de certificat/);
  for (const p of ["/privacy.html", "/terms.html", "/manifest.webmanifest", "/sw.js", "/icons/logo-1024.png", "/data/catalog.json"]) {
    assert.equal((await call(p)).status, 200, p);
  }
  const trav = await fetch(base + "/..%2f..%2fetc%2fpasswd");
  assert.notEqual(trav.status, 200);
});

test("connexion Pi : jeton vérifié auprès de /v2/me", async () => {
  const bad = await call("/api/auth/signin", { body: { accessToken: "faux" } });
  assert.equal(bad.status, 401);
  const saved = process.env.PI_API_KEY;
  process.env.PI_API_KEY = "mauvaise-cle";
  const tmp = await call("/api/auth/signin", { body: { accessToken: "tok-alice" } });
  const refused = await call("/api/payments/approve", { token: tmp.data.token, body: { paymentId: "pay-x" } });
  assert.equal(refused.status, 502, "une clé serveur refusée ne doit pas déconnecter l'utilisateur");
  process.env.PI_API_KEY = saved;
  const ok = await call("/api/auth/signin", { body: { accessToken: "tok-alice" } });
  assert.equal(ok.status, 200); assert.equal(ok.data.user.username, "alice"); assert.equal(ok.data.user.isAdmin, false);
  assert.ok(calls.some((c) => c.path === "/v2/me" && c.auth === "Bearer tok-alice"));
  assert.equal((await call("/api/me")).status, 401);
  const me = await call("/api/me", { token: ok.data.token });
  assert.equal(me.status, 200); assert.equal(me.data.user.uid, "uid-alice");
  const forged = ok.data.token.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  assert.equal((await call("/api/me", { token: forged })).status, 401);
  const admin = await call("/api/auth/signin", { body: { accessToken: "tok-admin" } });
  assert.equal(admin.data.user.isAdmin, true);
});

test("paiement complet : commande, approbation serveur, finalisation", async () => {
  const tok = await signin("tok-alice");
  const products = (await call("/api/products")).data.products;
  assert.equal(products.length, 7);
  const tomato = products.find((p) => p.name === "Tomates rondes");
  const bad = await call("/api/orders", { token: tok, body: { items: [{ productId: tomato.id, qty: 0 }] } });
  assert.equal(bad.status, 400);
  const o = await call("/api/orders", { token: tok, body: { items: [{ productId: tomato.id, qty: 3, pricePi: 0.0001 }] } });
  assert.equal(o.status, 200);
  const order = o.data.order;
  assert.equal(order.amount, 0.6, "le montant vient du serveur, pas du client");
  assert.equal(order.status, "created");

  makePayment("pay-1", { uid: "uid-alice", amount: 0.6, orderId: order.id });
  const ap = await call("/api/payments/approve", { token: tok, body: { paymentId: "pay-1" } });
  assert.equal(ap.status, 200);
  assert.ok(calls.some((c) => c.path === "/v2/payments/pay-1/approve" && c.auth === "Key test-key"));
  const cp = await call("/api/payments/complete", { token: tok, body: { paymentId: "pay-1", txid: "tx-1" } });
  assert.equal(cp.status, 200); assert.equal(cp.data.order.status, "paid"); assert.equal(cp.data.order.txid, "tx-1");
  assert.deepEqual(calls.find((c) => c.path === "/v2/payments/pay-1/complete").body, { txid: "tx-1" });
  const mine = await call("/api/orders/mine", { token: tok });
  assert.equal(mine.data.orders[0].status, "paid");
});

test("paiement refusé : mauvais montant, autre utilisateur, autre réseau", async () => {
  const alice = await signin("tok-alice");
  const bob = await signin("tok-bob");
  const pid = (await call("/api/products")).data.products[0].id;
  const order = (await call("/api/orders", { token: alice, body: { items: [{ productId: pid, qty: 1 }] } })).data.order;
  makePayment("pay-wrong-amount", { uid: "uid-alice", amount: 0.01, orderId: order.id });
  assert.equal((await call("/api/payments/approve", { token: alice, body: { paymentId: "pay-wrong-amount" } })).status, 409);
  makePayment("pay-bob", { uid: "uid-bob", amount: order.amount, orderId: order.id });
  assert.equal((await call("/api/payments/approve", { token: bob, body: { paymentId: "pay-bob" } })).status, 404);
  assert.equal((await call("/api/payments/approve", { token: alice, body: { paymentId: "pay-bob" } })).status, 403);
  const p = makePayment("pay-mainnet", { uid: "uid-alice", amount: order.amount, orderId: order.id });
  p.network = "Pi Network";
  assert.equal((await call("/api/payments/approve", { token: alice, body: { paymentId: "pay-mainnet" } })).status, 409);
  assert.ok(!payments.get("pay-wrong-amount").status.developer_approved);
});

test("paiement inachevé : finalisé après vérification du mémo sur la blockchain, sinon annulé", async () => {
  const tok = await signin("tok-alice");
  const pid = (await call("/api/products")).data.products[1].id;
  const o1 = (await call("/api/orders", { token: tok, body: { items: [{ productId: pid, qty: 2 }] } })).data.order;
  const p1 = makePayment("pay-inc-1", { uid: "uid-alice", amount: o1.amount, orderId: o1.id, txid: "tx-inc-1" });
  p1.status.developer_approved = true;
  const r1 = await call("/api/payments/incomplete", { token: tok, body: { payment: { identifier: "pay-inc-1" } } });
  assert.equal(r1.status, 200); assert.equal(r1.data.status, "completed");
  assert.ok(payments.get("pay-inc-1").status.developer_completed);

  const o2 = (await call("/api/orders", { token: tok, body: { items: [{ productId: pid, qty: 1 }] } })).data.order;
  makePayment("pay-inc-2", { uid: "uid-alice", amount: o2.amount, orderId: o2.id, txid: "tx-bad" });
  assert.equal((await call("/api/payments/incomplete", { token: tok, body: { payment: { identifier: "pay-inc-2" } } })).status, 409);

  const o3 = (await call("/api/orders", { token: tok, body: { items: [{ productId: pid, qty: 1 }] } })).data.order;
  makePayment("pay-inc-3", { uid: "uid-alice", amount: o3.amount, orderId: o3.id });
  const r3 = await call("/api/payments/incomplete", { token: tok, body: { payment: { identifier: "pay-inc-3" } } });
  assert.equal(r3.data.status, "cancelled"); assert.ok(payments.get("pay-inc-3").status.cancelled);
  const mine = (await call("/api/orders/mine", { token: tok })).data.orders;
  assert.equal(mine.find((x) => x.id === o3.id).status, "cancelled");
  assert.equal(mine.find((x) => x.id === o1.id).status, "paid");
});

test("formation : modules, validation pratique par l'administrateur, certificat vérifiable", async () => {
  const tok = await signin("tok-bob");
  const cat = (await call("/data/catalog.json")).data;
  const course = cat.courses.find((c) => c.id === "elevage");
  const practical = course.modules.findIndex((m) => m.practical);
  assert.equal((await call("/api/progress", { token: tok, body: { courseId: "elevage", moduleIndex: practical, action: "done" } })).status, 409);
  for (let i = 0; i < course.modules.length; i++) {
    if (i === practical) continue;
    const r = await call("/api/progress", { token: tok, body: { courseId: "elevage", moduleIndex: i, action: "done" } });
    assert.equal(r.status, 200); assert.equal(r.data.certificate, null);
  }
  const req = await call("/api/progress", { token: tok, body: { courseId: "elevage", moduleIndex: practical, action: "request" } });
  assert.equal(req.data.progress.find((p) => p.moduleIndex === practical).status, "pending");

  assert.equal((await call("/api/admin/overview")).status, 403);
  assert.equal((await call("/api/admin/overview", { admin: "mauvais" })).status, 403);
  const ov = await call("/api/admin/overview", { admin: "admin-test" });
  assert.equal(ov.status, 200);
  const v = ov.data.validations.find((x) => x.username === "bob");
  assert.ok(v);
  const val = await call("/api/admin/validations", { admin: "admin-test", body: { uid: v.uid, courseId: v.courseId, moduleIndex: v.moduleIndex, decision: "approve" } });
  assert.equal(val.status, 200); assert.ok(val.data.certificate);
  const code = val.data.certificate.code;
  assert.match(code, /^BSE-\d{4}-ELV-[A-F0-9]{6}$/);

  const check = await call(`/api/certificates/${code}`);
  assert.equal(check.data.valid, true); assert.equal(check.data.certificate.username, "bob"); assert.equal(check.data.certificate.uid, undefined);
  assert.equal((await call("/api/certificates/BSE-2026-ELV-000000")).data.valid, false);
  const qr = await fetch(`${base}/api/qr/${code}`);
  assert.equal(qr.status, 200); assert.match(qr.headers.get("content-type"), /svg/);
  assert.match(await qr.text(), /^<svg/);
  assert.equal((await call("/api/progress", { token: tok, body: { courseId: "elevage", moduleIndex: 0, action: "undo" } })).status, 409);
  const me = await call("/api/me", { token: tok });
  assert.equal(me.data.certificates.length, 1);
});

test("offres des producteurs : vérification avant publication, prix modifiable", async () => {
  const tok = await signin("tok-alice");
  const created = await call("/api/products", { token: tok, body: { name: "Piment frais", category: "Fruits et légumes", pricePi: 0.25, unit: "kg", place: "Kpalimé", country: "Togo" } });
  assert.equal(created.status, 200); assert.equal(created.data.product.status, "pending");
  const id = created.data.product.id;
  assert.ok(!(await call("/api/products")).data.products.some((p) => p.id === id));
  assert.equal((await call("/api/products", { token: tok, body: { name: "X", category: "Inconnue", pricePi: 1, unit: "kg", place: "Lomé" } })).status, 400);
  assert.equal((await call(`/api/admin/products/${id}`, { admin: "admin-test", body: { status: "approved", pricePi: 0.3, cert: "conv" } })).status, 200);
  const pub = (await call("/api/products")).data.products.find((p) => p.id === id);
  assert.equal(pub.pricePi, 0.3); assert.equal(pub.cert, "conv");
});

test("demandes au conseiller et messages au promoteur", async () => {
  const tok = await signin("tok-alice");
  assert.equal((await call("/api/requests", { token: tok, body: { crop: "Tomate", photo: "javascript:alert(1)" } })).status, 400);
  const photo = "data:image/jpeg;base64," + Buffer.from("faux-jpeg").toString("base64");
  const r = await call("/api/requests", { token: tok, body: { crop: "Tomate", symptom: "Feuilles jaunes", cause: "Aleurodes", message: "Depuis 5 jours", photo } });
  assert.equal(r.status, 200); assert.equal(r.data.request.hasPhoto, true);
  const ov = await call("/api/admin/overview", { admin: "admin-test" });
  const open = ov.data.requests.find((x) => x.id === r.data.request.id);
  assert.equal(open.photo, undefined); assert.equal(open.hasPhoto, true);
  assert.equal((await call(`/api/admin/requests/${open.id}/photo`)).status, 403);
  assert.equal((await call(`/api/admin/requests/${open.id}/photo`, { admin: "admin-test" })).data.photo, photo);
  await call(`/api/admin/requests/${open.id}`, { admin: "admin-test", body: { answer: "Posez des pièges jaunes et traitez au neem." } });
  const mine = await call("/api/requests/mine", { token: tok });
  assert.equal(mine.data.requests[0].status, "answered");
  assert.equal((await call("/api/messages", { token: tok, body: { message: "Bon" } })).status, 400);
  assert.equal((await call("/api/messages", { token: tok, body: { message: "Bonjour, je voudrais rejoindre une ferme-école." } })).status, 200);
  const stats = await call("/api/stats");
  assert.ok(stats.data.learners >= 3); assert.ok(stats.data.certificates >= 1);
});
