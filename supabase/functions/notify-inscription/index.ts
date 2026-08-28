/* ============================================================================
   notify-inscription — envoi par email de chaque nouvelle pré-inscription
   Basket Club Villepinte (TeamBCV93) — DamCompany
   ----------------------------------------------------------------------------
   Appelée automatiquement par le déclencheur SQL `inscriptions_notify`
   (voir supabase/schema-notifications.sql) à chaque insertion dans la table
   `inscriptions`. Elle envoie :

     1. un email récapitulatif à toutes les adresses actives de la table
        `notification_recipients` (le club, le chef de projet…) ;
     2. optionnellement, un accusé de réception à la famille — désactivé par
        défaut, car il demande un domaine d'expédition vérifié.

   L'appel est asynchrone : si l'envoi échoue, la demande reste enregistrée en
   base et visible dans le back-office. Aucune inscription ne peut être perdue.

   ----------------------------------------------------------------------------
   VARIABLES À RENSEIGNER
   Supabase Studio → Edge Functions → Secrets (aucune ligne de commande) :

     RESEND_API_KEY      obligatoire — clé API Resend (https://resend.com)
     BCV_HOOK_SECRET     obligatoire — doit valoir exactement le secret
                         `bcv_hook_secret` enregistré dans le Vault
     MAIL_FROM           facultatif  — expéditeur.
                         Défaut : « BCV93 <onboarding@resend.dev> », qui
                         fonctionne sans domaine mais n'écrit qu'à l'adresse
                         du titulaire du compte Resend.
                         Le jour où basketclubvillepinte.com est vérifié chez
                         Resend : « BCV93 <inscriptions@basketclubvillepinte.com> »
     MAIL_CONFIRM_FAMILY facultatif  — « true » pour envoyer aussi l'accusé de
                         réception à la famille (exige un domaine vérifié)
   ========================================================================== */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const HOOK_SECRET  = Deno.env.get('BCV_HOOK_SECRET') ?? '';
const MAIL_FROM    = Deno.env.get('MAIL_FROM') ?? 'BCV93 <onboarding@resend.dev>';
const CONFIRM_FAMILY = (Deno.env.get('MAIL_CONFIRM_FAMILY') ?? '').toLowerCase() === 'true';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/* ------------------------------------------------------------------ Utils */

/** Échappe le HTML : les champs viennent d'un formulaire public. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Date française lisible à partir d'un ISO yyyy-mm-dd. */
function dateFr(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** Âge révolu, pour repérer les mineurs d'un coup d'œil. */
function age(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}

/* ------------------------------------------------------------ Envoi Resend */

async function sendMail(opts: {
  to: string[]; subject: string; html: string; text: string; replyTo?: string;
}): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {})
    })
  });
  const detail = await res.text();
  return { ok: res.ok, detail };
}

/* ---------------------------------------------------------- Corps du mail */

