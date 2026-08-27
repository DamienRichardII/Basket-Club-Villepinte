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

  // Adresse encodée dans le QR code de la page inscription.
  // C'est cette adresse qui sera imprimée sur les flyers et les affiches.
  //
  // Laisser vide pour utiliser automatiquement l'adresse de la page consultée.
  // À mettre à jour le jour où basketclubvillepinte.com sera branché sur Vercel.
  qrUrl: 'https://basket-club-villepinte.vercel.app/inscription'
};
