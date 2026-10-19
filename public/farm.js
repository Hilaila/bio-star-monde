// Mon exploitation (BioFarm Manager) et lots tracés (BioTrace).
// Utilise common.js ($, api, el, formatDay, formatQuantity, EVENT_LABELS, renderTimeline, traceUrl)
// et app.js (piAccessToken, toast). Appelé par app.js après la connexion Pi.
let farmData = null;

const field = (form, name) => form.elements.namedItem(name);
function formValues(form) {
  const values = {};
  for (const [k, v] of new FormData(form).entries()) values[k] = typeof v === 'string' ? v.trim() : v;
  return values;
}
function localToday() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
async function submitWith(button, action) {
  button.disabled = true;
  try { await action(); } catch (e) { toast(e.message); } finally { button.disabled = false; }
}

async function loadFarm() {
  if (!piAccessToken) return;
  try {
    farmData = await api('/api/farm', { accessToken: piAccessToken });
    renderFarm();
  } catch (e) { $('#farm-status').textContent = 'Exploitation indisponible : ' + e.message; }
}

function renderFarm() {
  const { farm } = farmData;
  $('#farm-status').textContent = '';
  $('#farm-content').hidden = !farm;
  if (!farm) {
    $('#farm-card').hidden = true;
    openFarmForm(null);
    return;
  }
  $('#farm-form').hidden = true;
  $('#farm-card').hidden = false;
  renderFarmCard(farm);
  renderPlots();
  renderLots();
}

function renderFarmCard(farm) {
  const card = $('#farm-card');
  card.replaceChildren();
  const top = el('div', 'order-top');
  const edit = el('button', 'button secondary small', 'Modifier');
  edit.type = 'button';
  edit.addEventListener('click', () => openFarmForm(farm));
  top.append(el('h3', 'farm-name', farm.name), edit);
  const place = [farm.locality, farm.region, farm.country].filter(Boolean).join(', ');
  card.append(top, el('p', 'order-meta', place + (farm.areaHa ? ' · ' + formatQuantity(farm.areaHa, 'ha') : '')));
  if (farm.practices) card.append(el('p', 'farm-practices', farm.practices));
  const trainings = farmData.trainings || [];
  card.append(el('p', 'farm-training', trainings.length
    ? 'Formations confirmées : ' + trainings.join(' · ') + (farm.showTraining ? ' — affichées sur la page de vos lots.' : ' — non affichées sur la page de vos lots.')
    : 'Aucune formation confirmée pour le moment. Une fois inscrit, vous pourrez l’afficher sur la page de vos lots.'));
  const attestations = farmData.attestations || [];
  if (attestations.length) card.append(el('p', 'farm-training', 'Attestations BioStar Academy : ' + attestations.map((a) => a.courseTitle).join(' · ')));
}

function openFarmForm(farm) {
  const form = $('#farm-form');
  form.reset();
  form.hidden = false;
  $('#farm-form-title').textContent = farm ? 'Modifier la fiche de mon exploitation' : 'Créer la fiche de mon exploitation';
  $('#farm-cancel').hidden = !farm;
  if (!farm) return;
  $('#farm-card').hidden = true;
  field(form, 'name').value = farm.name;
  field(form, 'country').value = farm.country;
  field(form, 'region').value = farm.region;
  field(form, 'locality').value = farm.locality || '';
  field(form, 'areaHa').value = farm.areaHa ?? '';
  field(form, 'practices').value = farm.practices || '';
  field(form, 'showTraining').checked = Boolean(farm.showTraining);
}

function renderPlots() {
  const root = $('#plots');
  root.replaceChildren();
  const plots = farmData.plots;
  if (!plots.length) root.append(el('p', 'empty', 'Aucune parcelle. Ajoutez-en une pour y rattacher vos lots.'));
  for (const p of plots) {
    const card = el('article', 'order');
    const top = el('div', 'order-top');
    const edit = el('button', 'link-button', 'Modifier');
    edit.type = 'button';
    edit.addEventListener('click', () => editPlot(p));
    top.append(el('strong', null, p.name), edit);
    const details = [p.areaHa ? formatQuantity(p.areaHa, 'ha') : null, p.soil ? 'Sol : ' + p.soil : null, p.crop ? 'Culture : ' + p.crop : null].filter(Boolean);
    card.append(top, el('p', 'order-meta', details.join(' · ') || 'Aucun détail.'));
    root.append(card);
  }
  const select = field($('#lot-form'), 'plotId');
  const current = select.value;
  select.replaceChildren(new Option('Sans parcelle', ''), ...plots.map((p) => new Option(p.name, p.id)));
  select.value = plots.some((p) => p.id === current) ? current : '';
}
function resetPlotForm() {
  const form = $('#plot-form');
  form.reset();
  field(form, 'id').value = '';
  $('#plot-summary').textContent = 'Ajouter une parcelle';
  $('#plot-cancel').hidden = true;
}
function editPlot(p) {
  const form = $('#plot-form');
  resetPlotForm();
  field(form, 'id').value = p.id;
  field(form, 'name').value = p.name;
  field(form, 'areaHa').value = p.areaHa ?? '';
  field(form, 'soil').value = p.soil || '';
  field(form, 'crop').value = p.crop || '';
  $('#plot-summary').textContent = 'Modifier la parcelle « ' + p.name + ' »';
  $('#plot-cancel').hidden = false;
  $('#plot-panel').open = true;
  $('#plot-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderLots() {
  const root = $('#lots');
  root.replaceChildren();
  if (!farmData.lots.length) root.append(el('p', 'empty', 'Aucun lot. Créez un lot pour obtenir son code et sa page de traçabilité.'));
  for (const lot of farmData.lots) root.append(lotCard(lot));
}
function lotCard(lot) {
  const card = el('article', 'order lot');
  const top = el('div', 'order-top');
  top.append(el('strong', null, lot.product), el('span', 'code-badge', lot.code));
  const meta = [formatQuantity(lot.quantity, lot.unit), lot.plotName ? 'Parcelle : ' + lot.plotName : null, 'Créé le ' + formatDay(lot.createdAt)].filter(Boolean);
  card.append(top, el('p', 'order-meta', meta.join(' · ')), renderTimeline(lot.events));

  const actions = el('div', 'lot-actions');
  const addButton = el('button', 'button secondary small', 'Ajouter une étape');
  addButton.type = 'button';
  const qrButton = el('button', 'button secondary small', 'Code QR');
  qrButton.type = 'button';
  const link = el('a', 'order-link', 'Page publique');
  link.href = '/lot.html?code=' + encodeURIComponent(lot.code);
  actions.append(addButton, qrButton, link);
  card.append(actions);

  const qrBox = el('div', 'qr-box');
  qrBox.hidden = true;
  qrButton.addEventListener('click', () => {
    if (!qrBox.hasChildNodes()) {
      qrBox.append(BSMEQR.toSvg(traceUrl(lot.code), { title: 'Code QR du lot ' + lot.code }), el('p', 'qr-caption', lot.product + ' · ' + lot.code), el('p', 'qr-url', traceUrl(lot.code)));
    }
    qrBox.hidden = !qrBox.hidden;
  });
  const form = eventForm(lot);
  form.hidden = true;
  addButton.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) field(form, 'type').focus();
  });
  card.append(qrBox, form);
  return card;
}

