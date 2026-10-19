/* Service worker : l'application reste utilisable sans réseau (leçons, recettes, diagnostic, carbone). */
const VERSION = "bsme-v1.0.0";
const SHELL = [
  "/", "/index.html", "/assets/app.css", "/assets/app.js", "/data/catalog.json",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon-32.png",
  "/privacy.html", "/terms.html", "/verify.html",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok && req.method === "GET") cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === "/api/products" || url.pathname === "/api/stats") { e.respondWith(networkFirst(req)); return; }
    if (url.pathname.startsWith("/api/") || url.pathname === "/validation-key.txt" || url.pathname.startsWith("/admin")) return;
    if (req.mode === "navigate") {
      const fallback = url.pathname.startsWith("/verify/") ? "/verify.html" : "/index.html";
      e.respondWith(networkFirst(req, fallback));
      return;
    }
    e.respondWith(networkFirst(req));
    return;
  }

  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") { e.respondWith(staleWhileRevalidate(req)); return; }
  if (url.host === "sdk.minepi.com") { e.respondWith(networkFirst(req)); }
});
