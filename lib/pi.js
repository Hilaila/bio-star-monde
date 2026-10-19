"use strict";
/*
 * Client de la Pi Platform API (https://api.minepi.com/v2).
 * - /me : vérifie le jeton d'accès de l'utilisateur (Authorization: Bearer <accessToken>)
 * - /payments/* : opérations sensibles avec la clé serveur (Authorization: Key <PI_API_KEY>)
 * La clé serveur ne quitte jamais le serveur.
 */

function base() {
  return (process.env.PI_API_BASE || "https://api.minepi.com/v2").replace(/\/+$/, "");
}

function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, ...extra });
}

async function call(path, { method = "GET", body, bearer } = {}) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  } else {
    const key = process.env.PI_API_KEY;
    if (!key) throw httpError(503, "La clé serveur Pi (PI_API_KEY) n'est pas configurée.");
    headers.Authorization = `Key ${key}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let res;
  try {
    res = await fetch(base() + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw httpError(502, "Le serveur Pi ne répond pas. Réessayez dans un instant.");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    if (res.status === 401 && !bearer) {
      throw httpError(502, "La clé serveur Pi (PI_API_KEY) est refusée par Pi. Vérifiez-la dans le Developer Portal.", { pi: data });
    }
    const status = res.status === 401 ? 401 : res.status === 404 ? 404 : 502;
    throw httpError(status, `Erreur de l'API Pi (${res.status})`, { pi: data });
  }
  return data;
}

const enc = encodeURIComponent;

module.exports = {
  me: (accessToken) => call("/me", { bearer: accessToken }),
  getPayment: (id) => call(`/payments/${enc(id)}`),
  approve: (id) => call(`/payments/${enc(id)}/approve`, { method: "POST" }),
  complete: (id, txid) => call(`/payments/${enc(id)}/complete`, { method: "POST", body: { txid } }),
  cancel: (id) => call(`/payments/${enc(id)}/cancel`, { method: "POST" }),

  /* Vérifie sur la blockchain Pi (Horizon) que la transaction porte bien l'identifiant du paiement en mémo. */
  async txMemoMatches(link, expectedMemo) {
    let url;
    try { url = new URL(link); } catch { return false; }
    const allowed = (process.env.PI_HORIZON_HOSTS || "api.testnet.minepi.com,api.mainnet.minepi.com")
      .split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(url.host)) return false;
    try {
      const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!r.ok) return false;
      const tx = await r.json();
      return tx && tx.memo === expectedMemo;
    } catch {
      return false;
    }
  },
};
