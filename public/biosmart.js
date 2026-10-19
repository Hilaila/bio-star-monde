// BioSmart : fiches d'orientation (calendrier agricole, recettes de bio-intrants, diagnostic) et demandes d'avis à un conseiller.
// BioImpact : estimation du carbone stocké. Contact : message à l'Institut depuis l'application.
// Fiches fondées sur des règles, à valider par le promoteur ; l'assistant d'intelligence artificielle viendra ensuite.
// Utilise common.js ($, api, el, formatDay) et app.js (piAccessToken, toast, connectPi).

const keep = {
  get(k, d) { try { const v = localStorage.getItem('bsme:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bsme:' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } }
};
const F0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const F1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const F2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const toNumber = (s) => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : 0; };
function qty(v, u) {
  if (u === 'kg' && v > 0 && v < 1) return F0.format(v * 1000) + ' g';
  if (u === 't' && v > 0 && v < 1) return F0.format(v * 1000) + ' kg';
  if (u === 'L' && v > 0 && v < 1) return F0.format(v * 1000) + ' mL';
  if (u === 'm³' && v > 0 && v < 1) return F0.format(v * 1000) + ' L';
  return (v >= 100 ? F0 : v >= 10 ? F1 : F2).format(v) + ' ' + u;
}
async function requireConnection() {
  if (piAccessToken) return true;
  await connectPi();
  return Boolean(piAccessToken);
}
function chips(root, items, current, onPick) {
  root.replaceChildren();
  for (const [value, label] of items) {
    const b = el('button', 'chip', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => onPick(value));
    root.append(b);
  }
}

// ===================== Calendrier agricole =====================
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const REGIONS = {
  bf: {
    label: 'Burkina Faso · Sahel',
    of: (m) => (m >= 5 && m <= 8 ? 'rain' : m >= 9 || m <= 1 ? 'cool' : 'hot'),
    legend: [['rain', 'Saison des pluies'], ['cool', 'Contre-saison'], ['hot', 'Saison sèche chaude']],
    seasons: {
      rain: { name: 'Saison des pluies', focus: 'cultures pluviales', tip: 'Inspectez le maïs deux fois par semaine contre la chenille légionnaire et associez le niébé aux céréales pour nourrir le sol.' },
      cool: { name: 'Contre-saison', focus: 'maraîchage', tip: 'Lancez les pépinières de tomate, de chou et d’oignon. Paillez les planches pour garder l’humidité et préparez l’extrait de neem avant l’arrivée des ravageurs.' },
      hot: { name: 'Saison sèche chaude', focus: 'préparation des sols', tip: 'Creusez les zaï et les demi-lunes, remplissez les fosses fumières et produisez le biochar avant les premières pluies.' }
    }
  },
  tg: {
    label: 'Sud-Togo · Lomé',
    of: (m) => (m >= 3 && m <= 6 ? 'rain' : m === 7 ? 'cool' : m === 8 || m === 9 ? 'rain2' : 'hot'),
    legend: [['rain', 'Saisons des pluies'], ['cool', 'Petite saison sèche'], ['hot', 'Grande saison sèche']],
    seasons: {
      rain: { name: 'Grande saison des pluies', focus: 'premier cycle de maïs', tip: 'Semez le maïs, le niébé et l’arachide du premier cycle. Installez les haies vives et remplissez les composts avec les résidus verts.' },
      cool: { name: 'Petite saison sèche', focus: 'récolte et stockage', tip: 'Récoltez le premier cycle, séchez bien les grains avant de les stocker et préparez les parcelles du second cycle.' },
      rain2: { name: 'Petite saison des pluies', focus: 'second cycle de maïs', tip: 'Semez le maïs et le niébé du second cycle, surveillez la chenille légionnaire et préparez les planches de maraîchage.' },
      hot: { name: 'Grande saison sèche', focus: 'maraîchage irrigué', tip: 'Lancez les cultures maraîchères sous irrigation, paillez les planches et préparez l’extrait de neem. Produisez le biochar avec les résidus secs.' }
    }
  }
};
let region = keep.get('region', 'bf');
if (!REGIONS[region]) region = 'bf';

