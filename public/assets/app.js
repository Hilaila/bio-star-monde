/* Bio Star Monde Eden — application Pi Browser */
(function () {
"use strict";

/* ===================== Utilitaires ===================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const F0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const F1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const F2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const FPI = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 7 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (s) => { const v = parseFloat(String(s).replace(/[\s  ]/g, "").replace(",", ".")); return isFinite(v) ? v : 0; };
const fmtIn = (v) => String(Math.round(v * 100) / 100).replace(".", ",");
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pi = (v) => `${FPI.format(v)} π`;
const round7 = (n) => Math.round(n * 1e7) / 1e7;
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } };
const store = {
  get(k, d) { try { const v = localStorage.getItem("bsme:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem("bsme:" + k); else localStorage.setItem("bsme:" + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const ICON = {
  done: '<svg class="st st-done" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".15"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pending: '<svg class="st st-pending" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  none: '<svg class="st st-none" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  chev: '<svg class="i chev-r" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  audio: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
  lock: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
};

/* ===================== État ===================== */
const S = {
  cfg: { sandbox: false },
  cat: null,
  token: store.get("token", null),
  user: store.get("user", null),
  progress: [],
  certs: [],
  products: store.get("products", []),
  orders: [],
  offers: [],
  requests: [],
  stats: null,
  cart: {},
  region: store.get("region", "bf"),
  lang: store.get("lang", "Français"),
  localDone: store.get("localDone", {}),
  rec: store.get("rec", "neem"),
  amt: {}, dose: {},
  crop: "Tomate", symI: null,
  mcat: "Tout", q: "",
  current: "accueil",
  piReady: false,
  pendingIncomplete: null,
  photo: null,
  carb: store.get("carb", { af: 2, zai: 1.5, comp: 3, bc: 1 }),
};
const TABS = ["accueil", "academie", "biolab", "marche", "carbone"];
const isPiBrowser = /pibrowser/i.test(navigator.userAgent || "");
const canUsePi = () => S.piReady && (isPiBrowser || S.cfg.sandbox);

/* ===================== API serveur ===================== */
async function api(path, body, opts = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false && S.token) headers.Authorization = "Bearer " + S.token;
  let r;
  try {
    r = await fetch(path, { method: opts.method || (body !== undefined ? "POST" : "GET"), headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Pas de connexion au serveur. Vérifiez votre réseau puis réessayez.");
  }
  let data = null;
  try { data = await r.json(); } catch { /* réponse vide */ }
  if (r.status === 401 && S.token && opts.auth !== false) { setSession(null, null); }
  if (!r.ok) throw new Error((data && data.error) || `Erreur ${r.status}`);
  return data;
}

function setSession(token, user) {
  S.token = token; S.user = user;
  store.set("token", token); store.set("user", user);
  if (!token) { S.progress = []; S.certs = []; S.orders = []; S.offers = []; S.requests = []; }
  renderAuth(); renderAll();
}

/* ===================== Pi SDK ===================== */
async function initPi() {
  try { S.cfg = await api("/api/config", undefined, { auth: false }); } catch { /* hors ligne : valeurs par défaut */ }
  if (typeof window.Pi === "undefined") { renderAuth(); return; }
  try {
    window.Pi.init({ version: "2.0", sandbox: !!S.cfg.sandbox });
    S.piReady = true;
  } catch (e) { console.warn("Pi.init", e); }
  renderAuth();
  if (canUsePi()) login({ silent: true });
}

function withTimeout(promise, ms, message) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(message)), ms))]);
}

function onIncompletePaymentFound(payment) {
  // Appelé par le SDK pendant Pi.authenticate, avant l'ouverture de notre session : traité juste après.
  S.pendingIncomplete = payment;
}

let loginBusy = false;
async function login({ silent = false } = {}) {
  if (!canUsePi()) { if (!silent) openSheet(notInPiSheet()); return false; }
  if (loginBusy) return false;
  loginBusy = true; renderAuth();
  try {
    const auth = await withTimeout(window.Pi.authenticate(["username", "payments"], onIncompletePaymentFound), 60000, "Pi ne répond pas. Réessayez.");
    const r = await api("/api/auth/signin", { accessToken: auth.accessToken }, { auth: false });
    setSession(r.token, r.user);
    if (S.pendingIncomplete) {
      const p = S.pendingIncomplete; S.pendingIncomplete = null;
      try {
        const res = await api("/api/payments/incomplete", { payment: { identifier: p.identifier } });
        toast(res.status === "completed" ? "Un paiement en attente a été finalisé." : "Un paiement inachevé a été annulé.");
      } catch (e) { toast(e.message); }
    }
    await syncLocalProgress();
    await loadPrivate();
    if (!silent) toast(`Connecté en tant que @${r.user.username}`);
    return true;
  } catch (e) {
    if (!silent) toast(e && e.message ? e.message : "Connexion Pi impossible.");
    return false;
  } finally {
    loginBusy = false; renderAuth();
  }
}

async function requireLogin() {
  if (S.token) return true;
  return login();
}

function piPay(order) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };
    try {
      window.Pi.createPayment(
        { amount: order.amount, memo: order.memo, metadata: { orderId: order.id } },
        {
          onReadyForServerApproval: (paymentId) => {
            api("/api/payments/approve", { paymentId }).catch((e) => done(reject, e));
          },
          onReadyForServerCompletion: (paymentId, txid) => {
            api("/api/payments/complete", { paymentId, txid }).then((r) => done(resolve, r.order)).catch((e) => done(reject, e));
          },
          onCancel: () => {
            api("/api/payments/cancel", { orderId: order.id }).catch(() => {});
            done(reject, Object.assign(new Error("Paiement annulé."), { cancelled: true }));
          },
          onError: (error) => {
            done(reject, new Error((error && error.message) || "Le paiement n'a pas abouti."));
          },
        }
      );
    } catch (e) { done(reject, e); }
  });
}

/* ===================== Données privées ===================== */
async function loadPrivate() {
  if (!S.token) return;
  try {
    const me = await api("/api/me");
    S.user = me.user; store.set("user", me.user);
    S.progress = me.progress; S.certs = me.certificates;
  } catch (e) { console.warn(e); }
  const [o, p, q] = await Promise.allSettled([api("/api/orders/mine"), api("/api/products/mine"), api("/api/requests/mine")]);
  if (o.status === "fulfilled") S.orders = o.value.orders;
  if (p.status === "fulfilled") S.offers = p.value.products;
  if (q.status === "fulfilled") S.requests = q.value.requests;
  renderAll();
}

async function syncLocalProgress() {
  const entries = Object.entries(S.localDone || {});
  if (!entries.length || !S.token) return;
  for (const [courseId, list] of entries) {
    for (const idx of list) {
      try { await api("/api/progress", { courseId, moduleIndex: idx, action: "done" }); } catch { /* ignoré */ }
    }
  }
  S.localDone = {}; store.set("localDone", {});
}

async function loadPublic() {
  try {
    const r = await api("/api/products", undefined, { auth: false });
    S.products = r.products; store.set("products", r.products);
  } catch { /* garde la copie locale */ }
  try { S.stats = await api("/api/stats", undefined, { auth: false }); } catch { /* hors ligne */ }
  renderProducts(); renderGoals();
}

