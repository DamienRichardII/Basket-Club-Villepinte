-- ============================================================================
-- BASKET CLUB VILLEPINTE (TeamBCV93) — Schéma Supabase
-- Projet : vtpgflcndrcjivdryynr  |  Région : eu-west-3 (Paris)
-- Réalisation : DamCompany
-- ----------------------------------------------------------------------------
-- Principe des droits :
--   • Contenu vitrine  -> lecture publique (anon), écriture réservée aux admins
--   • inscriptions      -> écriture publique (formulaire), lecture admin seule
--   • Un compte n'est admin que s'il figure dans la table public.admins.
--     Créer un compte via Supabase Auth NE donne aucun droit d'écriture.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table des administrateurs + helper is_admin()
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Comptes autorisés à administrer le site. Y ajouter une ligne pour donner les droits.';

-- security definer : contourne la RLS de public.admins pour éviter la récursion
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 2. Horodatage automatique
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Contenu vitrine
-- ---------------------------------------------------------------------------

-- 3.1 Catégories / équipes
create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,          -- EB, U11, U13, SH, SF, LO...
  name           text not null,
  age_range      text,                          -- « 5 - 7 ans »
  description    text,
  training_days  text,                          -- jours et créneaux d'entraînement
  venue          text,                          -- gymnase principal
  photo_url      text,                          -- photo d'effectif (Storage)
  photo_alt      text,
  sort_order     integer not null default 0,
  is_published   boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- 3.2 Palmarès
