// Page publique de vérification d'une attestation (BioStar Academy), ouverte depuis le code QR, sans connexion Pi.
// Utilise common.js ($, api, el, formatDay) et qr.js (BSMEQR).

function showAttestation(nodes) { $('#att-root').replaceChildren(...nodes); }
const attestationPageUrl = (code) => location.origin + '/attestation.html?code=' + encodeURIComponent(code);

function renderAttestation(d) {
  const a = d.attestation;
  const head = el('div', 'trace-head');
  head.append(el('h1', null, a.courseTitle), el('span', 'code-badge', a.code));
  const verdict = el('p', 'verdict ' + (d.valid ? 'ok' : 'ko'), d.valid ? 'Attestation valide' : 'Attestation retirée par l’Institut');

  const info = el('section', 'panel');
  info.append(el('h2', null, 'Attestation de suivi'));
  const rows = [['Titulaire', '@' + a.username + ' (compte Pi)'], ['Formation', a.courseTitle], ['Délivrée le', formatDay(a.issuedAt)], ['Délivrée par', 'Bio Star Monde Éden, Institut international moderne innovant biologique d’agriculture et d’élevage']];
  const list = el('dl', 'facts');
  for (const [k, v] of rows) { list.append(el('dt', null, k), el('dd', null, v)); }
  info.append(list, el('p', 'trace-sub', 'Empreinte numérique (SHA-256)'), el('p', 'order-ref', a.hash));

  const qr = el('section', 'panel trace-qr');
  qr.append(el('h2', null, 'Code QR de l’attestation'), BSMEQR.toSvg(attestationPageUrl(a.code), { title: 'Code QR de l’attestation ' + a.code }), el('p', 'qr-url', attestationPageUrl(a.code)));

  const grid = el('div', 'trace-grid');
  grid.append(info, qr);
  const notice = el('p', 'trace-notice', 'Attestation de suivi délivrée par BioStar Academy quand tous les modules de la formation sont terminés, modules pratiques validés par un formateur de l’Institut. Ce n’est pas un diplôme d’État.');
  showAttestation([head, verdict, grid, notice]);
  document.title = a.courseTitle + ' · ' + a.code + ' — Bio Star Monde Éden';
}

async function loadAttestation(code) {
  if (!code) {
    showAttestation([el('h1', null, 'Vérifier une attestation'), el('p', 'empty', 'Saisissez le code inscrit sur l’attestation (ATT- suivi de 8 caractères) ou scannez son code QR.')]);
    return;
  }
  showAttestation([el('p', 'empty', 'Vérification de ' + code + '…')]);
  try {
    renderAttestation(await api('/api/attestation?code=' + encodeURIComponent(code)));
  } catch (e) {
    showAttestation([el('h1', null, 'Attestation introuvable'), el('p', 'empty', e.message)]);
  }
}

const startCode = (new URLSearchParams(location.search).get('code') || '').trim().toUpperCase();
$('#att-code').value = startCode;
$('#att-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = $('#att-code').value.trim().toUpperCase();
  history.replaceState(null, '', code ? '?code=' + encodeURIComponent(code) : location.pathname);
  loadAttestation(code);
});
loadAttestation(startCode);
