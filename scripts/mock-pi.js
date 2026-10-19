"use strict";
/*
 * Fausse API Pi pour la démonstration locale et les tests d'interface (ne jamais déployer).
 * Imite https://api.minepi.com/v2 : /me, /payments/{id}, approve, complete, cancel,
 * plus un faux Horizon (/transactions/{txid}) et /mock/payments pour simuler Pi.createPayment.
 *   PORT=4100 node scripts/mock-pi.js
 */
const http = require("http");
const crypto = require("crypto");

const users = {
  "tok-alice": { uid: "uid-alice", username: "pionnier_demo" },
  "tok-admin": { uid: "uid-zougba", username: "zougba" },
};
const payments = new Map();
const port = Number(process.env.PORT) || 4100;

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const json = (s, d) => { res.writeHead(s, { "Content-Type": "application/json", ...cors }); res.end(JSON.stringify(d)); };
    const data = body ? JSON.parse(body) : {};
    if (url.pathname === "/v2/me") {
      const tok = String(req.headers.authorization || "").replace(/^Bearer /, "");
      return users[tok] ? json(200, users[tok]) : json(401, { error: "invalid_token" });
    }
    if (url.pathname === "/mock/payments" && req.method === "POST") {
      const id = "pay-" + crypto.randomBytes(4).toString("hex");
      const p = {
        identifier: id, user_uid: data.uid, amount: data.amount, memo: data.memo || "", metadata: data.metadata,
        from_address: "GDEMO", to_address: "GAPP", direction: "user_to_app", network: "Pi Testnet", created_at: new Date().toISOString(),
        status: { developer_approved: false, transaction_verified: false, developer_completed: false, cancelled: false, user_cancelled: false },
        transaction: null,
      };
      payments.set(id, p);
      return json(200, p);
    }
    let m = url.pathname.match(/^\/v2\/payments\/([^/]+)(?:\/(approve|complete|cancel))?$/);
    if (m) {
      const p = payments.get(m[1]);
      if (!p) return json(404, { error: "not_found" });
      if (m[2] === "approve") p.status.developer_approved = true;
      if (m[2] === "complete") { p.status.developer_completed = true; p.transaction = { txid: data.txid, verified: true, _link: `http://127.0.0.1:${port}/transactions/${data.txid}` }; }
      if (m[2] === "cancel") p.status.cancelled = true;
      return json(200, p);
    }
    m = url.pathname.match(/^\/transactions\/([^/]+)$/);
    if (m) {
      const p = [...payments.values()].find((x) => x.transaction && x.transaction.txid === m[1]);
      return json(200, { id: m[1], memo: p ? p.identifier : null });
    }
    json(404, { error: "unknown" });
  });
}).listen(port, "127.0.0.1", () => console.log(`Fausse API Pi : http://127.0.0.1:${port}`));
