// Tests de l'API avec le serveur Node (SQLite) et une API Pi simulée : paiements, espaces, exploitation, lots, traçabilité.
// Lancement : npm test (aucune dépendance à installer).
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';

const projectDir = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDbDir = process.env.TEST_DB_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bsme-test-'));
const realFetch = globalThis.fetch;
const payments = new Map();
const users = { 'tok-alice-xxxxxxxx': { uid: 'u-alice', username: 'alice' }, 'tok-bob-xxxxxxxxxx': { uid: 'u-bob', username: 'bob' }, 'tok-zoubga-xxxxxxx': { uid: 'u-z', username: 'Zoubga' } };
const PI = 'https://api.minepi.com/v2';

function reply(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (!url.startsWith(PI)) return realFetch(url, opts);
  const auth = opts.headers?.Authorization || '';
  if (url === PI + '/me') { const u = users[auth.replace('Bearer ', '')]; return u ? reply(200, u) : reply(401, { error: 'invalid' }); }
  assert.equal(auth, 'Key test-key', 'clé API serveur attendue');
  const m = url.match(/\/payments\/([^/]+)(?:\/(approve|complete))?$/);
  const p = payments.get(decodeURIComponent(m[1]));
  if (!p) return reply(404, { error: 'not found' });
  if (m[2] === 'approve') p.status.developer_approved = true;
  if (m[2] === 'complete') { const { txid } = JSON.parse(opts.body); assert.equal(txid, p.transaction?.txid ?? p._chainTxid, 'txid transmis à Pi'); p.status.developer_completed = true; }
  return reply(200, p);
};
function newPayment(id, uid, amount, productId) {
  payments.set(id, { identifier: id, user_uid: uid, amount, metadata: { productId }, status: { developer_approved: false, transaction_verified: false, developer_completed: false, cancelled: false, user_cancelled: false }, transaction: null });
}
function sign(id, txid) { payments.get(id).transaction = { txid, verified: true }; }

process.env.PORT = '3199';
process.env.PI_API_KEY = 'test-key';
process.env.DATABASE_PATH = path.join(testDbDir, 'test.db');
process.env.NODE_ENV = 'production';
process.env.PI_SANDBOX = 'false';
process.env.PI_NETWORK = 'mainnet';
process.env.ADMIN_USERNAMES = '@zoubga, hilaila';
await import(path.join(projectDir, 'server/index.js'));
await new Promise(r => setTimeout(r, 300));

