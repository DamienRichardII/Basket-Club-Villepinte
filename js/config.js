/* ==========================================================================
   Configuration du site — Basket Club Villepinte (TeamBCV93)
   --------------------------------------------------------------------------
   Ces clés sont PUBLIQUES par conception : la clé « publishable » Supabase est
   destinée au navigateur. La sécurité repose sur les politiques RLS définies
   dans supabase/schema.sql, pas sur le secret de cette clé.
   Ne jamais placer ici la clé « service_role ».
   ========================================================================== */
window.BCV_CONFIG = {
  supabaseUrl: 'https://vtpgflcndrcjivdryynr.supabase.co',
  supabaseKey: 'sb_publishable_gIa16lV_YOyCIGHSPa8mtg_P5GRvmuv',

  // Utilisé pour générer le QR code de la page inscription.
  // Laisser vide pour utiliser automatiquement l'URL de la page courante.
  siteUrl: 'https://www.basketclubvillepinte.com'
};