function renderCalendar() {
  const R = REGIONS[region];
  const now = new Date();
  const m = now.getMonth();
  const season = R.seasons[R.of(m)];
  chips($('#cal-regions'), Object.entries(REGIONS).map(([k, r]) => [k, r.label]), region, (k) => { region = k; keep.set('region', k); renderCalendar(); });
  $('#cal-month').textContent = MONTHS[m].charAt(0).toUpperCase() + MONTHS[m].slice(1) + ' ' + now.getFullYear();
  $('#cal-season').textContent = season.name;
  $('#cal-focus').textContent = season.focus;
  $('#cal-tip').textContent = season.tip;
  const strip = $('#cal-strip');
  strip.replaceChildren();
  MONTHS.forEach((name, i) => {
    const s = R.of(i) === 'rain2' ? 'rain' : R.of(i);
    const cell = el('span', 'month m-' + s + (i === m ? ' now' : ''), name.charAt(0).toUpperCase());
    cell.title = name;
    strip.append(cell);
  });
  strip.setAttribute('aria-label', 'Calendrier agricole : nous sommes en ' + MONTHS[m] + ', ' + season.name.toLowerCase());
  const legend = $('#cal-legend');
  legend.replaceChildren();
  for (const [k, label] of R.legend) { const item = el('span'); item.append(el('i', 'sw m-' + k), document.createTextNode(label)); legend.append(item); }
}

