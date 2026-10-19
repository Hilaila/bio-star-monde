-- Commandes Bio Star Monde Éden.
-- Accès réservé à la fonction serveur « api » (clé secrète) : RLS activée, aucune politique publique.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  product_id text not null,
  amount numeric(20, 7) not null check (amount > 0),
  memo text not null,
  payment_id text not null unique,
  txid text,
  status text not null check (status in ('approved', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists orders_username_idx on public.orders (username);

alter table public.orders enable row level security;
revoke all on table public.orders from anon, authenticated;

comment on table public.orders is 'Commandes Bio Star Monde Éden. Accès réservé à la fonction serveur (clé secrète) ; aucune politique RLS publique.';
