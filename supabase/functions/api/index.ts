// Fonction Supabase « api » : serveur de production de Bio Star Monde Éden.
// Secrets attendus (Edge Functions > Secrets, saisis par le propriétaire du projet) :
//   PI_API_KEY        clé API serveur de l'application Pi (Testnet, puis Mainnet)
// Réglages facultatifs : PI_NETWORK (testnet|mainnet), PI_SANDBOX (true|false), ALLOWED_ORIGINS, PI_VALIDATION_KEY.
// Déployée avec verify_jwt = false : l'authentification se fait par le jeton Pi, vérifié auprès de l'API Pi.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createApi } from './handler.js';
import catalogue from './catalogue.json' with { type: 'json' };

function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try { const key = JSON.parse(keys).default; if (key) return key; } catch { /* clé historique ci-dessous */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false }
});

function fail(action: string, error: any): never {
  throw new Error('Base de données (' + action + ') : ' + (error?.message ?? 'erreur inconnue'));
}

const store = {
  kind: 'supabase',
  async getOrder(paymentId: string) {
    const { data, error } = await db.from('orders').select('*').eq('payment_id', paymentId).maybeSingle();
    if (error) fail('lecture', error);
    return data;
  },
  async insertOrder(order: Record<string, unknown>) {
    const { error } = await db.from('orders').insert(order);
    if (error) fail('création', error);
  },
  async completeOrder(paymentId: string, txid: string) {
    const { error } = await db.from('orders').update({ txid, status: 'completed' }).eq('payment_id', paymentId);
    if (error) fail('finalisation', error);
  },
  async cancelOrder(paymentId: string) {
    const { error } = await db.from('orders').update({ status: 'cancelled' }).eq('payment_id', paymentId).neq('status', 'completed');
    if (error) fail('annulation', error);
  }
};

const api = createApi({
  catalogue: (catalogue as any).items,
  store,
  piApiKey: Deno.env.get('PI_API_KEY') ?? '',
  sandbox: Deno.env.get('PI_SANDBOX') === 'true',
  network: Deno.env.get('PI_NETWORK') === 'mainnet' ? 'mainnet' : 'testnet',
  validationKey: Deno.env.get('PI_VALIDATION_KEY') ?? '',
  exposeErrors: false
});

// L'interface est publiée sur un autre domaine (Vercel) : on autorise ses appels (CORS).
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = allowedOrigins.includes('*') ? '*' : (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const res = (await api(req)) ?? new Response(JSON.stringify({ error: 'Route inconnue.' }), {
    status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
