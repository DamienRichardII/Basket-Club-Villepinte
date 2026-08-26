/**
 * Edge Function — email de confirmation d'inscription
 * Basket Club Villepinte (TeamBCV93) — DamCompany
 * ---------------------------------------------------------------------------
 * ⚠️ FONCTION PRÊTE MAIS NON DÉPLOYÉE.
 *
 * Pour l'activer (environ 5 minutes) :
 *   1. Créer un compte Resend et valider un domaine expéditeur
 *      (ex. inscriptions@basketclubvillepinte.com).
 *   2. supabase secrets set RESEND_API_KEY=re_xxx \
 *                           MAIL_FROM="BCV93 <inscriptions@basketclubvillepinte.com>" \
 *                           MAIL_BCC="bcvillepinte93@gmail.com"
 *   3. supabase functions deploy send-inscription-email --project-ref vtpgflcndrcjivdryynr
 *   4. Dans js/inscription.js, après l'insertion réussie, appeler :
 *        fetch(BCV_CONFIG.supabaseUrl + '/functions/v1/send-inscription-email', {
 *          method: 'POST',
 *          headers: { 'Content-Type': 'application/json', apikey: BCV_CONFIG.supabaseKey },
 *          body: JSON.stringify(data)
 *        });
 *
 * Tant que la fonction n'est pas déployée, le site fonctionne normalement :
 * la confirmation est affichée à l'écran et la demande apparaît dans le
 * back-office avec le badge « nouveau ».
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405, headers: CORS });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!apiKey || !from) {
    return new Response(
      JSON.stringify({ error: "Envoi d'email non configuré (RESEND_API_KEY / MAIL_FROM manquants)." }),
      { status: 501, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide." }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const email = String(body.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return new Response(JSON.stringify({ error: "Adresse email invalide." }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const prenom = escapeHtml(body.first_name);
  const nom = escapeHtml(body.last_name);
  const categorie = escapeHtml(body.category_code ?? "non précisée");
  const saison = escapeHtml(body.season ?? "");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f1e4;padding:28px">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden">
        <div style="background:#0e2050;border-bottom:3px solid #f5c518;padding:22px 26px;color:#fff">
          <p style="margin:0;font-size:13px;letter-spacing:.2em;color:#f5c518">TEAMBCV93</p>
          <h1 style="margin:6px 0 0;font-size:20px">Basket Club Villepinte</h1>
        </div>
        <div style="padding:26px;color:#16203a;line-height:1.6;font-size:15px">
          <p>Bonjour,</p>
          <p>Nous avons bien reçu la demande de pré-inscription de
             <strong>${prenom} ${nom}</strong>${categorie ? ` en catégorie <strong>${categorie}</strong>` : ""}
             ${saison ? `pour la saison <strong>${saison}</strong>` : ""}.</p>
          <p>Le secrétariat du club vous recontacte prochainement pour convenir d'un entraînement
             d'essai et vous transmettre le dossier de licence.</p>
          <p style="margin-top:22px">Sportivement,<br><strong>Le Basket Club Villepinte</strong></p>
          <hr style="border:0;border-top:1px solid #e3e7f0;margin:24px 0">
          <p style="font-size:13px;color:#5d6880;margin:0">
            Vous recevez cet email suite à une demande déposée sur basketclubvillepinte.com.
            Pour toute question : bcvillepinte93@gmail.com — 07 49 13 61 30.
          </p>
        </div>
      </div>
    </div>`;

  const payload: Record<string, unknown> = {
    from,
    to: [email],
    subject: "Votre pré-inscription au Basket Club Villepinte",
    html,
  };
  const bcc = Deno.env.get("MAIL_BCC");
  if (bcc) payload.bcc = [bcc];   // copie au secrétariat du club

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Resend error", res.status, detail);
    return new Response(JSON.stringify({ error: "Envoi impossible." }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ sent: true }),
    { headers: { ...CORS, "Content-Type": "application/json" } });
});
