/* Espace d'administration de Bio Star Monde Eden */
(function () {
"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FPI = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 7 });
const F0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const date = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const get = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } };
const getLocal = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const set = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };
let adminToken = get("bsme:admin");
const userToken = getLocal("bsme:token");
let tt;
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 3500); }

async function api(path, body) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (adminToken) headers["X-Admin-Token"] = adminToken;
  if (userToken) headers.Authorization = "Bearer " + userToken;
  const r = await fetch(path, { method: body !== undefined ? "POST" : "GET", headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch { /* */ }
  if (!r.ok) throw Object.assign(new Error((d && d.error) || `Erreur ${r.status}`), { status: r.status });
  return d;
}

const CERT = { spg: "Garantie participative (SPG)", bio: "Certifié bio", conv: "En conversion", pending: "Contrôle à programmer" };
const PSTATUS = { approved: ["Publiée", "neem"], pending: ["En vérification", "millet"], rejected: ["Refusée", "alert"] };
const OSTATUS = { created: ["En attente de paiement", "millet"], approved: ["Paiement en cours", "indigo"], paid: ["Payée", "neem"], cancelled: ["Annulée", "alert"] };
let data = null;

function section(title, inner, note) { return `<section class="group"><h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ""}${inner}</section>`; }
function empty(t) { return `<div class="empty">${t}</div>`; }

function render() {
  const s = data.stats;
  const stats = [["Apprenants", s.users], ["Certificats", s.certificates], ["Validations à faire", s.pendingValidations], ["Demandes ouvertes", s.openRequests], ["Offres à vérifier", s.pendingProducts], ["Commandes payées", s.paidOrders], ["Pi encaissés", `${FPI.format(s.paidAmount)} π`]];
  const pendingProducts = data.products.filter((p) => p.status === "pending");
  const openReq = data.requests.filter((r) => r.status === "open");
  const doneReq = data.requests.filter((r) => r.status !== "open").slice(0, 20);
  $("#dash").innerHTML =
    `<div class="screen-head"><p class="eyebrow">Tableau de bord</p><h1>Administration de l'institut</h1></div>` +
    `<div class="statgrid">${stats.map(([l, v]) => `<div class="stat"><span class="small muted">${l}</span><b>${typeof v === "number" ? F0.format(v) : v}</b></div>`).join("")}</div>` +
    section("Modules pratiques à valider",
      data.validations.length ? `<div class="card list-card">${data.validations.map((v) => `<div class="item"><div class="row-top"><b>@${esc(v.username)}</b><span class="small muted">${date(v.requestedAt)}</span></div><span>${esc(v.courseTitle)} · module ${v.moduleIndex + 1} : ${esc(v.moduleTitle)}</span><div class="inline-actions"><button class="btn btn-primary" data-val="approve" data-uid="${esc(v.uid)}" data-course="${esc(v.courseId)}" data-mod="${v.moduleIndex}">Valider</button><button class="btn btn-ghost" data-val="reject" data-uid="${esc(v.uid)}" data-course="${esc(v.courseId)}" data-mod="${v.moduleIndex}">Refuser</button></div></div>`).join("")}</div>` : empty("Aucune demande de validation en attente."),
      "Validez seulement après avoir constaté la pratique en ferme-école. Un parcours complet délivre automatiquement le certificat.") +
    section("Demandes de diagnostic",
      openReq.length ? `<div class="card list-card">${openReq.map((r) => `<div class="item"><div class="row-top"><b>@${esc(r.username)} · ${esc(r.crop)}</b><span class="small muted">${date(r.createdAt)}</span></div>${r.symptom ? `<span>${esc(r.symptom)}</span>` : ""}${r.cause ? `<span class="small muted">Orientation proposée : ${esc(r.cause)}</span>` : ""}${r.message ? `<p>${esc(r.message)}</p>` : ""}${r.hasPhoto ? `<div><button class="btn btn-ghost" data-photo="${esc(r.id)}">Afficher la photo</button><img id="ph-${esc(r.id)}" alt="Photo jointe par @${esc(r.username)}" hidden></div>` : ""}<div class="field"><label for="ans-${esc(r.id)}">Réponse</label><textarea id="ans-${esc(r.id)}" class="input" maxlength="2000"></textarea></div><button class="btn btn-primary" data-answer="${esc(r.id)}">Envoyer la réponse</button></div>`).join("")}</div>` : empty("Aucune demande ouverte.")) +
    section("Offres à vérifier",
      pendingProducts.length ? `<div class="card list-card">${pendingProducts.map(productItem).join("")}</div>` : empty("Aucune offre en attente.")) +
    section("Commandes récentes",
      data.orders.length ? `<div class="card list-card">${data.orders.map((o) => { const st = OSTATUS[o.status] || OSTATUS.created; return `<div class="item"><div class="row-top"><b>${esc(o.id.slice(0, 8))} · @${esc(o.username)}</b><span class="pill pill-${st[1]}">${st[0]}</span></div><span class="small">${o.items.map((i) => `${i.qty} × ${esc(i.name)} (${esc(i.seller)})`).join(", ")}</span><span class="small muted"><span class="pi-amount">${FPI.format(o.amount)} π</span> · ${date(o.createdAt)}${o.txid ? ` · tx <span class="mono">${esc(o.txid)}</span>` : ""}</span></div>`; }).join("")}</div>` : empty("Aucune commande pour l'instant.")) +
    section("Messages au promoteur",
      data.messages.length ? `<div class="card list-card">${data.messages.map((m) => `<div class="item"><div class="row-top"><b>@${esc(m.username)}</b><span class="small muted">${date(m.createdAt)}</span></div><p>${esc(m.message)}</p></div>`).join("")}</div>` : empty("Aucun message.")) +
    section("Catalogue des produits",
      `<div class="card list-card">${data.products.filter((p) => p.status !== "pending").map(productItem).join("")}</div>`,
      "Modifiez un prix en Pi puis touchez Enregistrer. Les prix de départ sont indicatifs.") +
    section("Demandes traitées récemment",
      doneReq.length ? `<div class="card list-card">${doneReq.map((r) => `<div class="item"><div class="row-top"><b>@${esc(r.username)} · ${esc(r.crop)}</b><span class="small muted">${date(r.answeredAt)}</span></div><p class="answer">${esc(r.answer)}</p></div>`).join("")}</div>` : empty("Aucune demande traitée."));
}

function productItem(p) {
  const st = PSTATUS[p.status] || PSTATUS.pending;
  return `<div class="item"><div class="row-top"><b>${esc(p.name)}</b><span class="pill pill-${st[1]}">${st[0]}</span></div><span class="small muted">${esc(p.seller)} · ${esc(p.place)}${p.country ? ", " + esc(p.country) : ""} · ${esc(p.category)}</span>
    <div class="inline-actions"><label class="sr" for="pr-${esc(p.id)}">Prix en Pi</label><input id="pr-${esc(p.id)}" class="input price-in" inputmode="decimal" value="${String(p.pricePi).replace(".", ",")}"><span class="small muted" style="align-self:center">π par ${esc(p.unit)}</span>
    <label class="sr" for="ce-${esc(p.id)}">Garantie</label><select id="ce-${esc(p.id)}" class="input" style="width:auto">${Object.keys(CERT).map((k) => `<option value="${k}"${k === p.cert ? " selected" : ""}>${CERT[k]}</option>`).join("")}</select></div>
    <div class="inline-actions"><button class="btn btn-ghost" data-save="${esc(p.id)}">Enregistrer</button>${p.status !== "approved" ? `<button class="btn btn-primary" data-pstatus="approved" data-id="${esc(p.id)}">Publier</button>` : `<button class="btn btn-ghost" data-pstatus="pending" data-id="${esc(p.id)}">Retirer de la vente</button>`}${p.status !== "rejected" ? `<button class="btn btn-ghost" data-pstatus="rejected" data-id="${esc(p.id)}">Refuser</button>` : ""}</div></div>`;
}

async function load() {
  try {
    data = await api("/api/admin/overview");
    $("#login").hidden = true; $("#dash").hidden = false; render();
  } catch (e) {
    $("#login").hidden = false; $("#dash").hidden = true;
    if (e.status === 403 && adminToken) { toast("Jeton refusé."); adminToken = null; set("bsme:admin", null); }
    else if (e.status !== 403) toast(e.message);
  }
}

$("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  adminToken = $("#tok").value.trim(); set("bsme:admin", adminToken); load();
});