const base = 'http://127.0.0.1:3199';
const post = async (p, body) => { const r = await realFetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const alice = 'tok-alice-xxxxxxxx', bob = 'tok-bob-xxxxxxxxxx', zoubga = 'tok-zoubga-xxxxxxx';
const results = [];
const check = (name, fn) => results.push([name, fn]);

check('config publique', async () => { const r = await realFetch(base + '/api/config'); assert.deepEqual(await r.json(), { sandbox: false, network: 'mainnet' }); });
check('CSP autorise le cadre Pi', async () => { const r = await realFetch(base + '/'); const csp = r.headers.get('content-security-policy'); assert.match(csp, /frame-ancestors 'self' https:\/\/\*\.minepi\.com https:\/\/\*\.pinet\.com$/); assert.equal(r.headers.get('x-frame-options'), null); });
check('flux normal approve → complete', async () => {
  newPayment('p1', 'u-alice', 1, 'fondamentaux-agrobio');
  let r = await post('/api/payments/approve', { paymentId: 'p1', productId: 'fondamentaux-agrobio', accessToken: alice });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'approved');
  sign('p1', 'tx-1');
  r = await post('/api/payments/complete', { paymentId: 'p1', txid: 'tx-1', accessToken: alice });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'completed'); assert.equal(payments.get('p1').status.developer_completed, true);
});
check('montant falsifié refusé', async () => {
  newPayment('p2', 'u-alice', 0.01, 'fondamentaux-agrobio');
  const r = await post('/api/payments/approve', { paymentId: 'p2', productId: 'fondamentaux-agrobio', accessToken: alice });
  assert.equal(r.status, 400);
});
check('txid différent de celui de Pi refusé', async () => {
  newPayment('p3', 'u-alice', 0.3, 'biochar');
  await post('/api/payments/approve', { paymentId: 'p3', productId: 'biochar', accessToken: alice });
  sign('p3', 'tx-3');
  const r = await post('/api/payments/complete', { paymentId: 'p3', txid: 'tx-falsifie', accessToken: alice });
  assert.equal(r.status, 409); assert.equal(payments.get('p3').status.developer_completed, false);
});
check('paiement d’un autre compte refusé', async () => {
  const r = await post('/api/payments/incomplete', { paymentId: 'p3', accessToken: bob });
  assert.equal(r.status, 403);
});
check('paiement incomplet avec commande : finalisé', async () => {
  const r = await post('/api/payments/incomplete', { paymentId: 'p3', txid: 'tx-3', accessToken: alice });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'completed'); assert.equal(payments.get('p3').status.developer_completed, true);
});
check('paiement incomplet sans commande (serveur arrêté après approve) : reconstruit puis finalisé', async () => {
  newPayment('p4', 'u-alice', 0.2, 'diagnostic-parcelle');
  payments.get('p4').status.developer_approved = true; sign('p4', 'tx-4');
  const r = await post('/api/payments/incomplete', { paymentId: 'p4', accessToken: alice });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'completed');
});
check('paiement incomplet non signé : en attente', async () => {
  newPayment('p5', 'u-alice', 0.2, 'diagnostic-parcelle');
  await post('/api/payments/approve', { paymentId: 'p5', productId: 'diagnostic-parcelle', accessToken: alice });
  const r = await post('/api/payments/incomplete', { paymentId: 'p5', accessToken: alice });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'pending');
});
check('paiement annulé par l’utilisateur', async () => {
  payments.get('p5').status.user_cancelled = true;
  const r = await post('/api/payments/incomplete', { paymentId: 'p5', accessToken: alice });
  assert.equal(r.body.status, 'cancelled');
});
check('connexion : rôle administrateur indiqué', async () => {
  assert.equal((await post('/api/pi-auth', { accessToken: alice })).body.isAdmin, false);
  assert.equal((await post('/api/pi-auth', { accessToken: zoubga })).body.isAdmin, true);
});
check('mes inscriptions : uniquement celles du compte connecté', async () => {
  let r = await post('/api/my-orders', { accessToken: alice });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.orders.map((o) => o.paymentId).sort(), ['p1', 'p3', 'p4', 'p5']);
  const p1 = r.body.orders.find((o) => o.paymentId === 'p1');
  assert.equal(p1.name, 'Fondamentaux de l’agriculture et de l’élevage biologiques'); assert.equal(p1.category, 'Formation'); assert.equal(p1.status, 'completed'); assert.equal(p1.txid, 'tx-1');
  assert.equal(p1.username, undefined, 'pas de nom d’utilisateur dans la vue apprenant');
  r = await post('/api/my-orders', { accessToken: bob });
  assert.deepEqual(r.body.orders, []);
  r = await post('/api/my-orders', { accessToken: 'tok-inconnu-xxxx' });
  assert.equal(r.status, 400);
});
check('administration refusée à un apprenant', async () => {
  const r = await post('/api/admin/orders', { accessToken: alice });
  assert.equal(r.status, 403);
});
check('administration : inscriptions et totaux', async () => {
  const r = await post('/api/admin/orders', { accessToken: zoubga });
  assert.equal(r.status, 200);
  const s = r.body.summary;
  assert.equal(s.orders, 4); assert.equal(s.completed, 3); assert.equal(s.cancelled, 1); assert.equal(s.pending, 0);
  assert.equal(s.totalPi, 1.5);
  assert.deepEqual(s.byProduct.map((p) => [p.productId, p.completed, p.totalPi]), [['fondamentaux-agrobio', 1, 1], ['biochar', 1, 0.3], ['diagnostic-parcelle', 1, 0.2]]);
  assert.ok(r.body.orders.every((o) => o.username === 'alice'));
});
check('état technique : administration configurée', async () => {
  const r = await realFetch(base + '/api/health'); const h = await r.json();
  assert.equal(h.adminConfigured, true); assert.equal(JSON.stringify(h).includes('zoubga'), false);
});
const get = async (p) => { const r = await realFetch(base + p); return { status: r.status, body: await r.json() }; };
const ctx = {};
check('exploitation : aucune fiche au départ, formations connues', async () => {
  const r = await post('/api/farm', { accessToken: alice });
  assert.equal(r.status, 200); assert.equal(r.body.farm, null);
  assert.equal(r.body.trainings.length, 2); assert.ok(r.body.trainings.includes('Fondamentaux de l’agriculture et de l’élevage biologiques'));
});
check('exploitation : champs obligatoires et parcelle sans fiche refusés', async () => {
  let r = await post('/api/farm/save', { accessToken: alice, farm: { name: 'Ferme', country: 'Burkina Faso' } });
  assert.equal(r.status, 400); assert.match(r.body.error, /région/);
  r = await post('/api/plots/save', { accessToken: alice, plot: { name: 'P' } });
  assert.equal(r.status, 409);
});
check('exploitation : création puis modification', async () => {
  let r = await post('/api/farm/save', { accessToken: alice, farm: { name: '  Ferme   Éden  ', country: 'Burkina Faso', region: 'Centre', locality: 'Koubri', areaHa: '2,5', practices: 'Compost\nRotation', showTraining: false } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.farm.name, 'Ferme Éden'); assert.equal(r.body.farm.areaHa, 2.5);
  ctx.farmId = r.body.farm.id;
  r = await post('/api/farm/save', { accessToken: alice, farm: { name: 'Ferme Éden', country: 'Burkina Faso', region: 'Centre', locality: '', practices: 'Compost\nRotation', showTraining: false } });
  assert.equal(r.body.farm.id, ctx.farmId); assert.equal(r.body.farm.locality, '');
  r = await post('/api/farm', { accessToken: alice });
  assert.equal(r.body.farm.id, ctx.farmId); assert.equal(r.body.farm.locality, ''); assert.equal(r.body.farm.areaHa, null); assert.equal(r.body.farm.practices, 'Compost\nRotation');
});
check('parcelles : création, modification, compte étranger refusé', async () => {
  let r = await post('/api/plots/save', { accessToken: alice, plot: { name: 'Parcelle nord', areaHa: 1.2, soil: 'Sableux', crop: 'Tomate' } });
  assert.equal(r.status, 200); ctx.plotId = r.body.plot.id;
  r = await post('/api/plots/save', { accessToken: alice, plot: { id: ctx.plotId, name: 'Parcelle nord', crop: 'Oignon' } });
  assert.equal(r.body.plot.crop, 'Oignon'); assert.equal(r.body.plot.soil, '');
  await post('/api/farm/save', { accessToken: bob, farm: { name: 'Ferme de Bob', country: 'Côte d’Ivoire', region: 'Bouaké' } });
  r = await post('/api/plots/save', { accessToken: bob, plot: { id: ctx.plotId, name: 'Volée' } });
  assert.equal(r.status, 404);
  const b = await post('/api/plots/save', { accessToken: bob, plot: { name: 'Champ de Bob' } }); ctx.bobPlot = b.body.plot.id;
});
check('lots : code BSME, parcelle et unité contrôlées', async () => {
  let r = await post('/api/lots/create', { accessToken: alice, lot: { product: 'Oignons violets', plotId: ctx.plotId, quantity: '120', unit: 'kg' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.lot.code, /^BSME-[2-9A-HJKMNP-Z]{8}$/); assert.equal(r.body.lot.plotName, 'Parcelle nord');
  ctx.code = r.body.lot.code;
  r = await post('/api/lots/create', { accessToken: alice, lot: { product: 'X', plotId: ctx.bobPlot } }); assert.equal(r.status, 404);
  r = await post('/api/lots/create', { accessToken: alice, lot: { product: 'X', unit: 'baril' } }); assert.equal(r.status, 400);
  r = await post('/api/lots/create', { accessToken: alice, lot: { product: '' } }); assert.equal(r.status, 400);
});
check('étapes : ajout, contrôles de date, de type et de compte', async () => {
  let r = await post('/api/lots/event', { accessToken: alice, code: ctx.code, event: { type: 'recolte', date: '2026-10-10', note: 'Récolte manuelle' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await post('/api/lots/event', { accessToken: alice, code: ctx.code.toLowerCase(), event: { type: 'semis', date: '2026-07-01' } });
  assert.equal(r.status, 200);
  r = await post('/api/lots/event', { accessToken: alice, code: ctx.code, event: { type: 'semis', date: '2099-01-01' } }); assert.equal(r.status, 400);
  r = await post('/api/lots/event', { accessToken: alice, code: ctx.code, event: { type: 'semis', date: '2026-02-30' } }); assert.equal(r.status, 400);
  r = await post('/api/lots/event', { accessToken: alice, code: ctx.code, event: { type: 'magie', date: '2026-07-01' } }); assert.equal(r.status, 400);
  r = await post('/api/lots/event', { accessToken: bob, code: ctx.code, event: { type: 'vente', date: '2026-10-11' } }); assert.equal(r.status, 404);
  r = await post('/api/farm', { accessToken: alice });
  assert.deepEqual(r.body.lots[0].events.map((e) => e.type), ['semis', 'recolte'], 'étapes triées par date');
});
check('traçabilité publique : sans donnée de compte, formations sur accord', async () => {
  let r = await get('/api/trace?code=' + ctx.code.toLowerCase());
  assert.equal(r.status, 200); assert.equal(r.body.lot.product, 'Oignons violets'); assert.equal(r.body.farm.name, 'Ferme Éden');
  assert.equal(r.body.plot.crop, 'Oignon'); assert.deepEqual(r.body.events.map((e) => e.type), ['semis', 'recolte']); assert.deepEqual(r.body.trainings, []);
  assert.equal(JSON.stringify(r.body).includes('alice'), false, 'aucun nom d’utilisateur Pi');
  await post('/api/farm/save', { accessToken: alice, farm: { name: 'Ferme Éden', country: 'Burkina Faso', region: 'Centre', showTraining: true } });
  r = await get('/api/trace?code=' + ctx.code);
  assert.equal(r.body.trainings.length, 2);
  assert.equal((await get('/api/trace?code=ABC')).status, 400);
  assert.equal((await get('/api/trace?code=BSME-22222222')).status, 404);
});
check('administration : compteurs de la chaîne', async () => {
  const r = await post('/api/admin/orders', { accessToken: zoubga });
  assert.deepEqual(r.body.chain, { farms: 2, plots: 2, lots: 1, events: 2 });
});
// --- BioStar Academy, BioSmart, contact, administration ---
check('académie : leçons réservées aux inscrits', async () => {
  let r = await post('/api/academy', { accessToken: bob });
  assert.equal(r.status, 200); assert.equal(r.body.courses.length, 9);
  assert.ok(r.body.courses.every((c) => !c.enrolled && c.modules.every((m) => m.points === null)), 'aucune leçon sans inscription');
  r = await post('/api/academy', { accessToken: alice });
  const f = r.body.courses.find((c) => c.id === 'fondamentaux-agrobio');
  assert.equal(f.enrolled, true); assert.ok(f.modules[0].points.length > 0); assert.equal(f.done, 0);
  assert.equal(r.body.courses.find((c) => c.id === 'apiculture').enrolled, false);
  r = await post('/api/academy', { accessToken: zoubga });
  assert.ok(r.body.courses.every((c) => c.preview && c.modules[0].points), 'aperçu complet pour le promoteur');
});
check('académie : progression, module pratique et compte non inscrit', async () => {
  const course = (await post('/api/academy', { accessToken: alice })).body.courses.find((c) => c.id === 'fondamentaux-agrobio');
  const practical = course.modules.findIndex((m) => m.practical);
  assert.equal((await post('/api/academy/progress', { accessToken: bob, courseId: 'fondamentaux-agrobio', moduleIndex: 0, action: 'done' })).status, 403);
  assert.equal((await post('/api/academy/progress', { accessToken: alice, courseId: 'fondamentaux-agrobio', moduleIndex: practical, action: 'done' })).status, 409);
  assert.equal((await post('/api/academy/progress', { accessToken: alice, courseId: 'fondamentaux-agrobio', moduleIndex: 99, action: 'done' })).status, 400);
  for (const m of course.modules) {
    if (m.practical) continue;
    const r = await post('/api/academy/progress', { accessToken: alice, courseId: 'fondamentaux-agrobio', moduleIndex: m.index, action: 'done' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.course.attestation, null);
  }
  let r = await post('/api/academy/progress', { accessToken: alice, courseId: 'fondamentaux-agrobio', moduleIndex: 0, action: 'undo' });
  assert.equal(r.body.course.modules[0].status, null);
  r = await post('/api/academy/progress', { accessToken: alice, courseId: 'fondamentaux-agrobio', moduleIndex: 0, action: 'done' });
  r = await post('/api/academy/progress', { accessToken: alice, courseId: 'fondamentaux-agrobio', moduleIndex: practical, action: 'request' });
  assert.equal(r.body.course.modules[practical].status, 'pending'); assert.equal(r.body.course.done, course.total - 1);
  ctx.practical = practical;
});
check('administration : validation pratique et attestation délivrée', async () => {
  assert.equal((await post('/api/admin/academy', { accessToken: alice })).status, 403);
  let r = await post('/api/admin/academy', { accessToken: zoubga });
  assert.equal(r.status, 200);
  const v = r.body.validations.find((x) => x.username === 'alice' && x.courseId === 'fondamentaux-agrobio');
  assert.ok(v); assert.equal(v.moduleIndex, ctx.practical); assert.ok(v.moduleTitle);
  assert.equal((await post('/api/admin/validate', { accessToken: alice, username: 'alice', courseId: 'fondamentaux-agrobio', moduleIndex: ctx.practical, decision: 'approve' })).status, 403);
  r = await post('/api/admin/validate', { accessToken: zoubga, username: 'alice', courseId: 'fondamentaux-agrobio', moduleIndex: ctx.practical, decision: 'approve' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.attestation.code, /^ATT-[2-9A-HJKMNP-Z]{8}$/);
  ctx.att = r.body.attestation.code;
  assert.equal((await post('/api/admin/validate', { accessToken: zoubga, username: 'alice', courseId: 'fondamentaux-agrobio', moduleIndex: ctx.practical, decision: 'approve' })).status, 404, 'validation en double refusée');
  r = await post('/api/academy', { accessToken: alice });
  assert.equal(r.body.attestations.length, 1); assert.equal(r.body.courses.find((c) => c.id === 'fondamentaux-agrobio').attestation.code, ctx.att);
  assert.equal((await post('/api/academy/progress', { accessToken: alice, courseId: 'fondamentaux-agrobio', moduleIndex: 0, action: 'undo' })).status, 409, 'progression figée après attestation');
});
check('attestation : vérification publique', async () => {
  let r = await get('/api/attestation?code=' + ctx.att.toLowerCase());
  assert.equal(r.status, 200); assert.equal(r.body.valid, true); assert.equal(r.body.attestation.username, 'alice');
  assert.equal(r.body.attestation.courseTitle, 'Fondamentaux de l’agriculture et de l’élevage biologiques'); assert.match(r.body.attestation.hash, /^[0-9a-f]{64}$/);
  assert.equal((await get('/api/attestation?code=ATT-1')).status, 400);
  assert.equal((await get('/api/attestation?code=ATT-22222222')).status, 404);
});
check('traçabilité et exploitation : attestation affichée, sans code ni compte', async () => {
  let r = await get('/api/trace?code=' + ctx.code);
  assert.deepEqual(r.body.attestations.map((a) => a.courseTitle), ['Fondamentaux de l’agriculture et de l’élevage biologiques']);
  assert.equal(JSON.stringify(r.body).includes('alice'), false); assert.equal(JSON.stringify(r.body).includes(ctx.att), false);
  r = await post('/api/farm', { accessToken: alice });
  assert.equal(r.body.attestations.length, 1);
});
check('BioSmart : demande au conseiller, réponse du promoteur', async () => {
  assert.equal((await post('/api/advice', { accessToken: alice, advice: { crop: 'Tomate' } })).status, 400);
  let r = await post('/api/advice', { accessToken: alice, advice: { crop: 'Tomate', symptom: 'Feuilles jaunes et enroulées', cause: 'Aleurodes', message: 'Depuis une semaine.' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); const id = r.body.advice.id;
  assert.equal(r.body.advice.username, undefined);
  r = await post('/api/admin/academy', { accessToken: zoubga });
  assert.equal(r.body.advice[0].username, 'alice'); assert.equal(r.body.advice[0].status, 'open');
  assert.equal((await post('/api/admin/answer', { accessToken: bob, id, answer: 'X' })).status, 403);
  r = await post('/api/admin/answer', { accessToken: zoubga, id, answer: 'Posez des pièges jaunes et traitez au neem tous les 7 jours.' });
  assert.equal(r.status, 200); assert.equal(r.body.advice.status, 'answered');
  r = await post('/api/advice/mine', { accessToken: alice });
  assert.equal(r.body.advice.length, 1); assert.match(r.body.advice[0].answer, /pièges jaunes/);
  assert.deepEqual((await post('/api/advice/mine', { accessToken: bob })).body.advice, []);
});
check('contact : message à l’Institut', async () => {
  assert.equal((await post('/api/contact', { accessToken: bob, message: 'Bon' })).status, 400);
  assert.equal((await post('/api/contact', { accessToken: bob, message: 'Bonjour, je souhaite rejoindre une ferme-école.' })).status, 200);
  const r = await post('/api/admin/academy', { accessToken: zoubga });
  assert.equal(r.body.messages[0].username, 'bob'); assert.equal(r.body.attestations, 1);
});
check('jeton Pi invalide refusé', async () => {
  const r = await post('/api/pi-auth', { accessToken: 'tok-inconnu-xxxx' });
  assert.equal(r.status, 400);
});

let failed = 0;
for (const [name, fn] of results) {
  try { await fn(); console.log('OK  ', name); }
  catch (e) { failed++; console.log('ÉCHEC', name, '—', e.message); }
}
console.log(failed ? failed + ' test(s) en échec' : 'Tous les tests sont passés');
process.exit(failed ? 1 : 0);
