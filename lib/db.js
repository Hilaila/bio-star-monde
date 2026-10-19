"use strict";
/*
 * Accès aux données.
 * - Production : Supabase (PostgreSQL) via son API REST, avec la clé service_role (jamais exposée au navigateur).
 * - Développement local : stockage en mémoire, réinitialisé à chaque redémarrage.
 * Les deux implémentations offrent les mêmes opérations simples (égalité stricte sur les filtres).
 */

const SEED_PRODUCTS = [
  { name: "Tomates rondes", category: "Fruits et légumes", seller: "Ferme-école de Loumbila", place: "Loumbila", country: "Burkina Faso", price_pi: 0.2, unit: "kg", cert: "spg", gps: "12,4925° N · 1,4048° O", inputs: ["Compost 20 t/ha", "Extrait de neem 5 %", "Paillage"] },
  { name: "Ananas pain de sucre", category: "Fruits et légumes", seller: "Ferme-école de Tsévié", place: "Tsévié", country: "Togo", price_pi: 0.3, unit: "pièce", cert: "spg", gps: "6,4261° N · 1,2133° E", inputs: ["Compost de résidus de culture", "Paillage végétal"] },
  { name: "Chou pommé", category: "Fruits et légumes", seller: "Ferme-école de Loumbila", place: "Loumbila", country: "Burkina Faso", price_pi: 0.2, unit: "pièce", cert: "spg", gps: "12,4925° N · 1,4048° O", inputs: ["Compost", "Neem 5 %", "Association oignon-chou"] },
  { name: "Poulet local élevé en plein air", category: "Élevage", seller: "Ferme-école de Bobo-Dioulasso", place: "Bobo-Dioulasso", country: "Burkina Faso", price_pi: 1.5, unit: "unité", cert: "spg", gps: "11,1771° N · 4,2979° O", inputs: ["Provende locale", "Vaccin Newcastle à jour"] },
  { name: "Miel de karité et de néré", category: "Transformés", seller: "Ferme-école de Bobo-Dioulasso", place: "Bobo-Dioulasso", country: "Burkina Faso", price_pi: 1.5, unit: "kg", cert: "spg", gps: "11,1771° N · 4,2979° O", inputs: ["Ruches kényanes", "Récolte sans produit chimique"] },
  { name: "Gari de manioc", category: "Transformés", seller: "Ferme-école de Tsévié", place: "Tsévié", country: "Togo", price_pi: 0.4, unit: "kg", cert: "spg", gps: "6,4261° N · 1,2133° E", inputs: ["Manioc de parcelles agroforestières", "Torréfaction artisanale"] },
  { name: "Compost mûr tamisé", category: "Intrants", seller: "Ferme-école de Loumbila", place: "Loumbila", country: "Burkina Faso", price_pi: 1, unit: "sac de 50 kg", cert: "spg", gps: "12,4925° N · 1,4048° O", inputs: ["Tiges de mil", "Fumier bovin", "Cendre"] },
];

function seedRows() {
  const base = Date.parse("2026-10-01T08:00:00Z");
  return SEED_PRODUCTS.map((p, i) => ({
    id: `seed-${i + 1}`,
    ...p,
    status: "approved",
    owner_uid: null,
    owner_username: null,
    created_at: new Date(base + i * 60000).toISOString(),
  }));
}

function memoryStore() {
  const t = { users: [], progress: [], certificates: [], products: seedRows(), orders: [], requests: [], messages: [] };
  const match = (row, f) => Object.entries(f || {}).every(([k, v]) => row[k] === v);
  const copy = (r) => JSON.parse(JSON.stringify(r));
  const need = (f) => { if (!f || !Object.keys(f).length) throw new Error("Filtre obligatoire"); };
  return {
    kind: "memory",
    async insert(table, row) { t[table].push(copy(row)); return copy(row); },
    async upsert(table, row, keys) {
      const i = t[table].findIndex((r) => keys.every((k) => r[k] === row[k]));
      if (i >= 0) { t[table][i] = { ...t[table][i], ...copy(row) }; return copy(t[table][i]); }
      t[table].push(copy(row));
      return copy(row);
    },
    async select(table, f, { order, limit, columns } = {}) {
      let rows = t[table].filter((r) => match(r, f)).map(copy);
      if (columns) { const cols = columns.split(","); rows = rows.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]]))); }
      if (order) {
        const [col, dir] = order.split(".");
        rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === "desc" ? -1 : 1));
      }
      return limit ? rows.slice(0, limit) : rows;
    },
    async update(table, f, patch) {
      need(f);
      const out = [];
      t[table].forEach((r, i) => { if (match(r, f)) { t[table][i] = { ...r, ...copy(patch) }; out.push(copy(t[table][i])); } });
      return out;
    },
    async remove(table, f) { need(f); t[table] = t[table].filter((r) => !match(r, f)); },
    async count(table, f) { return t[table].filter((r) => match(r, f)).length; },
  };
}

function supabaseStore(url, key) {
  const base = url.replace(/\/+$/, "") + "/rest/v1/";
  async function rest(method, path, body, prefer) {
    // Ancienne clé service_role (JWT « eyJ… ») : en-têtes apikey + Authorization.
    // Nouvelle clé secrète (« sb_secret_… ») : en-tête apikey seul, elle n'est pas un JWT.
    const headers = { apikey: key, "Content-Type": "application/json" };
    if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = method === "HEAD" ? "" : await r.text();
    if (!r.ok) {
      console.error("Supabase", r.status, text.slice(0, 300));
      throw Object.assign(new Error("Erreur de la base de données."), { status: 500 });
    }
    return { data: text ? JSON.parse(text) : null, headers: r.headers };
  }
  const qs = (f) => Object.entries(f || {}).map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`).join("&");
  const need = (f) => { if (!f || !Object.keys(f).length) throw new Error("Filtre obligatoire"); };
  return {
    kind: "supabase",
    async insert(table, row) { const { data } = await rest("POST", table, row, "return=representation"); return data[0]; },
    async upsert(table, row, keys) {
      const { data } = await rest("POST", `${table}?on_conflict=${keys.join(",")}`, row, "resolution=merge-duplicates,return=representation");
      return data[0];
    },
    async select(table, f, { order, limit, columns } = {}) {
      let q = `${table}?select=${columns || "*"}`;
      const w = qs(f);
      if (w) q += "&" + w;
      if (order) q += `&order=${order}`;
      if (limit) q += `&limit=${limit}`;
      const { data } = await rest("GET", q);
      return data || [];
    },
    async update(table, f, patch) { need(f); const { data } = await rest("PATCH", `${table}?${qs(f)}`, patch, "return=representation"); return data || []; },
    async remove(table, f) { need(f); await rest("DELETE", `${table}?${qs(f)}`); },
    async count(table, f) {
      let q = `${table}?select=*`;
      const w = qs(f);
      if (w) q += "&" + w;
      const { headers } = await rest("HEAD", q, undefined, "count=exact");
      const cr = headers.get("content-range") || "*/0";
      return Number(cr.split("/")[1]) || 0;
    },
  };
}

let store = null;
function getStore() {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    store = supabaseStore(url, key);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("ATTENTION : SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absent. Stockage en mémoire, données perdues au redémarrage.");
    }
    store = memoryStore();
  }
  return store;
}

function resetStoreForTests() { store = null; }

module.exports = { getStore, resetStoreForTests, SEED_PRODUCTS };