/* ===================== Interface générale ===================== */
let tt;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 3800); }
let lastFocus = null;
function openSheet(html) {
  lastFocus = document.activeElement;
  $("#sheet-body").innerHTML = html;
  $("#sheet").hidden = false; document.body.classList.add("lock");
  const f = $("#sheet-body").querySelector("button, input, select, textarea"); if (f) f.focus({ preventScroll: true });
}
function closeSheet() {
  if ($("#sheet").hidden) return;
  $("#sheet").hidden = true; document.body.classList.remove("lock");
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
const sheetHead = (eyebrow, title) => `<div class="sheet-head"><div><p class="eyebrow">${eyebrow}</p><h2 id="sheet-title">${title}</h2></div><button class="x" type="button" data-close aria-label="Fermer">×</button></div>`;
function measure() { const n = $(".nav"); if (n) document.documentElement.style.setProperty("--navh", n.offsetHeight + "px"); }

function go(tab) {
  if (!TABS.includes(tab)) tab = "accueil";
  S.current = tab;
  TABS.forEach((t) => { $("#s-" + t).hidden = t !== tab; });
  $$(".nav [data-tab]").forEach((b) => { if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  updateCartVis();
  window.scrollTo(0, 0);
}
function setPanel(p) {
  const rec = p !== "diag";
  $("#p-rec").hidden = !rec; $("#p-diag").hidden = rec;
  $("#tab-rec").setAttribute("aria-selected", String(rec)); $("#tab-diag").setAttribute("aria-selected", String(!rec));
}

function renderAuth() {
  const b = $("#auth-btn");
  if (S.user && S.token) { b.innerHTML = `<b>@${esc(S.user.username)}</b>`; b.classList.add("on"); b.setAttribute("aria-label", `Compte Pi de ${S.user.username}`); }
  else { b.textContent = loginBusy ? "Connexion…" : "Connexion Pi"; b.classList.remove("on"); b.removeAttribute("aria-label"); }
  $("#pi-banner").hidden = canUsePi() || !!S.token;
}

function notInPiSheet() {
  return sheetHead("Compte Pi", "Ouvrez l'application dans Pi Browser") +
    `<p>Bio Star Monde Eden utilise uniquement votre compte Pi pour vous identifier et pour les paiements. Aucun mot de passe, aucune adresse e-mail.</p>
     <ol class="lesson-points"><li>Ouvrez Pi Browser sur votre téléphone.</li><li>Recherchez « Bio Star Monde Eden ».</li><li>Touchez « Connexion Pi » et acceptez le partage de votre nom d'utilisateur.</li></ol>
     <p class="muted small">Sans connexion, vous pouvez déjà lire les leçons, utiliser les recettes, le diagnostic et le simulateur carbone.</p>
     <button class="btn btn-primary btn-block" type="button" data-close>Compris</button>`;
}

function accountSheet() {
  const u = S.user;
  return sheetHead("Compte Pi", `@${esc(u.username)}`) +
    `<p class="muted small">Connecté avec Pi. L'application ne connaît que votre nom d'utilisateur Pi et votre identifiant d'application.</p>
     <div class="stack">
       <button class="btn btn-ghost btn-block" type="button" data-go="academie" data-close>Mes parcours et certificats (${S.certs.length})</button>
       <button class="btn btn-ghost btn-block" type="button" data-go="marche" data-close>Mes achats (${S.orders.length})</button>
       <button class="btn btn-ghost btn-block" type="button" data-go="biolab" data-panel="diag" data-close>Mes demandes au conseiller (${S.requests.length})</button>
       ${u.isAdmin ? '<a class="btn btn-primary btn-block" href="/admin.html">Espace administration</a>' : ""}
       <button class="btn btn-ghost btn-block" type="button" data-act="logout">Se déconnecter de l'application</button>
     </div>`;
}

/* ===================== Accueil ===================== */
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const INIT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const REGIONS = {
  bf: { label: "Burkina Faso · Sahel",
    of: (m) => (m >= 5 && m <= 8 ? "rain" : m >= 9 || m <= 1 ? "cool" : "hot"),
    legend: [["rain", "Saison des pluies"], ["cool", "Contre-saison"], ["hot", "Saison sèche chaude"]],
    seasons: {
      rain: { name: "Saison des pluies", focus: "cultures pluviales", tip: "Inspectez le maïs deux fois par semaine contre la chenille légionnaire et associez le niébé aux céréales pour nourrir le sol." },
      cool: { name: "Contre-saison", focus: "maraîchage", tip: "Lancez les pépinières de tomate, de chou et d'oignon. Paillez les planches pour garder l'humidité et préparez l'extrait de neem avant l'arrivée des ravageurs." },
      hot: { name: "Saison sèche chaude", focus: "préparation des sols", tip: "Creusez les zaï et les demi-lunes, remplissez les fosses fumières et produisez le biochar avant les premières pluies." } } },
  tg: { label: "Sud-Togo · Lomé",
    of: (m) => (m >= 3 && m <= 6 ? "rain" : m === 7 ? "cool" : m === 8 || m === 9 ? "rain2" : "hot"),
    legend: [["rain", "Saisons des pluies"], ["cool", "Petite saison sèche"], ["hot", "Grande saison sèche"]],
    seasons: {
      rain: { name: "Grande saison des pluies", focus: "premier cycle de maïs", tip: "Semez le maïs, le niébé et l'arachide du premier cycle. Installez les haies vives et remplissez les composts avec les résidus verts." },
      cool: { name: "Petite saison sèche", focus: "récolte et stockage", tip: "Récoltez le premier cycle, séchez bien les grains avant de les stocker et préparez les parcelles du second cycle." },
      rain2: { name: "Petite saison des pluies", focus: "second cycle de maïs", tip: "Semez le maïs et le niébé du second cycle, surveillez la chenille légionnaire et préparez les planches de maraîchage pour la saison sèche." },
      hot: { name: "Grande saison sèche", focus: "maraîchage irrigué", tip: "Lancez les cultures maraîchères sous irrigation, paillez les planches et préparez l'extrait de neem. Produisez le biochar avec les résidus secs." } } },
};
const seasonClass = (m) => { const s = REGIONS[S.region].of(m); return s === "rain2" ? "rain" : s; };

function renderSeason() {
  const R = REGIONS[S.region] || REGIONS.bf, d = new Date(), m = d.getMonth(), s = R.seasons[R.of(m)], mn = MONTHS[m];
  $("#regions").innerHTML = Object.keys(REGIONS).map((k) => `<button type="button" class="chip" data-region="${k}" aria-pressed="${k === S.region}">${REGIONS[k].label}</button>`).join("");
  $("#cal-legend").innerHTML = R.legend.map((l) => `<span><i class="sw sw-${l[0]}"></i>${l[1]}</span>`).join("");
  $("#season-month").textContent = mn.charAt(0).toUpperCase() + mn.slice(1) + " " + d.getFullYear();
  $("#season-name").textContent = s.name;
  $("#season-focus").textContent = s.focus;
  $("#season-tip").textContent = s.tip;
  $("#cal").innerHTML = INIT.map((l, i) => `<span class="m m-${seasonClass(i)}${i === m ? " now" : ""}" title="${MONTHS[i]}">${l}</span>`).join("");
  $("#cal").setAttribute("aria-label", `Calendrier agricole : nous sommes en ${mn}, ${s.name.toLowerCase()}`);
}

function renderGoals() {
  if (!S.cat) return;
  const g = Object.fromEntries(S.cat.institute.goals.map((x) => [x.key, x]));
  const st = S.stats;
  const rows = [
    { label: "Apprenants inscrits dans l'application", value: st ? st.learners : null, target: g.learners.target },
    { label: "Fermes-écoles du réseau", value: S.cat.farms.length, target: g.farms.target },
  ];
  $("#goals").innerHTML = rows.map((r) => {
    const p = r.value == null ? 0 : Math.min(100, (r.value / r.target) * 100);
    return `<div><div class="goal-top"><span>${r.label}</span><b>${r.value == null ? "—" : F0.format(r.value)} <small>/ ${F0.format(r.target)} visés</small></b></div><div class="meter"><span style="width:${Math.max(p, r.value ? 1.5 : 0)}%"></span></div></div>`;
  }).join("") +
    `<p class="small muted">${st ? `${F0.format(st.certificates)} certificat${st.certificates > 1 ? "s" : ""} délivré${st.certificates > 1 ? "s" : ""} · ${F0.format(st.answered)} demande${st.answered > 1 ? "s" : ""} de diagnostic traitée${st.answered > 1 ? "s" : ""}` : "Chiffres disponibles une fois connecté au réseau."} Objectifs à 5 ans : ${F0.format(g.innovations.target)} innovations validées et ${F0.format(g.hectares.target)} hectares restaurés.</p>`;
}

function renderFarms() {
  $("#farms").innerHTML = S.cat.farms.map((f) => `<li><div><b>${esc(f.name)}</b><span>${esc(f.focus)} · ${esc(f.country)}</span></div><span class="pill pill-neem">${esc(f.kind)}</span></li>`).join("");
  const p = S.cat.institute.promoter;
  $("#promo-name").textContent = p.name; $("#promo-city").textContent = p.city; $("#wa-num").textContent = p.whatsapp;
}

/* ===================== Académie ===================== */
function statusOf(courseId, idx) {
  if (S.token) { const p = S.progress.find((x) => x.courseId === courseId && x.moduleIndex === idx); return p ? p.status : null; }
  return (S.localDone[courseId] || []).includes(idx) ? "done" : null;
}
function pct(c) { let n = 0; c.modules.forEach((_, i) => { if (statusOf(c.id, i) === "done") n++; }); return Math.round((n / c.modules.length) * 100); }
const fmtFormat = (f) => (f.indexOf("Audio") === 0 ? `${f} · ${S.lang}` : f);

function renderHomeCourse() {
  if (!S.cat) return;
  const cs = S.cat.courses;
  const started = cs.filter((c) => pct(c) < 100 && c.modules.some((_, i) => statusOf(c.id, i)));
  const c = started[0] || cs.find((x) => pct(x) < 100) || cs[0];
  const pc = pct(c);
  let next = -1;
  for (let i = 0; i < c.modules.length; i++) if (statusOf(c.id, i) !== "done") { next = i; break; }
  const doneN = c.modules.filter((_, i) => statusOf(c.id, i) === "done").length;
  $("#home-course").innerHTML = `<div><p class="eyebrow">${c.level}</p><h3>${c.title}</h3></div><div class="meter"><span style="width:${pc}%"></span></div><p class="small muted">${doneN} module${doneN > 1 ? "s" : ""} sur ${c.modules.length} · ${pc} %</p>` +
    (next >= 0 ? `<button class="next" type="button" data-lesson="${c.id}:${next}" style="text-align:left;border:0;cursor:pointer;font:inherit;color:inherit"><span class="small muted">Prochain module</span><b>${c.modules[next].title}</b><span class="small muted">${fmtFormat(c.modules[next].format)}</span></button>` : '<p class="pill pill-neem">Parcours terminé</p>') +
    `<button class="btn btn-ghost btn-block" type="button" data-go="academie">Voir tous les parcours</button>`;
}

function renderLangs() { $("#langs").innerHTML = S.cat.languages.map((l) => `<button class="chip" type="button" data-lang="${l}" aria-pressed="${l === S.lang}">${l}</button>`).join(""); }

function renderCourses() {
  const open = $$("details.course[open]").map((d) => d.dataset.id);
  const first = !$("#courses").children.length;
  $("#courses").innerHTML = S.cat.courses.map((c) => {
    const pc = pct(c);
    const isOpen = open.includes(c.id) || (first && c.id === S.cat.courses[0].id);
    return `<details class="course" data-id="${c.id}"${isOpen ? " open" : ""}><summary><div class="course-top"><div class="course-title"><p class="eyebrow">${c.level}</p><h3>${c.title}</h3></div><svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></div><div class="course-meta"><span>${c.modules.length} modules</span><span>${c.hours} h</span><span>${pc} % terminé</span></div><div class="meter" aria-hidden="true"><span style="width:${pc}%"></span></div></summary>` +
      `<ul class="mods">${c.modules.map((m, i) => {
        const st = statusOf(c.id, i);
        const label = st === "done" ? (m.practical ? "Validé par le formateur" : "Terminé") : st === "pending" ? "En attente de validation" : m.practical ? "Validation par le formateur" : "À suivre";
        return `<li><button class="mod-row" type="button" data-lesson="${c.id}:${i}">${ICON[st || "none"]}<span><b>${m.title}</b><span class="small muted">${fmtFormat(m.format)} · ${label}</span></span>${ICON.chev}</button></li>`;
      }).join("")}</ul></details>`;
  }).join("");
}

function openLesson(courseId, idx) {
  const c = S.cat.courses.find((x) => x.id === courseId); if (!c) return;
  const m = c.modules[idx]; if (!m) return;
  const st = statusOf(c.id, idx);
  const audio = /audio/i.test(m.format);
  let actions;
  if (m.practical) {
    if (st === "done") actions = '<p class="pill pill-neem">Validé par le formateur</p>';
    else if (st === "pending") actions = '<p class="pill pill-millet">En attente de validation par le formateur</p>';
    else actions = `<button class="btn btn-primary btn-block" type="button" data-act="request-validation" data-course="${c.id}" data-mod="${idx}">Demander la validation au formateur</button>`;
  } else if (st === "done") {
    actions = `<p class="pill pill-neem">Module terminé</p><button class="btn btn-ghost btn-block" type="button" data-act="undo-module" data-course="${c.id}" data-mod="${idx}">Marquer comme non terminé</button>`;
  } else {
    actions = `<button class="btn btn-primary btn-block" type="button" data-act="done-module" data-course="${c.id}" data-mod="${idx}">J'ai terminé ce module</button>`;
  }
  const nextBtn = idx + 1 < c.modules.length ? `<button class="btn btn-ghost btn-block" type="button" data-lesson="${c.id}:${idx + 1}">Module suivant : ${c.modules[idx + 1].title}</button>` : "";
  openSheet(sheetHead(`${esc(c.title)} · module ${idx + 1} sur ${c.modules.length}`, esc(m.title)) +
    `<div class="kicker"><span class="pill ${m.practical ? "pill-millet" : "pill-indigo"}">${esc(m.format)}</span>${m.practical ? '<span class="small muted">Module pratique</span>' : ""}</div>` +
    (audio ? `<div class="audio-note">${ICON.audio}<span>Leçon audio en ${esc(S.lang.toLowerCase())} en cours d'enregistrement. Le texte ci-dessous reprend l'essentiel.</span></div>` : "") +
    `<h4>À retenir</h4><ol class="lesson-points">${m.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` +
    actions + nextBtn);
}

async function changeProgress(courseId, idx, action) {
  if (action === "request") {
    if (!(await requireLogin())) return;
  }
  if (!S.token) {
    const list = new Set(S.localDone[courseId] || []);
    if (action === "done") list.add(idx); else list.delete(idx);
    S.localDone[courseId] = Array.from(list); store.set("localDone", S.localDone);
    renderCourses(); renderHomeCourse(); openLesson(courseId, idx);
    if (action === "done") toast("Progression enregistrée sur ce téléphone. Connectez-vous avec Pi pour obtenir un certificat.");
    return;
  }
  try {
    const r = await api("/api/progress", { courseId, moduleIndex: idx, action });
    S.progress = r.progress;
    if (r.certificate && !S.certs.some((c) => c.code === r.certificate.code)) {
      S.certs.unshift(r.certificate);
      toast("Parcours terminé : votre certificat est délivré.");
    } else if (action === "request") toast("Demande envoyée au formateur de votre ferme-école.");
    renderCourses(); renderHomeCourse(); renderCerts(); openLesson(courseId, idx);
  } catch (e) { toast(e.message); }
}

function renderCerts() {
  const el = $("#certs");
  if (!S.token) {
    el.innerHTML = `<div class="lock-note">${ICON.lock}<span>Connectez-vous avec Pi pour recevoir vos certificats. Ils sont délivrés à votre nom d'utilisateur Pi et vérifiables par QR code.</span></div>`;
    return;
  }
  if (!S.certs.length) {
    el.innerHTML = '<div class="empty">Terminez tous les modules d\'un parcours, modules pratiques validés compris, pour recevoir votre certificat.</div>';
    return;
  }
  el.innerHTML = `<div class="cert-list">${S.certs.map((c) => `<div class="cert"><div class="stripe" aria-hidden="true"></div><div class="cert-body"><div class="cert-text"><p class="eyebrow">Certificat vérifiable</p><h3>${esc(c.courseTitle)}</h3><p class="small">Délivré à <b>@${esc(c.username)}</b><br>le ${fmtDate(c.issuedAt)}</p><p class="mono">${esc(c.code)}</p></div><div class="qr"><img src="/api/qr/${encodeURIComponent(c.code)}" alt="QR code de vérification du certificat ${esc(c.code)}" width="104" height="104"></div></div><div class="cert-foot"><a class="link" href="/verify/${encodeURIComponent(c.code)}">Voir la page de vérification</a></div></div>`).join("")}</div>`;
}

/* ===================== Bio-Lab ===================== */
function fq(v, u) {
  if (u === "kg" && v > 0 && v < 1) return F0.format(v * 1000) + " g";
  if (u === "t" && v > 0 && v < 1) return F0.format(v * 1000) + " kg";
  if (u === "L" && v > 0 && v < 1) return F0.format(v * 1000) + " mL";
  if (u === "m³" && v > 0 && v < 1) return F0.format(v * 1000) + " L";
  return (v >= 100 ? F0 : v >= 10 ? F1 : F2).format(v) + " " + u;
}
const RECIPES = [
  { id: "neem", short: "Neem", name: "Extrait de graines de neem 5 %", kind: "Biopesticide", pill: "neem", basis: "ha", def: 0.25, size: 0.05,
    targets: "chenilles, pucerons, aleurodes, thrips", hint: "Bouillie : 300 L par hectare (1 ha = 10 000 m²)",
    calc(a) { const b = 300 * a; return { out: fq(b, "L") + " de bouillie prête à pulvériser", rows: [["Graines de neem sèches, décortiquées et pilées", 0.05 * b, "kg"], ["Eau propre", b, "L"], ["Savon noir liquide (adhésif)", 0.001 * b, "L"]] }; },
    steps: ["Piler finement les graines la veille au soir.", "Laisser macérer la poudre dans l'eau 12 à 24 h, à l'ombre.", "Filtrer avec un tissu fin, ajouter le savon et bien mélanger.", "Pulvériser en fin d'après-midi, sur les deux faces des feuilles.", "Renouveler tous les 7 à 10 jours tant que les ravageurs sont présents."],
    caution: "Utiliser la bouillie dans les 24 h. Porter gants et masque pendant le pilage." },
  { id: "piment", short: "Piment-ail", name: "Répulsif piment-ail", kind: "Répulsif", pill: "millet", basis: "ha", def: 0.25, size: 0.05,
    targets: "thrips, pucerons, jeunes chenilles", hint: "Bouillie : 300 L par hectare",
    calc(a) { const b = 300 * a; return { out: fq(b, "L") + " de bouillie", rows: [["Gousses d'ail", 0.01 * b, "kg"], ["Piment fort frais", 0.01 * b, "kg"], ["Eau propre", b, "L"], ["Savon noir liquide", 0.001 * b, "L"]] }; },
    steps: ["Piler l'ail et le piment ensemble.", "Faire macérer 24 h dans un dixième de l'eau, récipient couvert.", "Filtrer, compléter avec le reste de l'eau et ajouter le savon.", "Pulvériser tôt le matin ou en fin de journée, jamais en plein soleil."],
    caution: "Protéger les yeux et les mains : le piment brûle. Alterner avec le neem pour éviter les résistances." },
  { id: "compost", short: "Compost", name: "Compost en tas ou en fosse", kind: "Biofertilisant", pill: "neem", basis: "ha", def: 0.5, size: 0.25,
    doses: [["Céréales et niébé", 5], ["Maraîchage", 20]],
    targets: "fertilité du sol, rétention d'eau, recul du striga", hint: "Dose en tonnes de compost par hectare, selon l'usage choisi",
    calc(a, d) { const c = d * a, raw = 2 * c; return { out: fq(c, "t") + " de compost mûr, en 3 mois environ", rows: [["Matières sèches (tiges de mil, paille, feuilles)", raw * 0.55, "t"], ["Fumier ou fientes", raw * 0.35, "t"], ["Cendre de bois", raw * 0.05, "t"], ["Vieux compost ou terre de surface (amorce)", raw * 0.05, "t"], ["Eau sur 3 mois (repère)", raw * 0.4, "m³"]] }; },
    steps: ["Monter des couches de 20 cm de matières sèches et de 10 cm de fumier.", "Saupoudrer chaque couche de cendre et l'arroser jusqu'à l'humidité d'une éponge essorée.", "Couvrir de paille ou de terre pour garder l'humidité.", "Retourner le tas à 3, 6 et 9 semaines.", "Le compost est mûr quand il est sombre, friable et sent le sous-bois."],
    caution: "Ne mettre ni plastique ni plantes malades dans le tas." },
  { id: "biochar", short: "Biochar", name: "Biochar chargé au compost", kind: "Amendement", pill: "indigo", basis: "ha", def: 0.5, size: 0.25,
    doses: [["Apport modéré", 2], ["Sol très dégradé", 5]],
    targets: "sols pauvres et sableux, stockage durable du carbone", hint: "Dose en tonnes de biochar par hectare, selon l'état du sol",
    calc(a, d) { const bc = d * a; return { out: fq(bc, "t") + " de biochar, soit environ " + F1.format(bc * 2.2) + " tCO₂e stockées", rows: [["Biomasse sèche (tiges de cotonnier ou de mil, coques)", bc / 0.25, "t"], ["Compost mûr pour charger le biochar", bc, "t"]], bc }; },
    steps: ["Carboniser la biomasse dans un fût à tirage inversé ou une fosse conique, sans la laisser finir en cendre.", "Éteindre à l'eau dès que la fumée devient claire.", "Concasser en morceaux de moins de 1 cm.", "Mélanger avec la même masse de compost et laisser reposer 2 semaines.", "Épandre puis incorporer dans les 10 premiers centimètres du sol."],
    caution: "Carboniser loin des habitations et des greniers, avec de l'eau à portée de main." },
  { id: "purin", short: "Engrais liquide", name: "Engrais liquide au fumier", kind: "Biofertilisant", pill: "neem", basis: "L", def: 100, size: 10,
    targets: "croissance des légumes-feuilles et des jeunes plants", hint: "Volume d'engrais dilué, prêt à l'emploi",
    calc(v) { const c = v / 10; return { out: fq(v, "L") + " prêts à l'emploi, pour environ " + F0.format(v / 0.75) + " plants", rows: [["Fumier frais (bovin ou ovin)", c / 5, "kg"], ["Eau de macération", c, "L"], ["Eau de dilution", v - c, "L"]] }; },
    steps: ["Mettre le fumier dans un sac en toile et le suspendre dans l'eau de macération.", "Couvrir et remuer tous les 2 jours pendant 10 jours.", "Diluer 1 volume de concentré dans 9 volumes d'eau.", "Arroser au pied : 0,5 à 1 L par plant toutes les 2 semaines."],
    caution: "Ne pas arroser les feuilles des légumes consommés crus." },
  { id: "vinaigre", short: "Désherbant", name: "Désherbant au vinaigre", kind: "Bioherbicide", pill: "alert", basis: "L", def: 10, size: 5,
    targets: "jeunes adventices des allées et des bordures", hint: "Volume de mélange à préparer",
    calc(v) { return { out: fq(v, "L") + " de mélange", rows: [["Vinaigre blanc à 8 %", v * 0.99, "L"], ["Savon noir liquide (mouillant)", v * 0.01, "L"]] }; },
    steps: ["Mélanger le vinaigre et le savon sans faire mousser.", "Pulvériser par temps ensoleillé et sans vent, directement sur les jeunes adventices.", "Protéger les cultures voisines avec un carton.", "Renouveler après 10 à 15 jours si les adventices repoussent."],
    caution: "Produit non sélectif : il brûle aussi les cultures. Ne pas ajouter de sel, qui stérilise le sol. Vérifier son admissibilité auprès de votre organisme de certification." },
];
const DIAG = {
  "Tomate": [
    { s: "Feuilles jaunes et enroulées, petites mouches blanches sous les feuilles", c: "Aleurodes, vecteurs du virus de l'enroulement jaune (TYLCV)", u: "Élevée", a: ["Poser des pièges jaunes englués entre les rangs.", "Pulvériser l'extrait de neem 5 % tous les 7 jours.", "Arracher et détruire les plants déjà atteints par le virus.", "Protéger la pépinière avec un filet anti-insectes."], r: "neem" },
    { s: "Taches brunes à cercles concentriques sur les feuilles du bas", c: "Alternariose (champignon)", u: "Moyenne", a: ["Retirer et brûler les feuilles touchées.", "Pailler pour éviter les éclaboussures de terre.", "Arroser au pied, le matin.", "Ne pas replanter tomate, piment ou aubergine sur la parcelle pendant 3 ans."], r: null },
    { s: "Fruits troués avec une chenille à l'intérieur", c: "Noctuelle de la tomate (Helicoverpa armigera)", u: "Élevée", a: ["Ramasser et détruire les fruits atteints.", "Traiter au neem dès le début de la floraison.", "Alterner avec le répulsif piment-ail."], r: "neem" }],
  "Chou": [{ s: "Petits trous dans les feuilles, petites chenilles vertes qui se tortillent", c: "Teigne du chou (Plutella xylostella)", u: "Élevée", a: ["Pulvériser le neem 5 % tous les 5 à 7 jours.", "Alterner avec le piment-ail pour éviter les résistances.", "Associer le chou avec l'oignon ou la tomate."], r: "neem" }],
  "Oignon": [{ s: "Taches argentées et stries blanches sur les feuilles", c: "Thrips", u: "Moyenne", a: ["Pulvériser le piment-ail, puis le neem en alternance.", "Arroser par aspersion : l'eau gêne les thrips.", "Désherber les bordures où ils se réfugient."], r: "piment" }],
  "Maïs": [{ s: "Feuilles trouées en fenêtres, sciure dans le cornet", c: "Chenille légionnaire d'automne (Spodoptera frugiperda)", u: "Élevée", a: ["Inspecter 20 plants deux fois par semaine.", "Verser une pincée de cendre ou de sable sec dans le cornet.", "Pulvériser le neem dans le cornet, tôt le matin.", "Installer le système push-pull : desmodium entre les rangs, brachiaria en bordure."], r: "neem" }],
  "Mil / sorgho": [{ s: "Petites plantes à fleurs roses ou violettes au pied des céréales", c: "Striga, plante parasite des racines", u: "Élevée", a: ["Arracher les striga avant leur floraison et les brûler.", "Apporter du compost : un sol riche limite le striga.", "Faire une rotation avec le niébé ou l'arachide, qui font germer le striga sans le nourrir."], r: "compost" }],
  "Niébé": [{ s: "Fleurs qui tombent, gousses percées", c: "Foreur des gousses (Maruca vitrata)", u: "Moyenne", a: ["Pulvériser le neem au début de la floraison.", "Répéter tous les 7 jours pendant la floraison."], r: "neem" }],
  "Volaille": [
    { s: "Toux, diarrhée verdâtre, cou tordu, morts en série", c: "Suspicion de maladie de Newcastle", u: "Critique", a: ["Isoler immédiatement les oiseaux malades.", "Appeler le vétérinaire ou l'auxiliaire d'élevage aujourd'hui.", "Vacciner le reste du troupeau selon le calendrier.", "Désinfecter le poulailler et le matériel."], note: "Les remèdes naturels ne remplacent pas la vaccination.", r: null },
    { s: "Plumes ébouriffées, amaigrissement, diarrhée", c: "Parasites internes possibles", u: "Moyenne", a: ["Nettoyer et sécher la litière.", "Donner une eau propre, changée chaque jour.", "Demander à l'auxiliaire d'élevage un déparasitage adapté."], r: null }],
};
const CROPS = Object.keys(DIAG);

function stepper(id, v, size, min, extra) { return `<div class="stepper"><button type="button" data-step="-1" data-for="${id}" aria-label="Diminuer">−</button><input id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${fmtIn(v)}" data-size="${size}" data-min="${min}"${extra || ""}><button type="button" data-step="1" data-for="${id}" aria-label="Augmenter">+</button></div>`; }
const curR = () => RECIPES.find((r) => r.id === S.rec) || RECIPES[0];
function renderRecChips() { $("#rec-chips").innerHTML = RECIPES.map((r) => `<button type="button" class="chip" data-rec="${r.id}" aria-pressed="${r.id === S.rec}">${r.short}</button>`).join(""); }
function renderRecipe() {
  const r = curR(), a = S.amt[r.id] != null ? S.amt[r.id] : r.def, di = S.dose[r.id] || 0;
  $("#recipe").innerHTML = `<div class="rec-head"><span class="pill pill-${r.pill}">${r.kind}</span><h2>${r.name}</h2><p class="muted small">Agit sur : ${r.targets}</p></div>` +
    `<div class="field"><label for="amt">${r.basis === "ha" ? "Surface à traiter (ha)" : "Volume à préparer (L)"}</label>${stepper("amt", a, r.size, 0)}<p class="hint">${r.hint}</p></div>` +
    (r.doses ? `<div class="field"><span class="label" id="dose-l">Usage</span><div class="seg" role="radiogroup" aria-labelledby="dose-l">${r.doses.map((d, i) => `<button type="button" role="radio" aria-checked="${i === di}" data-dose="${i}">${d[0]} · ${d[1]} t/ha</button>`).join("")}</div></div>` : "") +
    `<div id="rx" aria-live="polite"></div><div class="rec-steps"><h4>Préparation</h4><ol>${r.steps.map((s) => `<li>${s}</li>`).join("")}</ol></div><p class="caution"><b>Précaution.</b> ${r.caution}</p>`;
  updateRx();
}
function updateRx() {
  const r = curR(), a = Math.max(0, num($("#amt").value)); S.amt[r.id] = a;
  const res = r.calc(a, r.doses ? r.doses[S.dose[r.id] || 0][1] : undefined);
  $("#rx").innerHTML = `<p class="out">${res.out}</p><table class="ing"><caption class="sr">Ingrédients nécessaires</caption><tbody>${res.rows.map((x) => `<tr><td>${x[0]}</td><td class="qty">${fq(x[1], x[2])}</td></tr>`).join("")}</tbody></table>` +
    (res.bc ? `<button type="button" class="btn btn-ghost btn-block" data-act="to-carbon">Ajouter ${fq(res.bc, "t")} de biochar au bilan carbone</button>` : "");
}
function renderDiag() {
  $("#crops").innerHTML = CROPS.map((c) => `<button type="button" class="chip" data-crop="${c}" aria-pressed="${c === S.crop}">${c}</button>`).join("");
  $("#symptoms").innerHTML = DIAG[S.crop].map((d, i) => `<button type="button" class="opt" data-sym="${i}" aria-pressed="${i === S.symI}">${d.s}</button>`).join("");
  const el = $("#diag-result");
  if (S.symI == null) { el.innerHTML = '<div class="empty">Choisissez ce que vous observez pour voir la cause probable et le traitement bio.</div>'; return; }
  const d = DIAG[S.crop][S.symI], up = { "Critique": "alert", "Élevée": "millet", "Moyenne": "indigo" }[d.u], r = RECIPES.find((x) => x.id === d.r);
  el.innerHTML = `<div class="card result"><div class="result-top"><p class="eyebrow">Cause probable</p><span class="pill pill-${up}">Urgence ${d.u.toLowerCase()}</span></div><h3>${d.c}</h3><h4>Que faire</h4><ol>${d.a.map((x) => `<li>${x}</li>`).join("")}</ol>` +
    (d.note ? `<p class="caution"><b>Important.</b> ${d.note}</p>` : "") +
    (r ? `<button class="btn btn-primary btn-block" type="button" data-go="biolab" data-panel="rec" data-recipe="${r.id}">Calculer la recette : ${r.short.toLowerCase()}</button>` : "") +
    `<p class="note">Diagnostic d'orientation. En cas de doute, demandez l'avis d'un conseiller ci-dessous.</p></div>`;
}
const REQ_STATUS = { open: ["En attente de réponse", "millet"], answered: ["Répondu", "neem"] };
function renderRequests() {
  const g = $("#myreq-group");
  g.hidden = !S.token || !S.requests.length;
  $("#myreq").innerHTML = S.requests.map((r) => {
    const st = REQ_STATUS[r.status] || REQ_STATUS.open;
    return `<li><div class="row-top"><b>${esc(r.crop)}${r.symptom ? " · " + esc(r.symptom) : ""}</b><span class="pill pill-${st[1]}">${st[0]}</span></div><span class="small muted">${fmtDate(r.createdAt)}${r.hasPhoto ? " · photo jointe" : ""}</span>${r.message ? `<p class="small">${esc(r.message)}</p>` : ""}${r.answer ? `<p class="answer"><b>Réponse du conseiller.</b> ${esc(r.answer)}</p>` : ""}</li>`;
  }).join("");
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280, s = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      let q = 0.78, d = c.toDataURL("image/jpeg", q);
      while (d.length > 1500000 && q > 0.3) { q -= 0.15; d = c.toDataURL("image/jpeg", q); }
      resolve(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Cette image ne peut pas être lue.")); };
    img.src = url;
  });
}

/* ===================== Marché ===================== */
const CATS = ["Tout", "Fruits et légumes", "Élevage", "Transformés", "Intrants"];
const CATSTYLE = { "Fruits et légumes": "neem", "Élevage": "millet", "Transformés": "indigo", "Intrants": "sunk" };
const CERT = { spg: ["Garantie participative (SPG)", "neem"], bio: ["Certifié bio", "indigo"], conv: ["En conversion", "millet"], pending: ["Contrôle à programmer", "alert"] };
const STEPS = {
  "Fruits et légumes": ["Semis en pépinière, semences locales", "Repiquage et fumure au compost", "Protection des cultures par bio-intrants uniquement", "Contrôle du groupe de garantie participative", "Récolte, tri et mise en vente"],
  "Élevage": ["Origine des animaux enregistrée", "Alimentation à base de provende locale", "Suivi sanitaire et vaccination", "Contrôle du groupe de garantie participative", "Mise en vente"],
  "Transformés": ["Collecte de la matière première", "Transformation en atelier collectif", "Contrôle de l'humidité et de la pureté", "Conditionnement par lot", "Mise en vente"],
  "Intrants": ["Collecte des résidus et du fumier de la ferme", "Compostage avec trois retournements", "Maturation contrôlée", "Tamisage et ensachage", "Mise en vente"],
};
function renderCats() { $("#cats").innerHTML = CATS.map((c) => `<button type="button" class="chip" data-cat="${c}" aria-pressed="${c === S.mcat}">${c}</button>`).join(""); }
function renderProducts() {
  const list = S.products.filter((p) => (S.mcat === "Tout" || p.category === S.mcat) && (!S.q || norm(`${p.name} ${p.seller} ${p.place}`).includes(S.q)));
  $("#products").innerHTML = list.length ? `<div class="stack">${list.map((p) => {
    const c = CERT[p.cert] || CERT.pending;
    return `<article class="prod"><div class="tile tile-${CATSTYLE[p.category] || "sunk"}" aria-hidden="true">${esc(p.name.slice(0, 2))}</div><div class="prod-main"><h3>${esc(p.name)}</h3><p class="small muted">${esc(p.seller)} · ${esc(p.place)}${p.country ? ", " + esc(p.country) : ""}</p><span class="pill pill-${c[1]}">${c[0]}</span></div><div class="prod-price"><b>${FPI.format(p.pricePi)} π</b><span>par ${esc(p.unit)}</span></div><div class="prod-actions"><button class="btn btn-ghost" type="button" data-pass="${esc(p.id)}">Passeport du produit</button><button class="btn btn-primary" type="button" data-add="${esc(p.id)}">Ajouter</button></div></article>`;
  }).join("")}</div>` : `<div class="empty">${S.products.length ? "Aucun produit ne correspond. Essayez un autre mot ou une autre catégorie." : "Les produits s'afficheront dès que le réseau sera disponible."}</div>`;
}
async function passport(id) {
  const p = S.products.find((x) => x.id === id); if (!p) return;
  const c = CERT[p.cert] || CERT.pending;
  let hash = "";
  try {
    const canon = JSON.stringify({ id: p.id, name: p.name, seller: p.seller, place: p.place, cert: p.cert, inputs: p.inputs, gps: p.gps });
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon));
    hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { /* indisponible */ }
  openSheet(sheetHead("Passeport du produit", esc(p.name)) +
    `<dl class="kv"><div><dt>Producteur</dt><dd>${esc(p.seller)}</dd></div><div><dt>Lieu</dt><dd>${esc(p.place)}${p.country ? ", " + esc(p.country) : ""}</dd></div>${p.gps ? `<div><dt>Parcelle</dt><dd class="mono small">${esc(p.gps)}</dd></div>` : ""}<div><dt>Garantie</dt><dd><span class="pill pill-${c[1]}">${c[0]}</span></dd></div><div><dt>Prix</dt><dd class="pi-amount">${FPI.format(p.pricePi)} π par ${esc(p.unit)}</dd></div></dl>` +
    `<h4>Étapes de production</h4><ol class="tl">${(STEPS[p.category] || []).map((t) => `<li><div><b>${t}</b></div></li>`).join("")}</ol>` +
    (p.inputs && p.inputs.length ? `<h4>Intrants déclarés</h4><div class="tags">${p.inputs.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : "") +
    (hash ? `<div class="hashbox"><p class="eyebrow">Empreinte numérique (SHA-256)</p><p class="mono hash">${hash}</p><p class="small muted">Calculée à partir des informations déclarées : toute modification la change. L'ancrage sur la blockchain Pi est prévu dans une prochaine version.</p></div>` : "") +
    `<button class="btn btn-primary btn-block" type="button" data-add="${esc(p.id)}" data-close>Ajouter au panier · ${FPI.format(p.pricePi)} π</button>`);
}
function cartTotals() {
  let n = 0, t = 0;
  Object.keys(S.cart).forEach((id) => { const p = S.products.find((x) => x.id === id); if (p) { n += S.cart[id]; t += S.cart[id] * p.pricePi; } });
  return { n, t: round7(t) };
}
function updateCartVis() { const show = cartTotals().n > 0 && S.current === "marche"; $("#cartbar").hidden = !show; document.body.classList.toggle("has-cart", show); }
function renderCart() { const c = cartTotals(); $("#cart-n").textContent = `${c.n} article${c.n > 1 ? "s" : ""}`; $("#cart-t").textContent = pi(c.t); updateCartVis(); }
function addCart(id) { const p = S.products.find((x) => x.id === id); if (!p) return; S.cart[id] = (S.cart[id] || 0) + 1; renderCart(); toast(`${p.name} ajouté au panier.`); }
function checkoutSheet() {
  const c = cartTotals();
  const lines = Object.keys(S.cart).map((id) => {
    const p = S.products.find((x) => x.id === id); if (!p) return "";
    return `<li><span>${S.cart[id]} × ${esc(p.name)}</span><span class="inline-actions"><b class="pi-amount">${pi(round7(S.cart[id] * p.pricePi))}</b><button class="x" type="button" data-remove="${esc(id)}" aria-label="Retirer ${esc(p.name)}" style="width:32px;height:32px;font-size:1rem">−</button></span></li>`;
  }).join("");
  return sheetHead("Panier", "Paiement en Pi") +
    `<ul class="lines">${lines}<li class="total"><span>Total</span><b class="pi-amount">${pi(c.t)}</b></li></ul>
     <p class="small muted">Le paiement s'ouvre dans votre portefeuille Pi. La commande est confirmée dès que la transaction est validée sur la blockchain Pi.</p>
     <button class="btn btn-primary btn-block" type="button" data-act="pay">Payer ${pi(c.t)} avec Pi</button>`;
}
async function checkout(btn) {
  const c = cartTotals();
  if (!c.n) { closeSheet(); return; }
  if (!(await requireLogin())) return;
  if (!canUsePi()) { openSheet(notInPiSheet()); return; }
  if (btn) btn.setAttribute("aria-busy", "true");
  try {
    const items = Object.keys(S.cart).map((productId) => ({ productId, qty: S.cart[productId] }));
    const { order } = await api("/api/orders", { items });
    const paid = await piPay(order);
    S.cart = {}; renderCart(); closeSheet();
    toast(`Paiement confirmé : commande ${paid.id.slice(0, 8)} payée.`);
    await loadPrivate();
  } catch (e) {
    toast(e.cancelled ? "Paiement annulé : votre panier est conservé." : e.message);
    if (S.token) loadPrivate();
  } finally { if (btn) btn.removeAttribute("aria-busy"); }
}
const ORDER_STATUS = { created: ["En attente de paiement", "millet"], approved: ["Paiement en cours", "indigo"], paid: ["Payée", "neem"], cancelled: ["Annulée", "alert"] };
const OFFER_STATUS = { approved: ["Publiée", "neem"], pending: ["En vérification", "millet"], rejected: ["Refusée", "alert"] };
function renderOrders() {
  $("#myorders-group").hidden = !S.token || !S.orders.length;
  $("#myorders").innerHTML = S.orders.map((o) => {
    const st = ORDER_STATUS[o.status] || ORDER_STATUS.created;
    return `<li><div class="row-top"><b>Commande ${esc(o.id.slice(0, 8))}</b><span class="pill pill-${st[1]}">${st[0]}</span></div><span class="small">${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join(", ")}</span><span class="small muted"><span class="pi-amount">${pi(o.amount)}</span> · ${fmtDate(o.createdAt)}${o.txid ? ` · transaction <span class="mono">${esc(o.txid.slice(0, 10))}…</span>` : ""}</span></li>`;
  }).join("");
  $("#myoffers-group").hidden = !S.token || !S.offers.length;
  $("#myoffers").innerHTML = S.offers.map((p) => {
    const st = OFFER_STATUS[p.status] || OFFER_STATUS.pending;
    return `<li><div class="row-top"><b>${esc(p.name)}</b><span class="pill pill-${st[1]}">${st[0]}</span></div><span class="small muted"><span class="pi-amount">${FPI.format(p.pricePi)} π</span> par ${esc(p.unit)} · ${esc(p.place)}</span></li>`;
  }).join("");
}
function sellSheet() {
  return sheetHead("Nouvelle offre", "Vendre ma récolte") +
    `<form id="sell-form" class="stack" novalidate>
      <div class="field"><label for="f-name">Produit</label><input id="f-name" class="input" maxlength="60" placeholder="Ex. : piment frais" autocomplete="off"></div>
      <div class="field"><label for="f-cat">Catégorie</label><select id="f-cat" class="input">${CATS.slice(1).map((c) => `<option>${c}</option>`).join("")}</select></div>
      <div class="two"><div class="field"><label for="f-price">Prix (π)</label><input id="f-price" class="input" inputmode="decimal" placeholder="0,5" autocomplete="off"></div><div class="field"><label for="f-unit">Par</label><input id="f-unit" class="input" value="kg" maxlength="20" autocomplete="off"></div></div>
      <div class="two"><div class="field"><label for="f-place">Village ou ville</label><input id="f-place" class="input" maxlength="60" placeholder="Ex. : Ouahigouya" autocomplete="off"></div><div class="field"><label for="f-country">Pays</label><select id="f-country" class="input"><option>Burkina Faso</option><option>Togo</option><option>Autre</option></select></div></div>
      <p class="small muted">L'institut vérifie chaque offre avant publication et programme une visite du groupe de garantie participative.</p>
      <button class="btn btn-primary btn-block" type="submit">Envoyer l'offre</button>
    </form>`;
}
function messageSheet() {
  return sheetHead("Contact", "Écrire au promoteur") +
    `<form id="msg-form" class="stack" novalidate><div class="field"><label for="m-text">Votre message à ${esc(S.cat.institute.promoter.name)}</label><textarea id="m-text" class="input" maxlength="1000" placeholder="Votre question ou votre proposition"></textarea></div><p class="small muted">Le promoteur voit votre nom d'utilisateur Pi et peut vous répondre.</p><button class="btn btn-primary btn-block" type="submit">Envoyer le message</button></form>`;
}

/* ===================== Carbone ===================== */
const CARB = [
  { k: "af", label: "Agroforesterie et RNA", unit: "ha", coef: 2.0, coefTxt: "≈ 2,0 tCO₂e par ha et par an", size: 0.5 },
  { k: "zai", label: "Zaï et demi-lunes", unit: "ha", coef: 1.0, coefTxt: "≈ 1,0 tCO₂e par ha et par an", size: 0.5 },
  { k: "comp", label: "Compost épandu", unit: "ha", coef: 0.5, coefTxt: "≈ 0,5 tCO₂e par ha et par an", size: 0.5 },
  { k: "bc", label: "Biochar apporté au sol", unit: "t", coef: 2.2, coefTxt: "≈ 2,2 tCO₂e par tonne, stockage durable", size: 0.5 },
];
function renderCarbonInputs() {
  $("#carb-inputs").innerHTML = "<h2>Vos pratiques</h2>" + CARB.map((c) => `<div class="crow"><div class="crow-l"><label for="c-${c.k}">${c.label} (${c.unit})</label><span class="small muted">${c.coefTxt}</span></div>${stepper("c-" + c.k, S.carb[c.k], c.size, 0, ` data-carb="${c.k}"`)}</div>`).join("");
  updateCarbon();
}
function updateCarbon() {
  CARB.forEach((c) => { S.carb[c.k] = Math.max(0, num($("#c-" + c.k).value)); });
  store.set("carb", S.carb);
  const parts = CARB.map((c) => ({ k: c.k, label: c.label, v: S.carb[c.k] * c.coef }));
  const annual = parts[0].v + parts[1].v + parts[2].v, once = parts[3].v, total = annual + once, ha = S.carb.af + S.carb.zai + S.carb.comp;
  $("#carb-result").innerHTML = `<p class="eyebrow">Première année</p><p class="big">${F1.format(total)} <small>tCO₂e</small></p>` +
    `<p class="muted small">Dont ${F1.format(annual)} t chaque année tant que les pratiques sont maintenues, et ${F1.format(once)} t stockées une seule fois par le biochar.</p>` +
    `<div class="split" role="img" aria-label="Répartition du carbone stocké par pratique">${parts.map((p) => `<span class="sp-${p.k}" style="width:${total ? (p.v / total) * 100 : 0}%"></span>`).join("")}</div>` +
    `<ul class="legend">${parts.map((p) => `<li><i class="sw sp-${p.k}"></i><span>${p.label}</span><b class="mono">${F1.format(p.v)} t</b></li>`).join("")}</ul>` +
    `<div class="kpis"><div><span class="small muted">Équivalent en crédits</span><b>${F0.format(Math.floor(total))}</b><span class="small muted">de 1 tCO₂e chacun</span></div><div><span class="small muted">Surface déclarée</span><b>${F1.format(ha)}</b><span class="small muted">ha, au plus</span></div></div>`;
}

/* ===================== Rendu global ===================== */
function renderAll() {
  if (!S.cat) return;
  renderHomeCourse(); renderCourses(); renderCerts(); renderRequests(); renderOrders(); renderGoals();
}

/* ===================== Événements ===================== */
async function act(a, el) {
  if (a === "account") { if (S.token && S.user) openSheet(accountSheet()); else login(); }
  else if (a === "logout") { setSession(null, null); closeSheet(); toast("Vous êtes déconnecté de l'application."); }
  else if (a === "copy-wa") {
    const txt = S.cat.institute.promoter.whatsapp.replace(/\s+/g, "");
    const sel = () => { try { const r = document.createRange(); r.selectNodeContents($("#wa-num")); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch { /* */ } toast("Numéro sélectionné : copiez-le avec le menu du téléphone."); };
    try { navigator.clipboard.writeText(txt).then(() => toast("Numéro WhatsApp copié."), sel); } catch { sel(); }
  }
  else if (a === "message") { if (await requireLogin()) openSheet(messageSheet()); }
  else if (a === "sell") { if (await requireLogin()) openSheet(sellSheet()); }
  else if (a === "checkout") openSheet(checkoutSheet());
  else if (a === "pay") checkout(el);
  else if (a === "done-module") changeProgress(el.dataset.course, Number(el.dataset.mod), "done");
  else if (a === "undo-module") changeProgress(el.dataset.course, Number(el.dataset.mod), "undo");
  else if (a === "request-validation") changeProgress(el.dataset.course, Number(el.dataset.mod), "request");
  else if (a === "to-carbon") {
    const r = curR(), res = r.calc(S.amt[r.id] != null ? S.amt[r.id] : r.def, r.doses[S.dose[r.id] || 0][1]);
    $("#c-bc").value = fmtIn(res.bc); updateCarbon(); go("carbone"); toast(`${fq(res.bc, "t")} de biochar ajoutées au bilan carbone.`);
  }
  else if (a === "ask") {
    if (!(await requireLogin())) return;
    const d = S.symI != null ? DIAG[S.crop][S.symI] : null;
    const message = $("#req-msg").value.trim();
    if (!d && !message && !S.photo) { toast("Choisissez un symptôme, écrivez un message ou ajoutez une photo."); return; }
    el.setAttribute("aria-busy", "true");
    try {
      const r = await api("/api/requests", { crop: S.crop, symptom: d ? d.s : "", cause: d ? d.c : "", message, photo: S.photo });
      S.requests.unshift(r.request); renderRequests();
      $("#req-msg").value = ""; S.photo = null; $("#photo-prev").hidden = true; $("#photo").value = "";
      toast("Demande envoyée au conseiller. La réponse apparaîtra dans « Mes demandes ».");
    } catch (e) { toast(e.message); } finally { el.removeAttribute("aria-busy"); }
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-tab],[data-go],[data-act],[data-step],[data-region],[data-lang],[data-rec],[data-dose],[data-panel-btn],[data-crop],[data-sym],[data-cat],[data-pass],[data-add],[data-remove],[data-lesson],[data-close]");
  if (!el) { if (e.target === $("#sheet")) closeSheet(); return; }
  const ds = el.dataset;
  if (ds.tab) go(ds.tab);
  if (ds.go) {
    go(ds.go);
    if (ds.recipe) { S.rec = ds.recipe; store.set("rec", S.rec); renderRecChips(); renderRecipe(); }
    if (ds.panel) setPanel(ds.panel);
  }
  if (ds.step) {
    const inp = $("#" + ds.for);
    if (inp) { let v = num(inp.value) + parseFloat(inp.dataset.size) * Number(ds.step); v = Math.max(parseFloat(inp.dataset.min || "0"), Math.round(v * 1000) / 1000); inp.value = fmtIn(v); inp.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  if (ds.region) { S.region = ds.region; store.set("region", S.region); renderSeason(); }
  if (ds.lang) { S.lang = ds.lang; store.set("lang", S.lang); renderLangs(); renderCourses(); renderHomeCourse(); }
  if (ds.rec) { S.rec = ds.rec; store.set("rec", S.rec); renderRecChips(); renderRecipe(); }
  if (ds.dose != null) { S.dose[S.rec] = Number(ds.dose); $$("[data-dose]").forEach((b) => b.setAttribute("aria-checked", String(b === el))); updateRx(); }
  if (ds.panelBtn) setPanel(ds.panelBtn);
  if (ds.crop) { S.crop = ds.crop; S.symI = null; renderDiag(); }
  if (ds.sym != null) { S.symI = Number(ds.sym); renderDiag(); const r = $("#diag-result"); if (r && r.scrollIntoView) r.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  if (ds.cat) { S.mcat = ds.cat; renderCats(); renderProducts(); }
  if (ds.pass) passport(ds.pass);
  if (ds.add) addCart(ds.add);
  if (ds.remove) { const id = ds.remove; if (S.cart[id] > 1) S.cart[id] -= 1; else delete S.cart[id]; renderCart(); if (cartTotals().n) openSheet(checkoutSheet()); else { closeSheet(); toast("Panier vidé."); } }
  if (ds.lesson) { const [cid, i] = ds.lesson.split(":"); openLesson(cid, Number(i)); return; }
  if (ds.act) { act(ds.act, el); }
  if (ds.close != null && !ds.act) closeSheet();
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "amt") updateRx();
  else if (t.dataset && t.dataset.carb != null) updateCarbon();
  else if (t.id === "q") { S.q = norm(t.value.trim()); renderProducts(); }
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.id === "photo" && t.files && t.files[0]) {
    try {
      S.photo = await compressImage(t.files[0]);
      const img = $("#photo-prev"); img.src = S.photo; img.hidden = false;
    } catch (err) { toast(err.message); }
  }
});

document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (f.id === "sell-form") {
    e.preventDefault();
    const body = { name: $("#f-name").value, category: $("#f-cat").value, pricePi: num($("#f-price").value), unit: $("#f-unit").value, place: $("#f-place").value, country: $("#f-country").value };
    if (!body.name.trim() || !body.place.trim() || !body.pricePi) { toast("Indiquez le produit, le prix en Pi et le lieu."); return; }
    try {
      const r = await api("/api/products", body);
      S.offers.unshift(r.product); renderOrders(); closeSheet(); go("marche");
      toast("Offre envoyée : elle sera publiée après vérification par l'institut.");
    } catch (err) { toast(err.message); }
  }
  if (f.id === "msg-form") {
    e.preventDefault();
    const message = $("#m-text").value.trim();
    if (message.length < 5) { toast("Écrivez au moins quelques mots."); return; }
    try { await api("/api/messages", { message }); closeSheet(); toast("Message envoyé au promoteur."); } catch (err) { toast(err.message); }
  }
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
window.addEventListener("resize", measure);
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.includes(h)) go(h); });
const setOnline = () => { $("#offline-pill").hidden = navigator.onLine !== false; };
window.addEventListener("online", () => { setOnline(); loadPublic(); if (S.token) loadPrivate(); });
window.addEventListener("offline", setOnline);

/* ===================== Démarrage ===================== */
async function start() {
  try {
    const r = await fetch("/data/catalog.json");
    S.cat = await r.json();
  } catch {
    document.querySelector("main .inner").innerHTML = '<div class="empty">Impossible de charger l\'application. Vérifiez votre connexion puis rouvrez-la.</div>';
    return;
  }
  if (!S.cat.languages.includes(S.lang)) S.lang = S.cat.languages[0];
  renderSeason(); renderFarms(); renderLangs(); renderRecChips(); renderRecipe(); renderDiag();
  renderCats(); renderProducts(); renderCart(); renderCarbonInputs(); renderAll(); renderAuth(); setOnline(); measure();
  const h = location.hash.slice(1); go(TABS.includes(h) ? h : "accueil");
  loadPublic();
  if (S.token) loadPrivate();
  initPi();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
start();
})();
