"use strict";
/*
 * Serveur autonome : développement local, Railway, Render ou tout hébergeur Node.js.
 * Sur Vercel, c'est api/index.js qui est utilisé, avec vercel.json pour les réécritures.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { handle } = require("./lib/router");

const PUBLIC = path.join(__dirname, "public");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2",
};
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "frame-ancestors 'self' https://*.minepi.com https://*.pinet.com; object-src 'none'; base-uri 'self'",
};

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...SECURITY });
      res.end("Page introuvable.");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const noCache = ext === ".html" || file.endsWith("sw.js") || ext === ".webmanifest";
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": noCache ? "no-cache" : "public, max-age=3600",
      ...SECURITY,
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { res.writeHead(400); return res.end(); }

  if (pathname === "/validation-key.txt") { req.url = "/api/validation-key"; return handle(req, res); }
  if (pathname === "/api" || pathname.startsWith("/api/")) return handle(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, SECURITY); return res.end(); }

  if (/^\/verify\/[A-Za-z0-9-]+$/.test(pathname)) pathname = "/verify.html";
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403, SECURITY); return res.end(); }
  serveFile(req, res, file);
});

const port = Number(process.env.PORT) || 3000;
if (require.main === module) {
  server.listen(port, () => console.log(`Bio Star Monde Eden : http://localhost:${port}`));
}
module.exports = server;
