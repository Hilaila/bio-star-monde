// Page d'accueil : catalogue, connexion Pi, paiements, Mes inscriptions et Administration.
// Fonctions communes ($, api, el…) : common.js ; exploitation et lots : farm.js.
let piUser = null;
let piAccessToken = null;
let piReady = false;
let piConfig = { sandbox: true, network: 'testnet' };
let pendingIncomplete = null;
let piIsAdmin = false;
let adminData = null;
let myOrders = [];
const CONTACT_EMAIL = 'zoubgaefils@gmail.com';
const STATUS_LABELS = { completed: 'Confirmée', approved: 'En attente', cancelled: 'Annulée' };

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4200);
}
function status(message) {
  $('#status').textContent = message;
  const dot = document.getElementById('net-dot');
  if (dot) { dot.classList.toggle('on', Boolean(piUser)); dot.classList.toggle('wait', !piUser && /cours/.test(message)); }
}
function networkLabel() { return (piConfig.network === 'mainnet' ? 'Mainnet' : 'Testnet') + (piConfig.sandbox ? ' (Sandbox)' : ''); }
function productCard(p) {
  const card = document.createElement('article'); card.className = 'product';
  const cat = document.createElement('div'); cat.className = 'category'; cat.textContent = p.category;
  const title = document.createElement('h3'); title.textContent = p.name;
  const desc = document.createElement('p'); desc.textContent = p.description;
  const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = [p.axis, p.duration, p.format].filter(Boolean).join(' · ');
  const price = document.createElement('div'); price.className = 'price'; price.textContent = p.amount.toLocaleString('fr-FR') + ' Pi';
  const btn = document.createElement('button'); btn.className = 'button'; btn.textContent = p.category === 'Service' ? 'Réserver en Pi' : 'S’inscrire en Pi'; btn.type = 'button';
  btn.addEventListener('click', () => buy(p, btn));
  card.append(cat, title, desc, meta, price, btn);
  return card;
}
// Formations dans l'Académie, services dans le Marché (tout dans le catalogue si la page n'a pas d'emplacement « services »).
function showProducts(products) {
  const services = document.getElementById('services');
  const formations = services ? products.filter((p) => p.category !== 'Service') : products;
  $('#products').replaceChildren(...formations.map(productCard));
  if (services) services.replaceChildren(...products.filter((p) => p.category === 'Service').map(productCard));
}
async function loadProducts() {
  try { const data = await api('/api/products'); showProducts(data.products); }
  catch (e) {
    const message = 'Le catalogue est temporairement indisponible. ' + e.message;
    $('#products').replaceChildren(el('p', 'empty', message));
    const services = document.getElementById('services');
    if (services) services.replaceChildren(el('p', 'empty', message));
  }
}