// ===================== Recettes de bio-intrants =====================
const RECIPES = [
  { id: 'neem', short: 'Neem', name: 'Extrait de graines de neem 5 %', kind: 'Biopesticide', basis: 'ha', def: 0.25, step: 0.05,
    targets: 'chenilles, pucerons, aleurodes, thrips', hint: 'Bouillie : 300 L par hectare (1 ha = 10 000 m²).',
    calc(a) { const b = 300 * a; return { out: qty(b, 'L') + ' de bouillie prête à pulvériser', rows: [['Graines de neem sèches, décortiquées et pilées', 0.05 * b, 'kg'], ['Eau propre', b, 'L'], ['Savon noir liquide (adhésif)', 0.001 * b, 'L']] }; },
    steps: ['Piler finement les graines la veille au soir.', 'Laisser macérer la poudre dans l’eau 12 à 24 h, à l’ombre.', 'Filtrer avec un tissu fin, ajouter le savon et bien mélanger.', 'Pulvériser en fin d’après-midi, sur les deux faces des feuilles.', 'Renouveler tous les 7 à 10 jours tant que les ravageurs sont présents.'],
    caution: 'Utiliser la bouillie dans les 24 h. Porter gants et masque pendant le pilage.' },
  { id: 'piment', short: 'Piment-ail', name: 'Répulsif piment-ail', kind: 'Répulsif', basis: 'ha', def: 0.25, step: 0.05,
    targets: 'thrips, pucerons, jeunes chenilles', hint: 'Bouillie : 300 L par hectare.',
    calc(a) { const b = 300 * a; return { out: qty(b, 'L') + ' de bouillie', rows: [['Gousses d’ail', 0.01 * b, 'kg'], ['Piment fort frais', 0.01 * b, 'kg'], ['Eau propre', b, 'L'], ['Savon noir liquide', 0.001 * b, 'L']] }; },
    steps: ['Piler l’ail et le piment ensemble.', 'Faire macérer 24 h dans un dixième de l’eau, récipient couvert.', 'Filtrer, compléter avec le reste de l’eau et ajouter le savon.', 'Pulvériser tôt le matin ou en fin de journée, jamais en plein soleil.'],
    caution: 'Protéger les yeux et les mains : le piment brûle. Alterner avec le neem pour éviter les résistances.' },
  { id: 'compost', short: 'Compost', name: 'Compost en tas ou en fosse', kind: 'Biofertilisant', basis: 'ha', def: 0.5, step: 0.25, doses: [['Céréales et niébé', 5], ['Maraîchage', 20]],
    targets: 'fertilité du sol, rétention d’eau, recul du striga', hint: 'Dose de compost par hectare selon l’usage choisi.',
    calc(a, d) { const c = d * a, raw = 2 * c; return { out: qty(c, 't') + ' de compost mûr, en 3 mois environ', rows: [['Matières sèches (tiges de mil, paille, feuilles)', raw * 0.55, 't'], ['Fumier ou fientes', raw * 0.35, 't'], ['Cendre de bois', raw * 0.05, 't'], ['Vieux compost ou terre de surface (amorce)', raw * 0.05, 't'], ['Eau sur 3 mois (repère)', raw * 0.4, 'm³']] }; },
    steps: ['Monter des couches de 20 cm de matières sèches et de 10 cm de fumier.', 'Saupoudrer chaque couche de cendre et l’arroser jusqu’à l’humidité d’une éponge essorée.', 'Couvrir de paille ou de terre.', 'Retourner le tas à 3, 6 et 9 semaines.', 'Le compost est mûr quand il est sombre, friable et sent le sous-bois.'],
    caution: 'Ne mettre ni plastique ni plantes malades dans le tas.' },
  { id: 'biochar', short: 'Biochar', name: 'Biochar chargé au compost', kind: 'Amendement', basis: 'ha', def: 0.5, step: 0.25, doses: [['Apport modéré', 2], ['Sol très dégradé', 5]],
    targets: 'sols pauvres et sableux, stockage durable du carbone', hint: 'Dose de biochar par hectare selon l’état du sol.',
    calc(a, d) { const bc = d * a; return { out: qty(bc, 't') + ' de biochar, soit environ ' + F1.format(bc * 2.2) + ' tCO₂e stockées', rows: [['Biomasse sèche (tiges de cotonnier ou de mil, coques)', bc / 0.25, 't'], ['Compost mûr pour charger le biochar', bc, 't']], biochar: bc }; },
    steps: ['Carboniser la biomasse dans un fût à tirage inversé ou une fosse conique, sans la laisser finir en cendre.', 'Éteindre à l’eau dès que la fumée devient claire.', 'Concasser en morceaux de moins de 1 cm.', 'Mélanger avec la même masse de compost et laisser reposer 2 semaines.', 'Épandre puis incorporer dans les 10 premiers centimètres du sol.'],
    caution: 'Carboniser loin des habitations et des greniers, avec de l’eau à portée de main.' },
  { id: 'purin', short: 'Engrais liquide', name: 'Engrais liquide au fumier', kind: 'Biofertilisant', basis: 'L', def: 100, step: 10,
    targets: 'croissance des légumes-feuilles et des jeunes plants', hint: 'Volume d’engrais dilué, prêt à l’emploi.',
    calc(v) { const c = v / 10; return { out: qty(v, 'L') + ' prêts à l’emploi, pour environ ' + F0.format(v / 0.75) + ' plants', rows: [['Fumier frais (bovin ou ovin)', c / 5, 'kg'], ['Eau de macération', c, 'L'], ['Eau de dilution', v - c, 'L']] }; },
    steps: ['Mettre le fumier dans un sac en toile et le suspendre dans l’eau de macération.', 'Couvrir et remuer tous les 2 jours pendant 10 jours.', 'Diluer 1 volume de concentré dans 9 volumes d’eau.', 'Arroser au pied : 0,5 à 1 L par plant toutes les 2 semaines.'],
    caution: 'Ne pas arroser les feuilles des légumes consommés crus.' },
  { id: 'vinaigre', short: 'Désherbant', name: 'Désherbant au vinaigre', kind: 'Bioherbicide', basis: 'L', def: 10, step: 5,
    targets: 'jeunes adventices des allées et des bordures', hint: 'Volume de mélange à préparer.',
    calc(v) { return { out: qty(v, 'L') + ' de mélange', rows: [['Vinaigre blanc à 8 %', v * 0.99, 'L'], ['Savon noir liquide (mouillant)', v * 0.01, 'L']] }; },
    steps: ['Mélanger le vinaigre et le savon sans faire mousser.', 'Pulvériser par temps ensoleillé et sans vent, directement sur les jeunes adventices.', 'Protéger les cultures voisines avec un carton.', 'Renouveler après 10 à 15 jours si les adventices repoussent.'],
    caution: 'Produit non sélectif : il brûle aussi les cultures. Ne pas ajouter de sel, qui stérilise le sol. Vérifier son admissibilité auprès de votre organisme de certification.' }
];
let recipeId = keep.get('recipe', 'neem');
const recipeAmount = {};
const recipeDose = {};
const currentRecipe = () => RECIPES.find((r) => r.id === recipeId) || RECIPES[0];

