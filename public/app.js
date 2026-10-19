const $ = (s) => document.querySelector(s);
let piUser = null;
let piAccessToken = null;
let piReady = false;
let piConfig = { sandbox: true, network: 'testnet' };
let pendingIncomplete = null;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4200);
}
function status(message) { $('#status').textContent = message; }
function networkLabel() { return (piConfig.network === 'mainnet' ? 'Mainnet' : 'Testnet') + (piConfig.sandbox ? ' (Sandbox)' : ''); }
// Adresse de l'API, fixée dans config.js (vide : même domaine, fonction Appwrite ou serveur Node).
const API_BASE = String(window.BSME_API_BASE || '').replace(/\/+$/, '');
async function api(url, body) {
  const response = await fetch(API_BASE + url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erreur serveur (' + response.status + ')');
  return data;
}
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
    await api('/api/pi-auth', { accessToken: piAccessToken });
    status('Connecté avec Pi : @' + piUser.username + ' — ' + networkLabel());
    $('#connect').textContent = '@' + piUser.username;
    toast('Connexion Pi vérifiée côté serveur.');
    await processIncomplete();
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
          toast(result.message || 'Paiement terminé.');
        } catch (e) { toast('Vérification du paiement nécessaire : ' + e.message); }
      },
      onCancel: async (paymentId) => {
        try { await api('/api/payments/cancel', { paymentId, accessToken: piAccessToken }); } catch {}
        toast('Paiement annulé.');
      },
      onError: (error) => toast('Erreur de paiement : ' + (error?.message || 'inconnue'))
    });
  } catch (e) {
    toast('Paiement non lancé : ' + e.message);
  } finally {
    button.disabled = false;
  }
}
$('#connect').addEventListener('click', connectPi);
$('#year').textContent = new Date().getFullYear();
initPi();
loadProducts();