function eventForm(lot) {
  const form = el('form', 'form event-form');
  form.noValidate = true;
  const type = el('select');
  type.name = 'type';
  for (const [value, label] of Object.entries(EVENT_LABELS)) type.append(new Option(label, value));
  const date = el('input');
  date.type = 'date';
  date.name = 'date';
  date.value = localToday();
  date.max = localToday();
  const note = el('textarea');
  note.name = 'note';
  note.maxLength = 300;
  note.rows = 2;
  note.placeholder = 'Compost maison 2 t/ha, variété locale, lieu de stockage…';
  const typeLabel = el('label', null, 'Étape');
  typeLabel.append(type);
  const dateLabel = el('label', null, 'Date');
  dateLabel.append(date);
  const noteLabel = el('label', 'span2', 'Précision');
  noteLabel.append(note);
  const grid = el('div', 'grid2');
  grid.append(typeLabel, dateLabel, noteLabel);
  const submit = el('button', 'button', 'Enregistrer l’étape');
  submit.type = 'submit';
  const buttons = el('div', 'form-actions');
  buttons.append(submit);
  form.append(grid, el('p', 'form-note', 'Une étape enregistrée ne peut être ni modifiée ni effacée. Pour rectifier une erreur, ajoutez une étape « Correction ».'), buttons);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!date.value) { toast('Indiquez la date de l’étape.'); return; }
    submitWith(submit, async () => {
      await api('/api/lots/event', { accessToken: piAccessToken, code: lot.code, event: { type: type.value, date: date.value, note: note.value.trim() } });
      toast('Étape enregistrée pour le lot ' + lot.code + '.');
      await loadFarm();
    });
  });
  return form;
}

$('#farm-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const v = formValues(form);
  if (!v.name || !v.country || !v.region) { toast('Renseignez le nom de l’exploitation, le pays et la région.'); return; }
  submitWith(form.querySelector('[type=submit]'), async () => {
    await api('/api/farm/save', {
      accessToken: piAccessToken,
      farm: { name: v.name, country: v.country, region: v.region, locality: v.locality, areaHa: v.areaHa, practices: v.practices, showTraining: field(form, 'showTraining').checked }
    });
    toast('Fiche de l’exploitation enregistrée.');
    await loadFarm();
  });
});
$('#farm-cancel').addEventListener('click', () => { $('#farm-form').hidden = true; $('#farm-card').hidden = false; });

$('#plot-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const v = formValues(form);
  if (!v.name) { toast('Indiquez le nom de la parcelle.'); return; }
  submitWith(form.querySelector('[type=submit]'), async () => {
    await api('/api/plots/save', { accessToken: piAccessToken, plot: { id: v.id || undefined, name: v.name, areaHa: v.areaHa, soil: v.soil, crop: v.crop } });
    toast(v.id ? 'Parcelle modifiée.' : 'Parcelle ajoutée.');
    resetPlotForm();
    $('#plot-panel').open = false;
    await loadFarm();
  });
});
$('#plot-cancel').addEventListener('click', () => { resetPlotForm(); $('#plot-panel').open = false; });

$('#lot-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const v = formValues(form);
  if (!v.product) { toast('Indiquez le produit du lot.'); return; }
  submitWith(form.querySelector('[type=submit]'), async () => {
    const result = await api('/api/lots/create', { accessToken: piAccessToken, lot: { product: v.product, plotId: v.plotId || undefined, quantity: v.quantity, unit: v.unit || undefined } });
    toast('Lot créé : ' + result.lot.code + '. Ajoutez ses étapes au fil de la production.');
    form.reset();
    $('#lot-panel').open = false;
    await loadFarm();
  });
});
$('#refresh-farm').addEventListener('click', loadFarm);
