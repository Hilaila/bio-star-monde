-- ============================================================
-- Bio Star Monde Eden : schéma de la base de données (Supabase / PostgreSQL)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.
-- Le serveur utilise la clé service_role ; la sécurité par ligne (RLS) est activée
-- sans aucune règle publique, donc la clé « anon » ne peut rien lire ni écrire.
-- ============================================================

create table if not exists users (
  uid         text primary key,
  username    text not null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

create table if not exists progress (
  uid           text not null references users(uid) on delete cascade,
  username      text,
  course_id     text not null,
  module_index  integer not null check (module_index >= 0),
  status        text not null check (status in ('done', 'pending')),
  updated_at    timestamptz not null default now(),
  primary key (uid, course_id, module_index)
);
create index if not exists progress_status_idx on progress (status);

create table if not exists certificates (
  code          text primary key,
  uid           text not null references users(uid) on delete cascade,
  username      text not null,
  course_id     text not null,
  course_title  text not null,
  issued_at     timestamptz not null default now(),
  hash          text not null,
  status        text not null default 'valid' check (status in ('valid', 'revoked')),
  unique (uid, course_id)
);

create table if not exists products (
  id              text primary key,
  name            text not null,
  category        text not null,
  seller          text not null,
  place           text not null,
  country         text,
  price_pi        numeric(20, 7) not null check (price_pi > 0),
  unit            text not null,
  cert            text not null default 'pending' check (cert in ('spg', 'bio', 'conv', 'pending')),
  status          text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  owner_uid       text references users(uid) on delete set null,
  owner_username  text,
  inputs          jsonb not null default '[]'::jsonb,
  gps             text,
  created_at      timestamptz not null default now()
);
create index if not exists products_status_idx on products (status);

create table if not exists orders (
  id          text primary key,
  uid         text not null references users(uid),
  username    text not null,
  items       jsonb not null,
  amount      numeric(20, 7) not null check (amount > 0),
  memo        text not null,
  status      text not null check (status in ('created', 'approved', 'paid', 'cancelled')),
  payment_id  text unique,
  txid        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists orders_uid_idx on orders (uid);

create table if not exists requests (
  id           text primary key,
  uid          text not null references users(uid) on delete cascade,
  username     text not null,
  crop         text not null,
  symptom      text,
  cause        text,
  message      text,
  photo        text,
  has_photo    boolean not null default false,
  status       text not null default 'open' check (status in ('open', 'answered')),
  answer       text,
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);
create index if not exists requests_uid_idx on requests (uid);

create table if not exists messages (
  id          text primary key,
  uid         text not null references users(uid) on delete cascade,
  username    text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

alter table users        enable row level security;
alter table progress     enable row level security;
alter table certificates enable row level security;
alter table products     enable row level security;
alter table orders       enable row level security;
alter table requests     enable row level security;
alter table messages     enable row level security;

-- Produits de départ des fermes-écoles (prix indicatifs en Pi, modifiables dans /admin.html)
insert into products (id, name, category, seller, place, country, price_pi, unit, cert, status, inputs, gps, created_at) values
  ('seed-1', 'Tomates rondes', 'Fruits et légumes', 'Ferme-école de Loumbila', 'Loumbila', 'Burkina Faso', 0.2, 'kg', 'spg', 'approved', '["Compost 20 t/ha","Extrait de neem 5 %","Paillage"]'::jsonb, '12,4925° N · 1,4048° O', '2026-10-01T08:00:00.000Z'),
  ('seed-2', 'Ananas pain de sucre', 'Fruits et légumes', 'Ferme-école de Tsévié', 'Tsévié', 'Togo', 0.3, 'pièce', 'spg', 'approved', '["Compost de résidus de culture","Paillage végétal"]'::jsonb, '6,4261° N · 1,2133° E', '2026-10-01T08:01:00.000Z'),
  ('seed-3', 'Chou pommé', 'Fruits et légumes', 'Ferme-école de Loumbila', 'Loumbila', 'Burkina Faso', 0.2, 'pièce', 'spg', 'approved', '["Compost","Neem 5 %","Association oignon-chou"]'::jsonb, '12,4925° N · 1,4048° O', '2026-10-01T08:02:00.000Z'),
  ('seed-4', 'Poulet local élevé en plein air', 'Élevage', 'Ferme-école de Bobo-Dioulasso', 'Bobo-Dioulasso', 'Burkina Faso', 1.5, 'unité', 'spg', 'approved', '["Provende locale","Vaccin Newcastle à jour"]'::jsonb, '11,1771° N · 4,2979° O', '2026-10-01T08:03:00.000Z'),
  ('seed-5', 'Miel de karité et de néré', 'Transformés', 'Ferme-école de Bobo-Dioulasso', 'Bobo-Dioulasso', 'Burkina Faso', 1.5, 'kg', 'spg', 'approved', '["Ruches kényanes","Récolte sans produit chimique"]'::jsonb, '11,1771° N · 4,2979° O', '2026-10-01T08:04:00.000Z'),
  ('seed-6', 'Gari de manioc', 'Transformés', 'Ferme-école de Tsévié', 'Tsévié', 'Togo', 0.4, 'kg', 'spg', 'approved', '["Manioc de parcelles agroforestières","Torréfaction artisanale"]'::jsonb, '6,4261° N · 1,2133° E', '2026-10-01T08:05:00.000Z'),
  ('seed-7', 'Compost mûr tamisé', 'Intrants', 'Ferme-école de Loumbila', 'Loumbila', 'Burkina Faso', 1, 'sac de 50 kg', 'spg', 'approved', '["Tiges de mil","Fumier bovin","Cendre"]'::jsonb, '12,4925° N · 1,4048° O', '2026-10-01T08:06:00.000Z')
on conflict (id) do nothing;
