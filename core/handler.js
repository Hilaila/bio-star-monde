// Cœur de l'API Bio Star Monde Éden.
// Utilisé tel quel par la fonction Appwrite (production) et par le serveur Node (local, Docker).
// Uniquement des API web standard : Request, Response, fetch, crypto.randomUUID.

const PI_API = 'https://api.minepi.com/v2';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Le prix de référence d'un paiement est toujours celui du catalogue, jamais celui envoyé par le navigateur.
export function validateCatalogue(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Catalogue vide ou mal formé');
  const ids = new Set();
  return items.map((p) => {
    if (typeof p.id !== 'string' || !/^[a-z0-9-]{3,64}$/.test(p.id) || ids.has(p.id)) throw new Error('Catalogue : identifiant invalide ou en double : ' + p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) throw new Error('Catalogue : nom invalide pour ' + p.id);
    if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) throw new Error('Catalogue : montant invalide pour ' + p.id);
    ids.add(p.id);
    return { ...p, currency: 'Pi' };
  });
}

// store : { kind, getOrder(paymentId), insertOrder(order), completeOrder(paymentId, txid), cancelOrder(paymentId) } — méthodes asynchrones.
export function createApi({ catalogue, store, piApiKey = '', sandbox = false, network = 'testnet', validationKey = '', exposeErrors = false, fetchImpl, log = (...a) => console.error(...a) }) {
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);
  const products = validateCatalogue(catalogue);
  const getProduct = (id) => products.find((p) => p.id === id);
  const validPaymentId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 128;
  const isCancelled = (payment) => Boolean(payment.status?.cancelled || payment.status?.user_cancelled);

  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }
  async function readBody(request) {
    const text = await request.text();
    if (text.length > 32_000) throw new HttpError(413, 'Requête trop volumineuse');
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new HttpError(400, 'JSON invalide'); }
  }
  async function piApi(endpoint, options = {}) {
    if (!piApiKey) throw new HttpError(503, 'PI_API_KEY non configurée côté serveur');
    const response = await doFetch(PI_API + endpoint, {
      ...options,
      headers: { Authorization: 'Key ' + piApiKey, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) throw new HttpError(response.status, 'API Pi a répondu HTTP ' + response.status);
    return data;
  }
  async function piMe(accessToken) {
    if (typeof accessToken !== 'string' || accessToken.length < 10 || accessToken.length > 4096) throw new HttpError(400, 'Jeton Pi manquant ou invalide');
    const response = await doFetch(PI_API + '/me', { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!response.ok) throw new HttpError(400, 'Vérification du compte Pi impossible (HTTP ' + response.status + ')');
    const me = await response.json();
    if (!me.uid || !me.username) throw new HttpError(400, 'Réponse du compte Pi incomplète');
    return me;
  }
  const getPayment = (paymentId) => piApi('/payments/' + encodeURIComponent(paymentId));

  // Finalise une commande approuvée. Le txid de référence est celui enregistré par l'API Pi ;
  // celui du navigateur ne sert que si l'API ne l'a pas encore renvoyé (l'API Pi le vérifie à la finalisation).
  async function finalizeOrder(order, payment, paymentId, clientTxid) {
    const piTxid = payment.transaction?.txid;
    if (piTxid && clientTxid && piTxid !== clientTxid) return { ok: false, httpStatus: 409, error: 'La transaction ne correspond pas à celle enregistrée par Pi.' };
    const txid = piTxid || (typeof clientTxid === 'string' && clientTxid.length <= 256 ? clientTxid : '');
    if (!txid) return { ok: false, httpStatus: 409, error: 'Transaction absente : le paiement n’a pas encore été signé.' };
    if (Number(payment.amount) !== Number(order.amount)) return { ok: false, httpStatus: 400, error: 'Montant inattendu.' };
    if (!payment.status?.developer_completed) {
      await piApi('/payments/' + encodeURIComponent(paymentId) + '/complete', { method: 'POST', body: JSON.stringify({ txid }) });
    }
    await store.completeOrder(paymentId, txid);
    return { ok: true };
  }
  function newOrder(me, product, paymentId) {
    return { id: crypto.randomUUID(), username: me.username, product_id: product.id, amount: product.amount, memo: product.name, payment_id: paymentId, status: 'approved', created_at: new Date().toISOString() };
  }

  const routes = {
    'GET /api/config': async () => json(200, { sandbox, network }),
    'GET /api/products': async () => json(200, { products }),
    'GET /api/me': async () => json(200, { authenticated: false, message: 'Connectez-vous avec Pi Browser.' }),

    'POST /api/pi-auth': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      return json(200, { ok: true, uid: me.uid, username: me.username });
    },

    'POST /api/payments/approve': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      const product = getProduct(body.productId);
      if (!product) return json(400, { error: 'Produit inconnu.' });
      if (!validPaymentId(body.paymentId)) return json(400, { error: 'Identifiant de paiement invalide.' });
      const existing = await store.getOrder(body.paymentId);
      if (existing) {
        if (existing.username !== me.username || existing.product_id !== product.id) return json(409, { error: 'Paiement déjà associé à une autre commande.' });
        return json(200, { ok: true, status: existing.status });
      }
      const payment = await getPayment(body.paymentId);
      if (payment.user_uid !== me.uid) return json(403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
      if (Number(payment.amount) !== product.amount) return json(400, { error: 'Le montant du paiement ne correspond pas au prix enregistré côté serveur.' });
      if (isCancelled(payment)) return json(409, { error: 'Ce paiement a été annulé.' });
      if (payment.status?.developer_approved || payment.status?.developer_completed) return json(409, { error: 'Ce paiement a déjà été traité.' });
      await piApi('/payments/' + encodeURIComponent(body.paymentId) + '/approve', { method: 'POST', body: '{}' });
      const order = newOrder(me, product, body.paymentId);
      await store.insertOrder(order);
      return json(200, { ok: true, orderId: order.id, status: 'approved' });
    },

    'POST /api/payments/complete': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!validPaymentId(body.paymentId) || !body.txid || typeof body.txid !== 'string') return json(400, { error: 'Identifiant de paiement ou transaction manquant.' });
      const order = await store.getOrder(body.paymentId);
      if (!order || order.username !== me.username) return json(404, { error: 'Commande approuvée introuvable pour ce compte.' });
      if (order.status === 'completed') return json(200, { ok: true, status: 'completed' });
      const payment = await getPayment(body.paymentId);
      if (payment.user_uid !== me.uid) return json(403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
      if (isCancelled(payment)) { await store.cancelOrder(body.paymentId); return json(409, { error: 'Ce paiement a été annulé.' }); }
      const result = await finalizeOrder(order, payment, body.paymentId, body.txid);
      if (!result.ok) return json(result.httpStatus, { error: result.error });
      return json(200, { ok: true, status: 'completed', message: 'Paiement confirmé par l’API Pi. Livrez le produit après vérification.' });
    },

    // Paiement signé mais non finalisé (fermeture de l'application, coupure réseau…).
    // Signalé par Pi.authenticate ; à traiter, sinon l'utilisateur ne peut plus payer.
    'POST /api/payments/incomplete': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!validPaymentId(body.paymentId)) return json(400, { error: 'Identifiant de paiement invalide.' });
      const payment = await getPayment(body.paymentId);
      if (payment.user_uid !== me.uid) return json(403, { error: 'Le paiement ne correspond pas au compte Pi connecté.' });
      let order = await store.getOrder(body.paymentId);
      if (order && order.username !== me.username) return json(403, { error: 'Cette commande appartient à un autre compte.' });
      if (isCancelled(payment)) { await store.cancelOrder(body.paymentId); return json(200, { ok: true, status: 'cancelled' }); }
      if (order?.status === 'completed') return json(200, { ok: true, status: 'completed' });
      if (!payment.transaction?.txid && !body.txid) return json(200, { ok: true, status: 'pending', message: 'Paiement non signé : il sera annulé au prochain paiement.' });
      if (!order) {
        // Paiement approuvé auprès de Pi mais commande absente de la base (arrêt du serveur, par exemple).
        const product = getProduct(payment.metadata?.productId);
        if (!payment.status?.developer_approved || !product || Number(payment.amount) !== product.amount) {
          log(new Date().toISOString(), 'Paiement incomplet sans commande correspondante', body.paymentId);
          return json(409, { error: 'Paiement incomplet sans commande correspondante : vérification manuelle nécessaire.' });
        }
        await store.insertOrder(newOrder(me, product, body.paymentId));
        order = await store.getOrder(body.paymentId);
      }
      const result = await finalizeOrder(order, payment, body.paymentId, body.txid);
      if (!result.ok) return json(result.httpStatus, { error: result.error });
      return json(200, { ok: true, status: 'completed', message: 'Paiement précédent finalisé.' });
    },

    'POST /api/payments/cancel': async (request) => {
      const body = await readBody(request);
      const me = await piMe(body.accessToken);
      if (!validPaymentId(body.paymentId)) return json(400, { error: 'Identifiant de paiement manquant.' });
      const order = await store.getOrder(body.paymentId);
      if (order && order.username !== me.username) return json(403, { error: 'Cette commande appartient à un autre compte.' });
      if (order) await store.cancelOrder(body.paymentId);
      return json(200, { ok: true, status: 'cancelled' });
    }
  };

  // Renvoie une Response, ou null si la requête ne concerne pas l'API (fichier statique côté Node).
  return async function handle(request) {
    const url = new URL(request.url);
    // On retire un éventuel préfixe /functions/v1 (hébergements qui le transmettent).
    const pathname = url.pathname.replace(/^\/functions\/v1(?=\/)/, '');
    try {
      if (request.method === 'GET' && (pathname === '/healthz' || pathname === '/api/health')) {
        return json(200, { ok: true, app: 'Bio Star Monde Éden', network, environment: sandbox ? 'sandbox-configured' : 'non-sandbox', piApiKeyConfigured: Boolean(piApiKey), database: store.kind });
      }
      if (request.method === 'GET' && pathname === '/validation-key.txt') {
        return new Response((validationKey || 'Clé de validation non configurée.') + '\n', { status: validationKey ? 200 : 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      if (!pathname.startsWith('/api/')) return null;
      const route = routes[request.method + ' ' + pathname];
      if (!route) return json(404, { error: 'Route API inconnue.' });
      return await route(request);
    } catch (err) {
      const status = err.status || 500;
      log(new Date().toISOString(), request.method, pathname, err.message);
      return json(status, { error: exposeErrors ? err.message : 'Requête impossible. Vérifiez la configuration et les journaux serveur.' });
    }
  };
}
