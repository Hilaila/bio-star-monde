// Page publique de traçabilité d'un lot (BioTrace) : ouverte depuis le code QR, sans connexion Pi.
// Utilise common.js ($, api, el, formatDay, formatQuantity, renderTimeline, traceUrl) et qr.js (BSMEQR).

function showTrace(nodes) { $('#trace-root').replaceChildren(...nodes); }

function renderTrace(d) {
  const head = el('div', 'trace-head');
  head.append(el('h1', null, d.lot.product), el('span', 'code-badge', d.lot.code));
  const meta = el('p', 'order-meta', [formatQuantity(d.lot.quantity, d.lot.unit), 'Lot enregistré le ' + formatDay(d.lot.createdAt)].filter(Boolean).join(' · '));

  const origin = el('section', 'panel');
  origin.append(el('h2', null, 'Origine'));
  if (d.farm) {
    origin.append(el('p', 'trace-farm', d.farm.name), el('p', 'order-meta', [d.farm.locality, d.farm.region, d.farm.country].filter(Boolean).join(', ')));
    if (d.plot) {
      const plot = ['Parcelle : ' + d.plot.name, d.plot.crop ? 'culture : ' + d.plot.crop : null, d.plot.soil ? 'sol : ' + d.plot.soil : null].filter(Boolean).join(' · ');
      origin.append(el('p', null, plot));
    }
    if (d.farm.practices) {
      origin.append(el('h3', 'trace-sub', 'Pratiques déclarées'), el('p', 'farm-practices', d.farm.practices));
    }
  }
  if (d.trainings.length) {
    const t = el('div', 'trace-training');
    t.append(el('strong', null, 'Producteur inscrit aux formations Bio Star Monde Éden'), el('p', null, d.trainings.join(' · ')));
    origin.append(t);
  }
  if (d.attestations && d.attestations.length) {
    const t = el('div', 'trace-training');
    t.append(el('strong', null, 'Attestations BioStar Academy obtenues'), el('p', null, d.attestations.map((a) => a.courseTitle + ' (' + formatDay(a.issuedAt) + ')').join(' · ')));
    origin.append(t);
  }

  const qr = el('section', 'panel trace-qr');
  qr.append(el('h2', null, 'Code QR du lot'), BSMEQR.toSvg(traceUrl(d.lot.code), { title: 'Code QR du lot ' + d.lot.code }), el('p', 'qr-url', traceUrl(d.lot.code)));

  const grid = el('div', 'trace-grid');
  grid.append(origin, qr);
  const steps = el('section', 'panel');
  steps.append(el('h2', null, 'Historique du lot'), renderTimeline(d.events));
  const notice = el('p', 'trace-notice', 'Informations déclarées par le producteur et enregistrées dans Bio Star Monde Éden. Une étape enregistrée ne peut être ni modifiée ni effacée. Cette page n’est pas un certificat biologique.');
  showTrace([head, meta, grid, steps, notice]);
  document.title = d.lot.product + ' · ' + d.lot.code + ' — Bio Star Monde Éden';
}

async function loadTrace(code) {
  if (!code) {
    showTrace([el('h1', null, 'Vérifier un lot'), el('p', 'empty', 'Saisissez le code inscrit sur l’étiquette (BSME- suivi de 8 caractères) ou scannez son code QR.')]);
    return;
  }
  showTrace([el('p', 'empty', 'Chargement du lot ' + code + '…')]);
  try {
    renderTrace(await api('/api/trace?code=' + encodeURIComponent(code)));
  } catch (e) {
    showTrace([el('h1', null, 'Lot introuvable'), el('p', 'empty', e.message)]);
  }
}

const initialCode = (new URLSearchParams(location.search).get('code') || '').trim().toUpperCase();
$('#trace-code').value = initialCode;
$('#trace-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = $('#trace-code').value.trim().toUpperCase();
  history.replaceState(null, '', code ? '?code=' + encodeURIComponent(code) : location.pathname);
  loadTrace(code);
});
loadTrace(initialCode);
