// Fonctions communes aux pages de Bio Star Monde Éden (accueil et traçabilité).
const $ = (s) => document.querySelector(s);
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
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function formatDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function formatQuantity(quantity, unit) {
  if (quantity === null || quantity === undefined) return '';
  return Number(quantity).toLocaleString('fr-FR', { maximumFractionDigits: 4 }) + (unit ? ' ' + unit : '');
}

// Étapes d'un lot (BioTrace), dans l'ordre où elles se présentent en général.
const EVENT_LABELS = {
  preparation: 'Préparation du sol',
  semis: 'Semis ou plantation',
  intrant: 'Apport d’intrant biologique',
  traitement: 'Traitement biologique',
  irrigation: 'Irrigation',
  recolte: 'Récolte',
  transformation: 'Transformation',
  stockage: 'Stockage',
  controle: 'Contrôle qualité',
  vente: 'Vente',
  correction: 'Correction',
  autre: 'Autre'
};

function renderTimeline(events) {
  const list = el('ol', 'timeline');
  if (!events.length) {
    list.append(el('li', 'timeline-empty', 'Aucune étape enregistrée pour le moment.'));
    return list;
  }
  for (const e of events) {
    const item = el('li', 'timeline-item' + (e.type === 'correction' ? ' is-correction' : ''));
    item.append(el('span', 'timeline-date', formatDay(e.date)), el('strong', null, EVENT_LABELS[e.type] || e.type));
    if (e.note) item.append(el('p', null, e.note));
    list.append(item);
  }
  return list;
}

// Adresse publique de la page de traçabilité d'un lot (celle que contient le code QR).
function traceUrl(code) {
  return location.origin + '/lot.html?code=' + encodeURIComponent(code);
}

// --- Navigation par écrans (Accueil, Académie, Bio-Lab, Marché, Carbone, Administration) ---
// Chaque adresse « #… » ouvre l'écran qui contient l'élément visé, puis fait défiler jusqu'à lui.
// Les pages sans écrans (traçabilité d'un lot, attestation, pages légales) ne sont pas concernées.
const DEFAULT_SCREEN = 'accueil';
function screenFor(id) {
  const node = id ? document.getElementById(id) : null;
  if (!node) return null;
  const screen = node.classList.contains('screen') ? node : node.closest('.screen');
  if (!screen || screen.hidden) return null; // écran inexistant ou réservé (administration sans droit)
  return { node, screen };
}
function showScreen(screen) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('is-active', s === screen);
  for (const a of document.querySelectorAll('.nav a[data-screen]')) {
    if (a.dataset.screen === screen.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
function route(id, { smooth = false } = {}) {
  if (!document.querySelector('.screen')) return false;
  const target = screenFor(id) || screenFor(DEFAULT_SCREEN);
  if (!target) return false;
  const changed = !target.screen.classList.contains('is-active');
  showScreen(target.screen);
  if (changed) window.scrollTo({ top: 0, behavior: 'auto' });
  // Élément encore masqué (par exemple « Mon exploitation » avant la connexion) : on montre son bloc parent.
  let anchor = target.node;
  const hiddenAncestor = anchor.closest('[hidden]');
  if (hiddenAncestor && hiddenAncestor !== target.screen) anchor = hiddenAncestor.parentElement || target.screen;
  if (anchor !== target.screen) requestAnimationFrame(() => anchor.scrollIntoView({ behavior: smooth && !changed ? 'smooth' : 'auto', block: 'start' }));
  return true;
}
// Ouvre un élément depuis le code (bouton, lien interne) et met l'adresse à jour.
function goTo(id) {
  if (!document.querySelector('.screen')) { const n = document.getElementById(id); if (n) n.scrollIntoView({ behavior: 'smooth' }); return; }
  if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  route(id, { smooth: true });
}
if (document.querySelector('.screen')) {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    if (!id || !screenFor(id)) return;
    event.preventDefault();
    goTo(id);
  });
  window.addEventListener('popstate', () => route(location.hash.slice(1)));
  route(location.hash.slice(1));
}
