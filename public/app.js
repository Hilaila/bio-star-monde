// Page d'accueil : catalogue, connexion Pi, paiements, Mes inscriptions et Administration.
// Fonctions communes ($, api, el…) : common.js ; exploitation et lots : farm.js.
let piUser = null;
let piAccessToken = null;
let piReady = false;
let piConfig = { sandbox: true, network: 'testnet' };
let pendingIncomplete = null;
let piIsAdmin = false;
let adminData = null;
const CONTACT_EMAIL = 'zoubgaefils@gmail.com';
const STATUS_LABELS = { completed: 'Confirmée', approved: 'En attente', cancelled: 'Annulée' };

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4200);
}
function status(message) { $('#status').textContent = message; }
function networkLabel() { return (piConfig.network === 'mainnet' ? 'Mainnet' : 'Testnet') + (piConfig.sandbox ? ' (Sandbox)' : ''); }
function showProducts(products) {
  const root = $('#products');
  root.replaceChildren();
  for (const p of products) {
    const card = document.createElement('article'); card.className = 'product';
    const cat = document.createElement('div'); cat.className = 'category'; cat.textContent = p.category;
    const title = document.createElement('h3'); title.textContent = p.name;
    const desc = document.createElement('p'); desc.textContent = p.description;
    const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = [p.axis, p.duration, p.format].filter(Boolean).join(' · ');
    const price = document.createElement('div'); price.className = 'price'; price.textContent = p.amount.toLocaleString('fr-FR') + ' Pi';
    const btn = document.createElement('button'); btn.className = 'button'; btn.textContent = p.category === 'Service' ? 'Réserver en Pi' : 'S’inscrire en Pi'; btn.type = 'button';
    btn.addEventListener('click', () => buy(p, btn));
    card.append(cat, title, desc, meta, price, btn); root.append(card);
  }
}
async function loadProducts() {
  try { const data = await api('/api/products'); showProducts(data.products); }
  catch (e) { $('#products').textContent = 'Le catalogue est temporairement indisponible. ' + e.message; }
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
  $('#nav-farm').hidden = false;
  $('#nav-admin').hidden = !piIsAdmin;
  $('#administration').hidden = !piIsAdmin;
  refreshSpaces();
}

// Le SDK est initialisé une seule fois, au chargement, avec le réglage Sandbox fourni par le serveur.
async function initPi() {
  try { piConfig = await api('/api/config'); } catch { /* réglages par défaut : Testnet, Sandbox */ }
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

async function connectPi() {
  if (!window.Pi) {
    toast('Le SDK Pi est indisponible. Ouvrez cette application dans Pi Browser.');
    status('Ouvrez l’application depuis Pi Browser.');
    return;
  }
  if (!piReady) await initPi();
  if (!piReady) return;
  try {
    const auth = await window.Pi.authenticate(['username', 'payments'], (payment) => {
      if (payment && payment.identifier) { pendingIncomplete = payment; processIncomplete(); }
    });
    piUser = auth.user;
    piAccessToken = auth.accessToken;
    const verified = await api('/api/pi-auth', { accessToken: piAccessToken });
    piIsAdmin = Boolean(verified.isAdmin);
    status('Connecté avec Pi : @' + piUser.username + ' — ' + networkLabel());
    $('#connect').textContent = '@' + piUser.username;
    toast('Connexion Pi vérifiée côté serveur.');
    await processIncomplete();
    showSpaces();
  } catch (e) {
    toast('Connexion Pi impossible : ' + e.message);
    status('Connexion Pi non établie.');
  }
}
async function buy(product, button) {
  if (!piReady || !piUser || !piAccessToken || !window.Pi) {
    toast('Connectez-vous d’abord avec Pi Browser.');
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
  if (piUser) { $('#mes-inscriptions').scrollIntoView({ behavior: 'smooth' }); return; }
  connectPi();
});
$('#nav-mine').addEventListener('click', async (event) => {
  if (piUser) return;
  event.preventDefault();
  await connectPi();
  if (piUser) $('#mes-inscriptions').scrollIntoView({ behavior: 'smooth' });
});
$('#refresh-mine').addEventListener('click', loadMine);
$('#refresh-admin').addEventListener('click', () => { loadAdmin(); if (typeof loadAdminAcademy === 'function') loadAdminAcademy(); });
$('#admin-filter').addEventListener('change', renderAdmin);
$('#year').textContent = new Date().getFullYear();
initPi();
loadProducts();
