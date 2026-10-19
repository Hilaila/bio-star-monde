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