function recapHtml(r: Record<string, unknown>, categorie: string): string {
  const a = age(r.birth_date as string | null);
  const mineur = a !== null && a < 18;

  const ligne = (label: string, value: string) =>
    `<tr>
       <th align="left" style="padding:7px 14px 7px 0;font:600 13px/1.5 Arial,sans-serif;color:#5b6478;white-space:nowrap;vertical-align:top">${esc(label)}</th>
       <td style="padding:7px 0;font:400 15px/1.5 Arial,sans-serif;color:#0e2050">${value}</td>
     </tr>`;

  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f4f1ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e3ddd0">
    <tr><td style="background:#0e2050;padding:22px 28px">
      <p style="margin:0;font:700 12px/1 Arial,sans-serif;letter-spacing:.16em;color:#c9a227;text-transform:uppercase">Basket Club Villepinte</p>
      <p style="margin:8px 0 0;font:700 22px/1.25 Arial,sans-serif;color:#fff">Nouvelle demande de pré-inscription</p>
    </td></tr>
    <tr><td style="padding:26px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${ligne('Nom', `<strong>${esc(r.last_name)} ${esc(r.first_name)}</strong>`)}
        ${ligne('Naissance', `${dateFr(r.birth_date as string | null)}${a !== null ? ` — ${a} ans${mineur ? ' <strong style="color:#c1121f">(mineur : accord parental requis)</strong>' : ''}` : ''}`)}
        ${ligne('Catégorie', esc(categorie))}
        ${ligne('Email', `<a href="mailto:${esc(r.email)}" style="color:#0e2050">${esc(r.email)}</a>`)}
        ${ligne('Téléphone', r.phone ? `<a href="tel:${esc(r.phone)}" style="color:#0e2050">${esc(r.phone)}</a>` : '—')}
        ${mineur || r.guardian_name
            ? ligne('Responsable légal', `${esc(r.guardian_name) || '—'}${r.guardian_phone ? ` — ${esc(r.guardian_phone)}` : ''}`)
            : ''}
        ${r.message ? ligne('Message', esc(r.message).replace(/\n/g, '<br>')) : ''}
        ${ligne('Saison', esc(r.season) || '—')}
        ${ligne('Origine', r.source === 'qr-code' ? 'QR code (flyer ou affiche)' : 'Formulaire du site')}
      </table>

      <p style="margin:26px 0 0;font:400 14px/1.6 Arial,sans-serif;color:#5b6478">
        Répondez directement à cet email pour écrire à la famille.
      </p>
      <p style="margin:18px 0 0">
        <a href="https://basket-club-villepinte.vercel.app/admin"
           style="display:inline-block;background:#c9a227;color:#0e2050;font:700 14px/1 Arial,sans-serif;padding:14px 22px;border-radius:8px;text-decoration:none">
          Ouvrir le back-office
        </a>
      </p>
    </td></tr>
    <tr><td style="background:#f4f1ea;padding:16px 28px;font:400 12px/1.5 Arial,sans-serif;color:#5b6478">
      Message automatique du site du Basket Club Villepinte. La demande est également
      enregistrée dans l'onglet « Inscriptions » du back-office.
    </td></tr>
  </table>
</body></html>`;
}

function recapText(r: Record<string, unknown>, categorie: string): string {
  const a = age(r.birth_date as string | null);
  return [
    'NOUVELLE DEMANDE DE PRÉ-INSCRIPTION — Basket Club Villepinte',
    '',
    `Nom             : ${r.last_name} ${r.first_name}`,
    `Naissance       : ${dateFr(r.birth_date as string | null)}${a !== null ? ` (${a} ans${a < 18 ? ' — mineur' : ''})` : ''}`,
    `Catégorie       : ${categorie}`,
    `Email           : ${r.email}`,
    `Téléphone       : ${r.phone ?? '—'}`,
    `Responsable     : ${r.guardian_name ?? '—'}${r.guardian_phone ? ` — ${r.guardian_phone}` : ''}`,
    `Message         : ${r.message ?? '—'}`,
    `Saison          : ${r.season ?? '—'}`,
    `Origine         : ${r.source === 'qr-code' ? 'QR code (flyer)' : 'Formulaire du site'}`,
    '',
    'Back-office : https://basket-club-villepinte.vercel.app/admin'
  ].join('\n');
}

function familleHtml(r: Record<string, unknown>): string {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f4f1ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e3ddd0">
    <tr><td style="background:#0e2050;padding:22px 28px">
      <p style="margin:0;font:700 12px/1 Arial,sans-serif;letter-spacing:.16em;color:#c9a227;text-transform:uppercase">Basket Club Villepinte</p>
      <p style="margin:8px 0 0;font:700 22px/1.25 Arial,sans-serif;color:#fff">Demande bien reçue</p>
    </td></tr>
    <tr><td style="padding:26px 28px;font:400 15px/1.65 Arial,sans-serif;color:#0e2050">
      <p style="margin:0 0 14px">Bonjour,</p>
      <p style="margin:0 0 14px">
        Nous avons bien reçu la demande de pré-inscription de
        <strong>${esc(r.first_name)} ${esc(r.last_name)}</strong>.
        Le secrétariat du club vous recontacte pour convenir d'un entraînement
        d'essai et vous transmettre le dossier de licence.
      </p>
      <p style="margin:0;color:#5b6478;font-size:14px">
        Cette demande ne vaut pas inscription définitive : la licence n'est
        acquise qu'après remise du dossier complet et règlement.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/* -------------------------------------------------------------- Handler --- */

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Le point d'entrée est public : seul le déclencheur SQL connaît le secret.
  if (!HOOK_SECRET) return json({ error: 'hook_secret_not_configured' }, 503);
  if (req.headers.get('x-bcv-secret') !== HOOK_SECRET) return json({ error: 'forbidden' }, 403);

  let record: Record<string, unknown>;
  try {
    const body = await req.json();
    record = body.record ?? body;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!record || !record.id) return json({ error: 'missing_record' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Libellé lisible de la catégorie (le formulaire n'envoie que le code).
  let categorie = String(record.category_code ?? '—');
  if (record.category_code) {
    const { data } = await sb.from('categories')
      .select('name, birth_years').eq('code', record.category_code).maybeSingle();
    if (data?.name) categorie = data.birth_years ? `${data.name} (${data.birth_years})` : data.name;
  }

  const { data: dests } = await sb.from('notification_recipients')
    .select('email').eq('is_active', true);
  const to = (dests ?? []).map((d: { email: string }) => d.email).filter(Boolean);

  if (!RESEND_KEY) {
    console.warn('RESEND_API_KEY absente : aucune notification envoyée.');
    return json({ skipped: 'no_api_key', would_notify: to.length });
  }
  if (!to.length) {
    console.warn('Aucun destinataire actif dans notification_recipients.');
    return json({ skipped: 'no_recipient' });
  }

  const sujet = `Pré-inscription — ${record.last_name} ${record.first_name} (${categorie})`;
  const club = await sendMail({
    to,
    subject: sujet,
    html: recapHtml(record, categorie),
    text: recapText(record, categorie),
    replyTo: String(record.email ?? '') || undefined
  });

  if (club.ok) {
    await sb.from('inscriptions')
      .update({ notified_at: new Date().toISOString() }).eq('id', record.id);
  } else {
    console.error('Resend a refusé la notification club :', club.detail);
  }

  // Accusé de réception à la famille — désactivé tant qu'il n'y a pas de
  // domaine d'expédition vérifié (Resend refuse les autres destinataires).
  let famille: { ok: boolean; detail: string } | null = null;
  if (CONFIRM_FAMILY && record.email) {
    famille = await sendMail({
      to: [String(record.email)],
      subject: 'Votre demande de pré-inscription — Basket Club Villepinte',
      html: familleHtml(record),
      text: `Bonjour,\n\nNous avons bien reçu la demande de pré-inscription de ${record.first_name} ${record.last_name}. Le secrétariat du club vous recontacte pour convenir d'un entraînement d'essai et vous transmettre le dossier de licence.\n\nBasket Club Villepinte`
    });
    if (!famille.ok) console.error('Resend a refusé l\'accusé famille :', famille.detail);
  }

  return json({ notified: club.ok, recipients: to.length, family: famille?.ok ?? null },
               club.ok ? 200 : 502);
});
