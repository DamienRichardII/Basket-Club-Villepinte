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
  //
  // Laissé VIDE : le QR pointe automatiquement vers l'adresse depuis laquelle la
  // page est consultée. Il fonctionne donc aujourd'hui sur le domaine Vercel, et
  // suivra tout seul la bascule vers basketclubvillepinte.com.
  //
  // À renseigner (ex. 'https://www.basketclubvillepinte.com') le jour où le domaine
  // définitif sera branché, pour figer l'adresse imprimée sur les flyers.
  siteUrl: ''
};
