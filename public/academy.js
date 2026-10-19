// BioStar Academy : leçons des formations, progression, modules pratiques validés par le formateur, attestations.
// Et, pour le promoteur : validations pratiques, demandes de conseil et messages (espace Administration).
// Utilise common.js ($, api, el, formatDay) et app.js (piAccessToken, piIsAdmin, toast, connectPi, buy).
let academyData = null;
const openCourses = new Set();

function attestationUrl(code) {
  return location.origin + '/attestation.html?code=' + encodeURIComponent(code);
}

async function loadAcademy() {
  const root = $('#academy-courses');
  if (!piAccessToken) {
    root.replaceChildren(el('p', 'empty', 'Connectez-vous avec Pi pour suivre vos formations et recevoir vos attestations.'));
    $('#academy-attestations').replaceChildren();
    return;
  }
  try {
    academyData = await api('/api/academy', { accessToken: piAccessToken });
    renderAcademy();
  } catch (e) { root.replaceChildren(el('p', 'empty', 'Académie indisponible : ' + e.message)); }
}

function statusLabel(m) {
  if (m.status === 'done') return m.practical ? 'Validé par le formateur' : 'Terminé';
  if (m.status === 'pending') return 'En attente de validation';
  return m.practical ? 'Validation par le formateur' : 'À suivre';
}