// --- Mes inscriptions et administration ---
function formatPi(n) { return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 7 }) + ' Pi'; }
function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}
function orderCard(o, admin) {
  const card = el('article', 'order');
  const top = el('div', 'order-top');
  top.append(el('strong', null, o.name), el('span', 'badge ' + o.status, STATUS_LABELS[o.status] || o.status));
  card.append(top, el('p', 'order-meta', [formatDate(o.createdAt), formatPi(o.amount), admin ? '@' + o.username : null].filter(Boolean).join(' · ')));
  card.append(el('p', 'order-ref', 'Référence : ' + o.paymentId));
  if (admin && o.txid) card.append(el('p', 'order-ref', 'Transaction : ' + o.txid));
  if (!admin && o.status === 'completed') {
    // Message interne à l'application (sans redirection vers une messagerie extérieure), prérempli avec la référence.
    const link = el('button', 'link-button', 'Écrire à l’Institut');
    link.type = 'button';
    link.addEventListener('click', () => writeToInstitute('Offre : ' + o.name + '\nRéférence du paiement : ' + o.paymentId + '\n'));
    card.append(link);
  }
  if (!admin && o.status === 'approved') card.append(el('p', 'order-note', 'Paiement en cours : il sera finalisé à votre prochaine connexion.'));
  return card;
}
async function loadMine() {
  if (!piAccessToken) return;
  const root = $('#my-orders');
  try {
    const data = await api('/api/my-orders', { accessToken: piAccessToken });
    myOrders = data.orders;
    updateHome();
    root.replaceChildren();
    if (!data.orders.length) root.append(el('p', 'empty', 'Aucune inscription pour le moment. Choisissez une offre dans le catalogue.'));
    for (const o of data.orders) root.append(orderCard(o, false));
  } catch (e) { root.replaceChildren(el('p', 'empty', 'Inscriptions indisponibles : ' + e.message)); }
}
function renderAdmin() {
  if (!adminData) return;
  const s = adminData.summary;
  const stats = $('#admin-summary');
  stats.replaceChildren();
  for (const [label, value] of [['Recettes confirmées', formatPi(s.totalPi)], ['Inscriptions confirmées', s.completed], ['En attente', s.pending], ['Annulées', s.cancelled]]) {
    const box = el('div', 'stat');
    box.append(el('span', 'stat-value', String(value)), el('span', 'stat-label', label));
    stats.append(box);
  }
  if (adminData.chain) {
    const c = adminData.chain;
    stats.append(el('p', 'stats-chain', 'Chaîne connectée : ' + c.farms + ' exploitation(s) · ' + c.plots + ' parcelle(s) · ' + c.lots + ' lot(s) tracé(s) · ' + c.events + ' étape(s)'));
  }
  if (adminData.network !== 'mainnet') stats.append(el('p', 'stats-note', 'Testnet : montants en Pi de test, sans valeur.'));
  const perProduct = $('#admin-products');
  perProduct.replaceChildren();
  if (!s.byProduct.length) perProduct.append(el('p', 'empty', 'Aucune recette confirmée.'));
  for (const p of s.byProduct) {
    const row = el('div', 'order row');
    row.append(el('strong', null, p.name), el('span', 'row-value', p.completed + (p.completed > 1 ? ' inscriptions' : ' inscription') + ' · ' + formatPi(p.totalPi)));
    perProduct.append(row);
  }
  const filter = $('#admin-filter').value;
  const list = adminData.orders.filter((o) => filter === 'all' || o.status === filter);
  const root = $('#admin-orders');
  root.replaceChildren();
  if (!list.length) root.append(el('p', 'empty', 'Aucune inscription.'));
  for (const o of list) root.append(orderCard(o, true));
}
async function loadAdmin() {
  if (!piAccessToken || !piIsAdmin) return;
  try { adminData = await api('/api/admin/orders', { accessToken: piAccessToken }); renderAdmin(); }
  catch (e) { $('#admin-orders').replaceChildren(el('p', 'empty', 'Administration indisponible : ' + e.message)); }
}
function refreshSpaces() {
  if (!piUser) return;
  loadMine();
  if (typeof loadFarm === 'function') loadFarm();
  if (typeof loadAcademy === 'function') loadAcademy();
  if (typeof loadAdvice === 'function') loadAdvice();
  if (piIsAdmin) { loadAdmin(); if (typeof loadAdminAcademy === 'function') loadAdminAcademy(); }
}
function showSpaces() {
  $('#mes-inscriptions').hidden = false;
  $('#exploitation').hidden = false;
  for (const node of document.querySelectorAll('.login-needed')) node.hidden = true;
  for (const node of document.querySelectorAll('.member-only')) node.hidden = false;
  $('#administration').hidden = !piIsAdmin;
  const adminEntry = document.getElementById('admin-entry');
  if (adminEntry) adminEntry.hidden = !piIsAdmin;
  refreshSpaces();
}

// Le SDK est initialisé une seule fois, au chargement, avec le réglage Sandbox fourni par le serveur.
async function initPi() {
  try { piConfig = await api('/api/config'); } catch { /* réglages par défaut : Testnet, Sandbox */ }
  // Étiquette du catalogue : réseau réel (Testnet ou Mainnet) fourni par le serveur.
  const pill = document.getElementById('catalogue-pill');
  if (pill) pill.textContent = 'Propositions à valider · ' + networkLabel();
  if (!window.Pi) { status('Ouvrez l’application depuis Pi Browser.'); return; }
  try {
    window.Pi.init({ version: '2.0', sandbox: Boolean(piConfig.sandbox) });
    piReady = true;
    status(networkLabel() + ' — connectez-vous avec Pi.');
  } catch (e) {
    status('SDK Pi non initialisé : ' + e.message);
  }
}

// Un paiement incomplet peut être signalé avant que le jeton d'accès soit disponible :
// il est mis en attente, puis traité dès que la connexion est vérifiée.
async function processIncomplete() {
  if (!pendingIncomplete || !piAccessToken) return;
  const payment = pendingIncomplete;
  pendingIncomplete = null;
  try {
    const result = await api('/api/payments/incomplete', {
      paymentId: payment.identifier, txid: payment.transaction?.txid, accessToken: piAccessToken
    });
    if (result.status === 'completed') toast(result.message || 'Paiement précédent finalisé.');
    if (result.status === 'completed' || result.status === 'cancelled') refreshSpaces();
  } catch (e) { toast('Paiement précédent à vérifier : ' + e.message); }
}

