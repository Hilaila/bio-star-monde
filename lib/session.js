"use strict";
const crypto = require("crypto");

const DEV_SECRET = "dev-only-secret-change-me";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw Object.assign(new Error("SESSION_SECRET manquant"), { status: 500 });
    return DEV_SECRET;
  }
  return s;
}

function sign(payload, ttlSeconds = 7 * 24 * 3600) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const b = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(b).digest("base64url");
  return `${b}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b, sig] = parts;
  const expected = crypto.createHmac("sha256", secret()).update(b).digest("base64url");
  const a = Buffer.from(sig);
  const e = Buffer.from(expected);
  if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) return null;
  try {
    const p = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { sign, verify, safeEqual };
