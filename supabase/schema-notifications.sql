-- ============================================================================
-- Notification par email de chaque nouvelle pré-inscription
-- Basket Club Villepinte (TeamBCV93) — DamCompany
-- ----------------------------------------------------------------------------
-- Complément de schema.sql. Déjà appliqué sur le projet Supabase du club :
-- ce fichier sert de trace et de script de reconstruction.
--
-- Chaîne complète :
--   insertion dans `inscriptions`
--     → déclencheur `inscriptions_notify`
--     → appel HTTP asynchrone (pg_net) vers l'Edge Function `notify-inscription`
--     → envoi de l'email via Resend
--
-- L'appel est ASYNCHRONE et le déclencheur avale ses propres erreurs : un
-- problème d'email ne peut jamais faire échouer une pré-inscription. La demande
-- reste enregistrée et visible dans le back-office quoi qu'il arrive.
--
-- ⚠ Le secret partagé réel n'est PAS dans ce fichier (dépôt public) : il est
--   stocké dans le Vault Supabase et recopié dans les secrets de l'Edge
--   Function. Voir README, § 6.
-- ============================================================================

create extension if not exists pg_net;

-- 1. Destinataires ------------------------------------------------------------
-- Éditable depuis le back-office, onglet « Inscriptions ».
create table if not exists public.notification_recipients (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  full_name  text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.notification_recipients is
  'Adresses qui reçoivent un email à chaque nouvelle pré-inscription. Lecture et écriture réservées aux administrateurs (jamais exposé au public).';

alter table public.notification_recipients enable row level security;

drop policy if exists notification_recipients_admin_all on public.notification_recipients;
create policy notification_recipients_admin_all on public.notification_recipients
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.notification_recipients (email, full_name)
values ('bcvillepinte93@gmail.com', 'Basket Club Villepinte — secrétariat')
on conflict (email) do nothing;

-- 2. Traçabilité de l'envoi ---------------------------------------------------
alter table public.inscriptions
  add column if not exists notified_at timestamptz;

comment on column public.inscriptions.notified_at is
  'Horodatage de l''email de notification envoyé au club. NULL = email non parti (clé Resend absente ou envoi en échec).';

-- 3. Adresse et secret de l'Edge Function, gardés dans le Vault ---------------
-- Remplacer 'A-REMPLACER' par un secret aléatoire (openssl rand -base64 32),
-- puis recopier exactement la même valeur dans les secrets de l'Edge Function
-- sous le nom BCV_HOOK_SECRET.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bcv_hook_url') then
    perform vault.create_secret(
      'https://vtpgflcndrcjivdryynr.supabase.co/functions/v1/notify-inscription',
      'bcv_hook_url',
      'URL de l''Edge Function appelée à chaque nouvelle pré-inscription.');
  end if;
  if not exists (select 1 from vault.secrets where name = 'bcv_hook_secret') then
    perform vault.create_secret(
      'A-REMPLACER',
      'bcv_hook_secret',
      'Secret partagé entre le déclencheur SQL et l''Edge Function notify-inscription.');
  end if;
end
$$;

-- 4. Déclencheur --------------------------------------------------------------
create or replace function public.notify_new_inscription()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net, extensions
as $$
declare
  hook_url    text;
  hook_secret text;
begin
  select decrypted_secret into hook_url    from vault.decrypted_secrets where name = 'bcv_hook_url';
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'bcv_hook_secret';

  -- Rien de configuré : on ne bloque surtout pas l'inscription.
  if hook_url is null or hook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := hook_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-bcv-secret',  hook_secret),
    body    := jsonb_build_object('record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  -- Un problème d'email ne doit jamais faire échouer une pré-inscription.
  raise warning 'notify_new_inscription: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_new_inscription() from public, anon, authenticated;

drop trigger if exists inscriptions_notify on public.inscriptions;
create trigger inscriptions_notify
  after insert on public.inscriptions
  for each row execute function public.notify_new_inscription();

-- ----------------------------------------------------------------------------
-- Diagnostic : réponses des derniers appels sortants
--   select id, status_code, content, error_msg, created
--     from net._http_response order by created desc limit 10;
-- ----------------------------------------------------------------------------