// Pi.authenticate ne répond jamais hors du Pi Browser (Chrome, Firefox…) ni sur une adresse non enregistrée
// dans le Developer Portal : au-delà de ce délai, un message clair remplace l'attente silencieuse.
const PI_AUTH_TIMEOUT_MS = Number(window.BSME_PI_AUTH_TIMEOUT_MS) || 25000;
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function connectPi() {
  if (!window.Pi) {
    toast('Le SDK Pi est indisponible. Ouvrez cette application dans Pi Browser.');
    status('Ouvrez l’application depuis Pi Browser.');
    return;
  }
  if (!piReady) await initPi();
  if (!piReady) return;
  const button = $('#connect');
  if (button.disabled) return;
  button.disabled = true;
  status('Connexion à Pi en cours… Acceptez la demande de Pi Browser.');
  try {
    const auth = await withTimeout(window.Pi.authenticate(['username', 'payments'], (payment) => {
      if (payment && payment.identifier) { pendingIncomplete = payment; processIncomplete(); }
    }), PI_AUTH_TIMEOUT_MS, 'Pi ne répond pas. La connexion Pi fonctionne uniquement dans le Pi Browser : si vous êtes dans Chrome ou un autre navigateur, ouvrez l’application depuis le Pi Browser.');
    piUser = auth.user;
    piAccessToken = auth.accessToken;
    const verified = await api('/api/pi-auth', { accessToken: piAccessToken });
    piIsAdmin = Boolean(verified.isAdmin);
    status('Connecté avec Pi : @' + piUser.username + ' — ' + networkLabel());
    const label = document.getElementById('connect-label');
    if (label) label.textContent = '@' + piUser.username; else $('#connect').textContent = '@' + piUser.username;
    $('#connect').classList.add('on');
    $('#connect').setAttribute('aria-label', 'Compte Pi @' + piUser.username + ' : mes inscriptions');
    toast('Connexion Pi vérifiée côté serveur.');
    await processIncomplete();
    showSpaces();
  } catch (e) {
    toast('Connexion Pi impossible : ' + e.message);
    status('Connexion Pi non établie : ' + e.message);
  } finally {
    button.disabled = false;
  }
}
async function buy(product, button) {
  if (!piReady || !piUser || !piAccessToken || !window.Pi) {
    toast('Connectez-vous d’abord avec Pi : bouton « Connexion Pi », en haut à droite.');
    return;
  }
  button.disabled = true;
  try {
    window.Pi.createPayment({
      amount: product.amount,
      memo: product.name,
      metadata: { productId: product.id, app: 'Bio Star Monde Éden' }
    }, {
      onReadyForServerApproval: async (paymentId) => {
        try {
          await api('/api/payments/approve', { paymentId, productId: product.id, accessToken: piAccessToken });
        } catch (e) { toast('Approbation serveur refusée : ' + e.message); }
      },
      onReadyForServerCompletion: async (paymentId, txid) => {
        try {
          const result = await api('/api/payments/complete', { paymentId, txid, accessToken: piAccessToken });
          const label = product.category === 'Service' ? 'Réservation confirmée' : 'Inscription confirmée';
          toast(result.status === 'completed' ? label + ' : ' + product.name + '. Retrouvez-la dans « Mes inscriptions ».' : (result.message || 'Paiement terminé.'));
          refreshSpaces();
        } catch (e) { toast('Vérification du paiement nécessaire : ' + e.message); }
      },
      onCancel: async (paymentId) => {
        try { await api('/api/payments/cancel', { paymentId, accessToken: piAccessToken }); } catch {}
        toast('Paiement annulé.');
        refreshSpaces();
      },
      onError: (error) => toast('Erreur de paiement : ' + (error?.message || 'inconnue'))
    });
  } catch (e) {
    toast('Paiement non lancé : ' + e.message);
  } finally {
    button.disabled = false;
  }
}
// Une fois connecté, le bouton du compte mène à « Mes inscriptions ».
$('#connect').addEventListener('click', () => {
  if (piUser) { goTo('mes-inscriptions'); return; }
  connectPi();
});
// Boutons « Connexion Pi » placés dans les écrans (exploitation, registre).
for (const button of document.querySelectorAll('[data-connect]')) button.addEventListener('click', () => connectPi());
// Boutons qui demandent la connexion puis ouvrent un écran (« Enregistrer une activité »).
for (const button of document.querySelectorAll('[data-connect-then]')) {
  button.addEventListener('click', async () => {
    if (!piUser) await connectPi();
    if (piUser) goTo(button.dataset.connectThen);
  });
}
const netButton = document.getElementById('net-btn');
if (netButton) netButton.addEventListener('click', () => toast($('#status').textContent));