document.addEventListener("click", async (e) => {
  const ph = e.target.closest("button[data-photo]");
  if (ph) {
    try {
      const { photo } = await api("/api/admin/requests/" + encodeURIComponent(ph.dataset.photo) + "/photo");
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) throw new Error("Photo illisible.");
      const img = document.getElementById("ph-" + ph.dataset.photo); img.src = photo; img.hidden = false; ph.hidden = true;
    } catch (err) { toast(err.message); }
    return;
  }
  const b = e.target.closest("button[data-val],button[data-answer],button[data-save],button[data-pstatus]");
  if (!b) return;
  b.setAttribute("aria-busy", "true");
  try {
    if (b.dataset.val) {
      const r = await api("/api/admin/validations", { uid: b.dataset.uid, courseId: b.dataset.course, moduleIndex: Number(b.dataset.mod), decision: b.dataset.val });
      toast(r.certificate ? `Module validé. Certificat délivré : ${r.certificate.code}` : b.dataset.val === "approve" ? "Module validé." : "Demande refusée.");
    } else if (b.dataset.answer) {
      const answer = $("#ans-" + CSS.escape(b.dataset.answer)).value.trim();
      if (answer.length < 2) { toast("Écrivez une réponse."); return; }
      await api("/api/admin/requests/" + encodeURIComponent(b.dataset.answer), { answer });
      toast("Réponse envoyée.");
    } else if (b.dataset.save) {
      const id = b.dataset.save;
      const price = parseFloat($("#pr-" + CSS.escape(id)).value.replace(",", "."));
      await api("/api/admin/products/" + encodeURIComponent(id), { pricePi: price, cert: $("#ce-" + CSS.escape(id)).value });
      toast("Produit enregistré.");
    } else if (b.dataset.pstatus) {
      await api("/api/admin/products/" + encodeURIComponent(b.dataset.id), { status: b.dataset.pstatus });
      toast("Statut du produit mis à jour.");
    }
    await load();
  } catch (err) { toast(err.message); } finally { b.removeAttribute("aria-busy"); }
});

load();
})();