create table if not exists public.honours (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,                   -- « Champion départemental »
  season       text not null,                   -- « 2023-24 »
  category     text,                            -- équipe concernée
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- 3.3 Frise chronologique
create table if not exists public.timeline_events (
  id           uuid primary key default gen_random_uuid(),
  year         integer not null,
  title        text,
  description  text,
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- 3.4 Boutique
create table if not exists public.shop_products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  price_cents     integer,                      -- null = tarif non communiqué
  currency        text not null default 'EUR',
  image_url       text,                         -- remplace le visuel vectoriel
  image_alt       text,
  placeholder_key text,                         -- maillot-domicile | maillot-exterieur | sac | ballon
  checkout_url    text,                         -- lien de paiement à brancher plus tard
  is_placeholder  boolean not null default true,-- true => badge « tarif indicatif »
  available       boolean not null default false,
  sort_order      integer not null default 0,
  is_published    boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- 3.5 Réglages du site (coordonnées, horaires, réseaux, chiffres clés)
create table if not exists public.site_settings (
  key         text primary key,
  value       text,
  label       text not null,                    -- libellé affiché dans l'admin
  group_name  text not null default 'general',  -- regroupement dans l'admin
  input_type  text not null default 'text',     -- text | textarea | url | tel | email
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- 3.6 Médiathèque
create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,                   -- chemin dans le bucket « medias »
  public_url   text not null,
  page         text not null default 'general', -- accueil | categories | histoire | palmares | boutique | galerie
  section      text,                            -- ex. code de catégorie, année...
  caption      text,
  alt_text     text,
  mime_type    text,
  size_bytes   bigint,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists media_assets_page_idx on public.media_assets (page, sort_order);

-- ---------------------------------------------------------------------------
-- 4. Inscriptions (données personnelles — RGPD)
-- ---------------------------------------------------------------------------
create table if not exists public.inscriptions (
  id             uuid primary key default gen_random_uuid(),
  last_name      text not null,
  first_name     text not null,
  birth_date     date,
  category_code  text,
  email          text not null,
  phone          text,
  guardian_name  text,                           -- responsable légal si mineur
  guardian_phone text,
  message        text,
  consent        boolean not null default false, -- consentement RGPD explicite
  status         text not null default 'nouveau',-- nouveau | traite | archive
  season         text,
  source         text default 'site',            -- site | qr-code
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists inscriptions_created_idx on public.inscriptions (created_at desc);

-- Le consentement RGPD est obligatoire côté base, pas seulement côté formulaire.
alter table public.inscriptions drop constraint if exists inscriptions_consent_required;
alter table public.inscriptions add constraint inscriptions_consent_required check (consent = true);

alter table public.inscriptions drop constraint if exists inscriptions_status_valid;
alter table public.inscriptions add constraint inscriptions_status_valid
  check (status in ('nouveau', 'traite', 'archive'));

-- ---------------------------------------------------------------------------
-- 5. Triggers updated_at
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories','honours','timeline_events','shop_products',
                           'site_settings','media_assets','inscriptions']
  loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$s', t);
    execute format('create trigger trg_%1$s_touch before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.admins          enable row level security;
alter table public.categories      enable row level security;
alter table public.honours         enable row level security;
alter table public.timeline_events enable row level security;
alter table public.shop_products   enable row level security;
alter table public.site_settings   enable row level security;
alter table public.media_assets    enable row level security;
alter table public.inscriptions    enable row level security;

-- 6.1 admins : chacun voit sa propre ligne (permet à l'admin de vérifier son statut)
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = auth.uid());

-- 6.2 Contenu vitrine : lecture publique du publié, écriture admin
do $$
declare t text;
begin
  foreach t in array array['categories','honours','timeline_events','shop_products']
  loop
    execute format('drop policy if exists %1$s_public_read on public.%1$s', t);
    execute format('create policy %1$s_public_read on public.%1$s
                    for select to anon, authenticated using (is_published = true)', t);

    execute format('drop policy if exists %1$s_admin_all on public.%1$s', t);
    execute format('create policy %1$s_admin_all on public.%1$s
                    for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 6.3 Réglages et médias : lecture publique intégrale, écriture admin
do $$
declare t text;
begin
  foreach t in array array['site_settings','media_assets']
  loop
    execute format('drop policy if exists %1$s_public_read on public.%1$s', t);
    execute format('create policy %1$s_public_read on public.%1$s
                    for select to anon, authenticated using (true)', t);

    execute format('drop policy if exists %1$s_admin_all on public.%1$s', t);
    execute format('create policy %1$s_admin_all on public.%1$s
                    for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 6.4 Inscriptions : dépôt public, consultation admin seule
drop policy if exists inscriptions_public_insert on public.inscriptions;
create policy inscriptions_public_insert on public.inscriptions
  for insert to anon, authenticated with check (consent = true);

drop policy if exists inscriptions_admin_read on public.inscriptions;
create policy inscriptions_admin_read on public.inscriptions
  for select to authenticated using (public.is_admin());

drop policy if exists inscriptions_admin_update on public.inscriptions;
create policy inscriptions_admin_update on public.inscriptions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists inscriptions_admin_delete on public.inscriptions;
create policy inscriptions_admin_delete on public.inscriptions
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Stockage des médias
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('medias', 'medias', true, 10485760)     -- 10 Mo par fichier
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists medias_public_read on storage.objects;
create policy medias_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'medias');

drop policy if exists medias_admin_insert on storage.objects;
create policy medias_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'medias' and public.is_admin());

drop policy if exists medias_admin_update on storage.objects;
create policy medias_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'medias' and public.is_admin());

drop policy if exists medias_admin_delete on storage.objects;
create policy medias_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'medias' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. Contenus réels du club (jeu de départ)
-- ---------------------------------------------------------------------------
--    Le jeu de données initial (coordonnées, horaires, gymnases, 8 catégories,
--    création du club en 2013, 4 articles boutique placeholder) a été appliqué
--    sur le projet sous la migration « bcv93_seed_real_content ».
--    Historique complet : Supabase Studio > Database > Migrations.
--
--    Aucun chiffre inventé n'a été inséré : le palmarès est vide et la frise ne
--    contient que 2013, en attente des informations du bureau du club.