function renderRecipe() {
  const r = currentRecipe();
  chips($('#rec-chips'), RECIPES.map((x) => [x.id, x.short]), r.id, (id) => { recipeId = id; keep.set('recipe', id); renderRecipe(); });
  $('#rec-kind').textContent = r.kind;
  $('#rec-name').textContent = r.name;
  $('#rec-targets').textContent = 'Agit sur : ' + r.targets;
  $('#rec-amount-label').firstChild.textContent = r.basis === 'ha' ? 'Surface à traiter (ha)' : 'Volume à préparer (L)';
  const input = $('#rec-amount');
  input.step = String(r.step);
  input.value = String(recipeAmount[r.id] ?? r.def);
  $('#rec-hint').textContent = r.hint;
  const doseLabel = $('#rec-dose-label');
  doseLabel.hidden = !r.doses;
  if (r.doses) {
    const sel = $('#rec-dose');
    sel.replaceChildren(...r.doses.map((d, i) => new Option(d[0] + ' · ' + d[1] + ' t/ha', String(i))));
    sel.value = String(recipeDose[r.id] || 0);
  }
  const steps = $('#rec-steps');
  steps.replaceChildren(...r.steps.map((s) => el('li', null, s)));
  $('#rec-caution').textContent = r.caution;
  updateRecipe();
}
function updateRecipe() {
  const r = currentRecipe();
  const a = toNumber($('#rec-amount').value);
  recipeAmount[r.id] = a;
  if (r.doses) recipeDose[r.id] = Number($('#rec-dose').value) || 0;
  const res = r.calc(a, r.doses ? r.doses[recipeDose[r.id] || 0][1] : undefined);
  $('#rec-out').textContent = res.out;
  const body = $('#rec-rows');
  body.replaceChildren();
  for (const [label, v, u] of res.rows) {
    const tr = el('tr');
    tr.append(el('td', null, label), el('td', 'qty', qty(v, u)));
    body.append(tr);
  }
  const toCarbon = $('#rec-to-carbon');
  toCarbon.hidden = !res.biochar;
  if (res.biochar) toCarbon.textContent = 'Reporter ' + qty(res.biochar, 't') + ' de biochar dans BioImpact';
}