function moduleItem(course, m) {
  const item = el('details', 'module');
  const summary = el('summary', 'module-head');
  summary.append(el('span', 'module-state ' + (m.status || 'todo'), m.status === 'done' ? '✓' : m.status === 'pending' ? '…' : String(m.index + 1)));
  const label = el('span', 'module-label');
  label.append(el('strong', null, m.title), el('small', null, [m.format, statusLabel(m)].filter(Boolean).join(' · ')));
  summary.append(label);
  item.append(summary);
  if (!m.points) return item;
  const list = el('ol', 'lesson');
  for (const p of m.points) list.append(el('li', null, p));
  item.append(list);
  if (!course.enrolled) { item.append(el('p', 'form-note', 'Aperçu réservé au promoteur : la progression se suit avec un compte inscrit.')); return item; }
  const actions = el('div', 'form-actions');
  const button = (label, action, secondary) => {
    const b = el('button', 'button small' + (secondary ? ' secondary' : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => changeProgress(course.id, m.index, action, b));
    return b;
  };
  if (m.practical) {
    if (m.status === 'done') actions.append(el('span', 'badge', 'Validé par le formateur'));
    else if (m.status === 'pending') actions.append(el('span', 'badge approved', 'En attente de validation'));
    else actions.append(button('Demander la validation au formateur', 'request'));
  } else if (m.status === 'done') {
    if (!course.attestation) actions.append(button('Marquer comme non terminé', 'undo', true));
  } else {
    actions.append(button('J’ai terminé ce module', 'done'));
  }
  item.append(actions);
  return item;
}

function courseCard(course) {
  const card = el('details', 'panel fold course');
  card.dataset.id = course.id;
  if (openCourses.has(course.id)) card.open = true;
  card.addEventListener('toggle', () => { if (card.open) openCourses.add(course.id); else openCourses.delete(course.id); });
  const summary = el('summary', 'course-head');
  const top = el('span', 'order-top');
  const state = course.attestation ? ['Attestation obtenue', ''] : course.enrolled ? ['Inscrit', ''] : course.preview ? ['Aperçu', 'approved'] : ['Non inscrit', 'cancelled'];
  top.append(el('strong', null, course.name), el('span', 'badge ' + state[1], state[0]));
  const pct = Math.round((course.done / course.total) * 100);
  const meter = el('span', 'meter');
  const fill = el('span');
  fill.style.width = pct + '%';
  meter.append(fill);
  summary.append(top, el('span', 'order-meta', [course.duration, course.format, course.done + ' module(s) sur ' + course.total].filter(Boolean).join(' · ')), meter);
  card.append(summary);

  if (!course.enrolled && !course.preview) {
    const box = el('div', 'enroll');
    box.append(el('p', null, 'Les leçons de cette formation sont réservées aux inscrits. L’inscription se paie en Pi et donne aussi accès aux sessions pratiques de la ferme-école.'));
    const b = el('button', 'button small', 'S’inscrire pour ' + Number(course.amount).toLocaleString('fr-FR') + ' Pi');
    b.type = 'button';
    b.addEventListener('click', () => buy({ id: course.id, name: course.name, amount: course.amount, category: 'Formation' }, b));
    box.append(b);
    card.append(box);
  }
  const list = el('div', 'modules');
  for (const m of course.modules) list.append(moduleItem(course, m));
  card.append(list);
  return card;
}

function attestationCard(a) {
  const card = el('article', 'order attestation');
  const top = el('div', 'order-top');
  top.append(el('strong', null, a.courseTitle), el('span', 'code-badge', a.code));
  card.append(top, el('p', 'order-meta', 'Délivrée le ' + formatDay(a.issuedAt) + ' · BioStar Academy'));
  const actions = el('div', 'lot-actions');
  const qrButton = el('button', 'button secondary small', 'Code QR');
  qrButton.type = 'button';
  const link = el('a', 'order-link', 'Page de vérification');
  link.href = '/attestation.html?code=' + encodeURIComponent(a.code);
  actions.append(qrButton, link);
  const qrBox = el('div', 'qr-box');
  qrBox.hidden = true;
  qrButton.addEventListener('click', () => {
    if (!qrBox.hasChildNodes()) qrBox.append(BSMEQR.toSvg(attestationUrl(a.code), { title: 'Code QR de l’attestation ' + a.code }), el('p', 'qr-caption', a.courseTitle + ' · ' + a.code), el('p', 'qr-url', attestationUrl(a.code)));
    qrBox.hidden = !qrBox.hidden;
  });
  card.append(actions, qrBox);
  return card;
}

function renderAcademy() {
  const root = $('#academy-courses');
  root.replaceChildren();
  const list = [...academyData.courses].sort((a, b) => Number(b.enrolled) - Number(a.enrolled));
  if (!list.some((c) => c.enrolled) && !list.some((c) => c.preview)) {
    root.append(el('p', 'hint', 'Vous n’êtes inscrit à aucune formation. Ouvrez une formation pour voir son programme et vous inscrire.'));
  }
  for (const c of list) root.append(courseCard(c));
  const atts = $('#academy-attestations');
  atts.replaceChildren();
  if (!academyData.attestations.length) atts.append(el('p', 'empty', 'Terminez tous les modules d’une formation, modules pratiques validés compris, pour recevoir votre attestation.'));
  for (const a of academyData.attestations) atts.append(attestationCard(a));
}

async function changeProgress(courseId, moduleIndex, action, button) {
  button.disabled = true;
  try {
    const r = await api('/api/academy/progress', { accessToken: piAccessToken, courseId, moduleIndex, action });
    openCourses.add(courseId);
    if (r.newAttestation) toast('Formation terminée : votre attestation ' + r.course.attestation.code + ' est délivrée.');
    else if (action === 'request') toast('Demande envoyée au formateur de la ferme-école.');
    await loadAcademy();
  } catch (e) { toast(e.message); button.disabled = false; }
}

// --- Administration : validations, demandes de conseil, messages ---
async function loadAdminAcademy() {
  if (!piAccessToken || !piIsAdmin) return;
  try { renderAdminAcademy(await api('/api/admin/academy', { accessToken: piAccessToken })); }
  catch (e) { $('#admin-validations').replaceChildren(el('p', 'empty', 'Indisponible : ' + e.message)); }
}

function adminAction(button, path, body, message) {
  button.disabled = true;
  api(path, { accessToken: piAccessToken, ...body })
    .then((r) => { toast(typeof message === 'function' ? message(r) : message); loadAdminAcademy(); })
    .catch((e) => { toast(e.message); button.disabled = false; });
}

function renderAdminAcademy(d) {
  const val = $('#admin-validations');
  val.replaceChildren();
  if (!d.validations.length) val.append(el('p', 'empty', 'Aucun module pratique à valider.'));
  for (const v of d.validations) {
    const card = el('article', 'order');
    const top = el('div', 'order-top');
    top.append(el('strong', null, '@' + v.username), el('span', 'order-meta', formatDay(v.requestedAt)));
    card.append(top, el('p', 'order-meta', v.courseTitle + ' · module ' + (v.moduleIndex + 1) + ' : ' + v.moduleTitle));
    const actions = el('div', 'form-actions');
    const ok = el('button', 'button small', 'Valider');
    ok.type = 'button';
    ok.addEventListener('click', () => adminAction(ok, '/api/admin/validate', { username: v.username, courseId: v.courseId, moduleIndex: v.moduleIndex, decision: 'approve' },
      (r) => (r.attestation ? 'Module validé. Attestation délivrée : ' + r.attestation.code : 'Module validé.')));
    const no = el('button', 'button secondary small', 'Refuser');
    no.type = 'button';
    no.addEventListener('click', () => adminAction(no, '/api/admin/validate', { username: v.username, courseId: v.courseId, moduleIndex: v.moduleIndex, decision: 'reject' }, 'Demande refusée.'));
    actions.append(ok, no);
    card.append(actions);
    val.append(card);
  }

  const adv = $('#admin-advice');
  adv.replaceChildren();
  if (!d.advice.length) adv.append(el('p', 'empty', 'Aucune demande de conseil.'));
  for (const a of d.advice) {
    const card = el('article', 'order');
    const top = el('div', 'order-top');
    top.append(el('strong', null, '@' + a.username + ' · ' + a.crop), el('span', 'badge ' + (a.status === 'open' ? 'approved' : ''), a.status === 'open' ? 'À traiter' : 'Répondu'));
    card.append(top, el('p', 'order-meta', formatDay(a.createdAt)));
    if (a.symptom) card.append(el('p', null, a.symptom));
    if (a.cause) card.append(el('p', 'form-note', 'Orientation proposée par la fiche : ' + a.cause));
    if (a.message) card.append(el('p', 'farm-practices', a.message));
    if (a.status === 'open') {
      const form = el('form', 'form');
      form.noValidate = true;
      const label = el('label', null, 'Réponse');
      const area = el('textarea');
      area.maxLength = 2000;
      area.rows = 3;
      label.append(area);
      const send = el('button', 'button small', 'Envoyer la réponse');
      send.type = 'submit';
      form.append(label, send);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (area.value.trim().length < 2) { toast('Écrivez une réponse.'); return; }
        adminAction(send, '/api/admin/answer', { id: a.id, answer: area.value.trim() }, 'Réponse envoyée.');
      });
      card.append(form);
    } else card.append(el('p', 'answer', a.answer));
    adv.append(card);
  }

  const msg = $('#admin-messages');
  msg.replaceChildren();
  if (!d.messages.length) msg.append(el('p', 'empty', 'Aucun message.'));
  for (const m of d.messages) {
    const card = el('article', 'order');
    const top = el('div', 'order-top');
    top.append(el('strong', null, '@' + m.username), el('span', 'order-meta', formatDay(m.createdAt)));
    card.append(top, el('p', 'farm-practices', m.message));
    msg.append(card);
  }
  const chain = $('#admin-academy-count');
  chain.textContent = 'BioStar Academy : ' + d.attestations + ' attestation(s) délivrée(s) · ' + d.validations.length + ' validation(s) en attente · ' + d.advice.filter((a) => a.status === 'open').length + ' demande(s) de conseil à traiter.';
}

$('#refresh-academy').addEventListener('click', loadAcademy);
loadAcademy();