// --- Accueil : compteurs et activité récente, à partir des données du compte Pi ---
function setText(id, text) { const n = document.getElementById(id); if (n) n.textContent = text; }
function updateHome() {
  if (!document.getElementById('stat-farms')) return;
  const farm = typeof farmData !== 'undefined' && farmData ? farmData : null;
  const academy = typeof academyData !== 'undefined' && academyData ? academyData : null;
  const plots = farm ? farm.plots || [] : [];
  const lots = farm ? farm.lots || [] : [];
  const areaPlots = plots.reduce((sum, p) => sum + (Number(p.areaHa) || 0), 0);
  const area = farm && farm.farm && Number(farm.farm.areaHa) ? Number(farm.farm.areaHa) : areaPlots;
  setText('stat-farms', farm && farm.farm ? '1' : '0');
  setText('stat-farms-cap', piUser ? (farm && farm.farm ? farm.farm.name : 'Créez la fiche de votre exploitation') : 'Connectez-vous avec Pi');
  setText('stat-courses', String(academy ? academy.courses.filter((c) => c.enrolled).length : 0));
  setText('stat-lots', String(lots.length));
  setText('stat-ha', area.toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
  const root = document.getElementById('home-activity');
  if (!root) return;
  if (!piUser) { root.replaceChildren(el('p', 'empty', 'Connectez-vous avec Pi pour voir votre activité.')); return; }
  const items = [];
  for (const o of myOrders) items.push({ at: o.createdAt, icon: '🎓', title: (o.status === 'completed' ? 'Inscription confirmée : ' : o.status === 'cancelled' ? 'Paiement annulé : ' : 'Paiement en cours : ') + o.name, sub: formatPi(o.amount) });
  for (const l of lots) {
    items.push({ at: l.createdAt, icon: '🧺', title: 'Lot créé : ' + l.product, sub: l.code });
    for (const e of l.events || []) items.push({ at: e.createdAt || e.date, icon: '🔎', title: (EVENT_LABELS[e.type] || e.type) + ' · ' + l.product, sub: l.code });
  }
  for (const a of academy ? academy.attestations || [] : []) items.push({ at: a.issuedAt, icon: '📜', title: 'Attestation obtenue : ' + a.courseTitle, sub: a.code });
  if (farm && farm.farm) items.push({ at: farm.farm.createdAt, icon: '🌱', title: 'Exploitation enregistrée : ' + farm.farm.name, sub: [farm.farm.region, farm.farm.country].filter(Boolean).join(', ') });
  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (!items.length) { root.replaceChildren(el('p', 'empty', 'Aucune activité enregistrée pour le moment.')); return; }
  const list = el('ul', 'activity');
  for (const it of items.slice(0, 6)) {
    const li = el('li');
    const text = el('div');
    text.append(el('b', null, it.title), el('span', null, [formatDate(it.at), it.sub].filter(Boolean).join(' · ')));
    li.append(el('span', 'emoji', it.icon), text);
    list.append(li);
  }
  root.replaceChildren(list);
}

// --- Registre : export des données du compte et vérification d'un code ---
const exportButton = document.getElementById('export-data');
if (exportButton) exportButton.addEventListener('click', () => {
  if (!piUser) { connectPi(); return; }
  const farm = typeof farmData !== 'undefined' && farmData ? farmData : {};
  const academy = typeof academyData !== 'undefined' && academyData ? academyData : {};
  const data = {
    application: 'BioStarMondeEden', exporteLe: new Date().toISOString(), compte: '@' + piUser.username,
    inscriptions: myOrders, exploitation: farm.farm || null, parcelles: farm.plots || [], lots: farm.lots || [],
    formations: (academy.courses || []).filter((c) => c.enrolled).map((c) => ({ id: c.id, titre: c.name || c.title, modules: (c.modules || []).map((m) => ({ titre: m.title, statut: m.status })) })),
    attestations: academy.attestations || []
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'biostarmondeeden-' + piUser.username + '.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  toast('Fichier de vos données téléchargé.');
});
const verifyForm = document.getElementById('verify-form');
if (verifyForm) verifyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = $('#verify-code').value.trim().toUpperCase();
  if (/^ATT-[A-Z0-9]{8}$/.test(code)) location.href = '/attestation.html?code=' + encodeURIComponent(code);
  else if (/^BSME-[A-Z0-9]{8}$/.test(code)) location.href = '/lot.html?code=' + encodeURIComponent(code);
  else toast('Code attendu : BSME- ou ATT- suivi de 8 caractères.');
});
$('#refresh-mine').addEventListener('click', loadMine);
$('#refresh-admin').addEventListener('click', () => { loadAdmin(); if (typeof loadAdminAcademy === 'function') loadAdminAcademy(); });
$('#admin-filter').addEventListener('change', renderAdmin);
$('#year').textContent = new Date().getFullYear();
initPi();
loadProducts();