// ===================== Diagnostic par symptômes =====================
const DIAG = {
  'Tomate': [
    { s: 'Feuilles jaunes et enroulées, petites mouches blanches sous les feuilles', c: 'Aleurodes, vecteurs du virus de l’enroulement jaune (TYLCV)', u: 'Élevée', a: ['Poser des pièges jaunes englués entre les rangs.', 'Pulvériser l’extrait de neem 5 % tous les 7 jours.', 'Arracher et détruire les plants déjà atteints par le virus.', 'Protéger la pépinière avec un filet anti-insectes.'], r: 'neem' },
    { s: 'Taches brunes à cercles concentriques sur les feuilles du bas', c: 'Alternariose (champignon)', u: 'Moyenne', a: ['Retirer et brûler les feuilles touchées.', 'Pailler pour éviter les éclaboussures de terre.', 'Arroser au pied, le matin.', 'Ne pas replanter tomate, piment ou aubergine sur la parcelle pendant 3 ans.'] },
    { s: 'Fruits troués avec une chenille à l’intérieur', c: 'Noctuelle de la tomate (Helicoverpa armigera)', u: 'Élevée', a: ['Ramasser et détruire les fruits atteints.', 'Traiter au neem dès le début de la floraison.', 'Alterner avec le répulsif piment-ail.'], r: 'neem' }
  ],
  'Chou': [{ s: 'Petits trous dans les feuilles, petites chenilles vertes qui se tortillent', c: 'Teigne du chou (Plutella xylostella)', u: 'Élevée', a: ['Pulvériser le neem 5 % tous les 5 à 7 jours.', 'Alterner avec le piment-ail pour éviter les résistances.', 'Associer le chou avec l’oignon ou la tomate.'], r: 'neem' }],
  'Oignon': [{ s: 'Taches argentées et stries blanches sur les feuilles', c: 'Thrips', u: 'Moyenne', a: ['Pulvériser le piment-ail, puis le neem en alternance.', 'Arroser par aspersion : l’eau gêne les thrips.', 'Désherber les bordures où ils se réfugient.'], r: 'piment' }],
  'Maïs': [{ s: 'Feuilles trouées en fenêtres, sciure dans le cornet', c: 'Chenille légionnaire d’automne (Spodoptera frugiperda)', u: 'Élevée', a: ['Inspecter 20 plants deux fois par semaine.', 'Verser une pincée de cendre ou de sable sec dans le cornet.', 'Pulvériser le neem dans le cornet, tôt le matin.', 'Installer le système push-pull : desmodium entre les rangs, brachiaria en bordure.'], r: 'neem' }],
  'Mil / sorgho': [{ s: 'Petites plantes à fleurs roses ou violettes au pied des céréales', c: 'Striga, plante parasite des racines', u: 'Élevée', a: ['Arracher les striga avant leur floraison et les brûler.', 'Apporter du compost : un sol riche limite le striga.', 'Faire une rotation avec le niébé ou l’arachide, qui font germer le striga sans le nourrir.'], r: 'compost' }],
  'Niébé': [{ s: 'Fleurs qui tombent, gousses percées', c: 'Foreur des gousses (Maruca vitrata)', u: 'Moyenne', a: ['Pulvériser le neem au début de la floraison.', 'Répéter tous les 7 jours pendant la floraison.'], r: 'neem' }],
  'Volaille': [
    { s: 'Toux, diarrhée verdâtre, cou tordu, morts en série', c: 'Suspicion de maladie de Newcastle', u: 'Critique', a: ['Isoler immédiatement les oiseaux malades.', 'Appeler le vétérinaire ou l’auxiliaire d’élevage aujourd’hui.', 'Vacciner le reste du troupeau selon le calendrier.', 'Désinfecter le poulailler et le matériel.'], note: 'Les remèdes naturels ne remplacent pas la vaccination.' },
    { s: 'Plumes ébouriffées, amaigrissement, diarrhée', c: 'Parasites internes possibles', u: 'Moyenne', a: ['Nettoyer et sécher la litière.', 'Donner une eau propre, changée chaque jour.', 'Demander à l’auxiliaire d’élevage un déparasitage adapté.'] }
  ]
};
let crop = 'Tomate';
let symptom = null;

function renderDiagnosis() {
  chips($('#diag-crops'), Object.keys(DIAG).map((k) => [k, k]), crop, (k) => { crop = k; symptom = null; renderDiagnosis(); });
  const opts = $('#diag-symptoms');
  opts.replaceChildren();
  DIAG[crop].forEach((d, i) => {
    const b = el('button', 'opt', d.s);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(i === symptom));
    b.addEventListener('click', () => { symptom = i; renderDiagnosis(); $('#diag-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    opts.append(b);
  });
  const out = $('#diag-result');
  out.replaceChildren();
  if (symptom === null) { out.append(el('p', 'empty', 'Choisissez ce que vous observez pour voir la cause probable et le traitement biologique.')); return; }
  const d = DIAG[crop][symptom];
  const box = el('div', 'panel diag');
  const top = el('div', 'order-top');
  top.append(el('p', 'eyebrow', 'CAUSE PROBABLE'), el('span', 'badge ' + (d.u === 'Critique' ? 'cancelled' : d.u === 'Élevée' ? 'approved' : ''), 'Urgence ' + d.u.toLowerCase()));
  box.append(top, el('h4', 'diag-cause', d.c));
  const list = el('ol', 'lesson');
  for (const a of d.a) list.append(el('li', null, a));
  box.append(list);
  if (d.note) box.append(el('p', 'caution', d.note));
  const recipe = RECIPES.find((r) => r.id === d.r);
  if (recipe) {
    const b = el('button', 'button small secondary', 'Calculer la recette : ' + recipe.short.toLowerCase());
    b.type = 'button';
    b.addEventListener('click', () => { recipeId = recipe.id; renderRecipe(); $('#bs-recipes').scrollIntoView({ behavior: 'smooth' }); });
    box.append(b);
  }
  box.append(el('p', 'form-note', 'Diagnostic d’orientation. En cas de doute, demandez l’avis d’un conseiller ci-dessous.'));
  out.append(box);
}

async function loadAdvice() {
  const root = $('#my-advice');
  if (!piAccessToken) { root.replaceChildren(); $('#my-advice-title').hidden = true; return; }
  try {
    const { advice } = await api('/api/advice/mine', { accessToken: piAccessToken });
    $('#my-advice-title').hidden = !advice.length;
    root.replaceChildren();
    for (const a of advice) {
      const card = el('article', 'order');
      const top = el('div', 'order-top');
      top.append(el('strong', null, a.crop + (a.symptom ? ' · ' + a.symptom : '')), el('span', 'badge ' + (a.status === 'open' ? 'approved' : ''), a.status === 'open' ? 'En attente de réponse' : 'Répondu'));
      card.append(top, el('p', 'order-meta', formatDay(a.createdAt)));
      if (a.message) card.append(el('p', 'farm-practices', a.message));
      if (a.answer) { const ans = el('p', 'answer'); ans.append(el('strong', null, 'Réponse du conseiller. '), document.createTextNode(a.answer)); card.append(ans); }
      root.append(card);
    }
  } catch (e) { root.replaceChildren(el('p', 'empty', 'Demandes indisponibles : ' + e.message)); }
}

// ===================== BioImpact : carbone =====================
const PRACTICES = [
  { k: 'af', label: 'Agroforesterie et régénération naturelle assistée', unit: 'ha', coef: 2.0, note: '≈ 2,0 tCO₂e par ha et par an' },
  { k: 'zai', label: 'Zaï et demi-lunes', unit: 'ha', coef: 1.0, note: '≈ 1,0 tCO₂e par ha et par an' },
  { k: 'comp', label: 'Compost épandu', unit: 'ha', coef: 0.5, note: '≈ 0,5 tCO₂e par ha et par an' },
  { k: 'bc', label: 'Biochar apporté au sol', unit: 't', coef: 2.2, note: '≈ 2,2 tCO₂e par tonne, stockage durable' }
];
const carbon = Object.assign({ af: 2, zai: 1.5, comp: 3, bc: 1 }, keep.get('carbon', {}));

function renderCarbonInputs() {
  const root = $('#carbon-inputs');
  root.replaceChildren();
  for (const p of PRACTICES) {
    const label = el('label', null, p.label + ' (' + p.unit + ')');
    const input = el('input');
    input.type = 'number'; input.min = '0'; input.step = '0.5'; input.inputMode = 'decimal';
    input.id = 'carbon-' + p.k; input.value = String(carbon[p.k]);
    input.addEventListener('input', updateCarbon);
    label.append(input, el('small', 'form-note', p.note));
    root.append(label);
  }
  updateCarbon();
}
function updateCarbon() {
  for (const p of PRACTICES) carbon[p.k] = toNumber($('#carbon-' + p.k).value);
  keep.set('carbon', carbon);
  const parts = PRACTICES.map((p) => ({ label: p.label, v: carbon[p.k] * p.coef }));
  const yearly = parts[0].v + parts[1].v + parts[2].v;
  const once = parts[3].v;
  const total = yearly + once;
  const stats = $('#carbon-stats');
  stats.replaceChildren();
  for (const [label, value] of [['tCO₂e la première année', F1.format(total)], ['tCO₂e chaque année ensuite', F1.format(yearly)], ['tCO₂e stockées par le biochar', F1.format(once)], ['ha de pratiques déclarées', F1.format(carbon.af + carbon.zai + carbon.comp)]]) {
    const box = el('div', 'stat');
    box.append(el('span', 'stat-value', value), el('span', 'stat-label', label));
    stats.append(box);
  }
  const bars = $('#carbon-bars');
  bars.replaceChildren();
  for (const p of parts) {
    const row = el('div', 'bar-row');
    const track = el('span', 'meter');
    const fill = el('span');
    fill.style.width = (total ? (p.v / total) * 100 : 0) + '%';
    track.append(fill);
    row.append(el('span', 'bar-label', p.label), track, el('span', 'bar-value', F1.format(p.v) + ' t'));
    bars.append(row);
  }
}

// ===================== Événements =====================
$('#rec-amount').addEventListener('input', updateRecipe);
$('#rec-dose').addEventListener('change', updateRecipe);
$('#rec-to-carbon').addEventListener('click', () => {
  const r = currentRecipe();
  const res = r.calc(recipeAmount[r.id] ?? r.def, r.doses[recipeDose[r.id] || 0][1]);
  $('#carbon-bc').value = String(Math.round(res.biochar * 100) / 100);
  updateCarbon();
  $('#bioimpact').scrollIntoView({ behavior: 'smooth' });
  toast(qty(res.biochar, 't') + ' de biochar reportées dans BioImpact.');
});

$('#advice-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type=submit]');
  const message = $('#advice-message').value.trim();
  const d = symptom === null ? null : DIAG[crop][symptom];
  if (!d && !message) { toast('Choisissez un symptôme ou décrivez le problème.'); return; }
  if (!(await requireConnection())) return;
  button.disabled = true;
  try {
    await api('/api/advice', { accessToken: piAccessToken, advice: { crop, symptom: d ? d.s : '', cause: d ? d.c : '', message } });
    $('#advice-message').value = '';
    toast('Demande envoyée au conseiller. Sa réponse apparaîtra dans « Mes demandes ».');
    await loadAdvice();
  } catch (e) { toast(e.message); } finally { button.disabled = false; }
});

$('#contact-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type=submit]');
  const message = $('#contact-message').value.trim();
  if (message.length < 5) { toast('Écrivez au moins quelques mots.'); return; }
  if (!(await requireConnection())) return;
  button.disabled = true;
  try {
    await api('/api/contact', { accessToken: piAccessToken, message });
    $('#contact-message').value = '';
    toast('Message envoyé à l’Institut.');
  } catch (e) { toast(e.message); } finally { button.disabled = false; }
});

// Préremplit le formulaire de contact (depuis « Mes inscriptions » par exemple).
function writeToInstitute(text) {
  $('#contact-message').value = text;
  $('#contact').scrollIntoView({ behavior: 'smooth' });
  $('#contact-message').focus({ preventScroll: true });
}

renderCalendar();
renderRecipe();
renderDiagnosis();
renderCarbonInputs();
