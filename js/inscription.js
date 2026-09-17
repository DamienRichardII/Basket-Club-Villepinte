/* ==========================================================================
   Page Inscription — grille tarifaire + QR code vers HelloAsso
   Basket Club Villepinte (TeamBCV93) — DamCompany
   --------------------------------------------------------------------------
   • Les inscriptions se font exclusivement sur HelloAsso (plateforme
     externe) : cette page n'a plus de formulaire ni d'écriture en base,
     elle se contente d'orienter les familles vers HelloAsso (bouton + QR).
   • Le lien HelloAsso est lu depuis la table `site_settings` (clé
     `helloasso_url`), avec une valeur de secours si le réglage est vide.
   • Le QR code est généré côté client (aucun service tiers) et pointe vers
     ce lien, pour impression sur flyers et affiches.
   ========================================================================== */
(function () {
  'use strict';

  var API = window.BCV_API;
  var $ = function (s) { return document.querySelector(s); };

  /** Adresse HelloAsso de secours, si le réglage `helloasso_url` est vide. */
  var HELLOASSO_FALLBACK =
    'https://www.helloasso.com/beta/associations/basket-club-villepinte/adhesions/adhesion-basketball-2026-2027';

  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Prix en euros, format français, à partir d'un montant en centimes. */
  function euros(cents) {
    return (cents / 100).toFixed(2).replace('.', ',').replace(',00', '') + ' €';
  }

  /* ------------------------------------------------- Grille tarifaire --- */

  function renderGrille(rows) {
    var host = $('#grille-tarifs');
    if (!host) return;
    var avecTarif = rows.filter(function (c) { return c.price_cents != null; });
    if (!avecTarif.length) {
      host.innerHTML = '<div class="empty"><p class="empty__title">Tarifs à venir</p>' +
        '<p>La grille tarifaire sera publiée ici dès sa validation par le bureau.</p></div>';
      return;
    }
    host.innerHTML =
      '<table class="tarifs">' +
        '<caption class="sr-only">Tarifs des licences par catégorie</caption>' +
        '<thead><tr><th scope="col">Catégorie</th><th scope="col">Tarif</th></tr></thead>' +
        '<tbody>' + rows.map(function (c) {
          return '<tr><td>' +
                   '<span class="tarifs__cat">' + escHtml(c.name) + '</span>' +
                   (c.birth_years ? '<br><span class="tarifs__years">Nés en ' + escHtml(c.birth_years) + '</span>' : '') +
                 '</td><td><span class="tarifs__price">' +
                   (c.price_cents != null ? escHtml(euros(c.price_cents)) : 'Sur demande') +
                 '</span></td></tr>';
        }).join('') + '</tbody>' +
      '</table>';
  }

  function fillGrille() {
    if (!$('#grille-tarifs')) return;
    API.categories().then(renderGrille).catch(function () {
      /* La page reste utilisable sans la grille : rien à afficher. */
    });
  }

  /* ------------------------------------------------------ QR code ------- */

  /**
   * Rend le QR code en SVG, aux couleurs du club.
   * Le fond reste blanc et les modules navy : le contraste nécessaire à la
   * lecture est conservé, l'or n'est utilisé que pour le cadre autour.
   */
  function renderQR(url) {
    var host = $('#qr-code');
    if (!host || typeof qrcode !== 'function') return;

    var qr = qrcode(0, 'M');          // version auto, correction moyenne
    qr.addData(url);
    qr.make();

    var count = qr.getModuleCount();
    var quiet = 4;                     // marge silencieuse obligatoire
    var size = count + quiet * 2;

    var rects = '';
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          rects += '<rect x="' + (c + quiet) + '" y="' + (r + quiet) + '" width="1" height="1"/>';
        }
      }
    }

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" ' +
      'role="img" aria-label="QR code vers la page d\'adhésion HelloAsso du Basket Club Villepinte">' +
        '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
        '<g fill="#0e2050" shape-rendering="crispEdges">' + rects + '</g>' +
      '</svg>';

    host.innerHTML = svg;

    var urlEl = $('#qr-url');
    if (urlEl) urlEl.textContent = url;

    var btn = $('#btn-telecharger-qr');
    if (btn) {
      btn.addEventListener('click', function () {
        var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'qr-adhesion-bcv93-helloasso.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      });
    }
  }

  /* ------------------------------------------------------ Démarrage ----- */

  fillGrille();

  API.settings().then(function (s) {
    var url = (s.helloasso_url || '').trim() || HELLOASSO_FALLBACK;
    var btn = $('#btn-helloasso');
    if (btn) btn.href = url;
    renderQR(url);
  }).catch(function () {
    renderQR(HELLOASSO_FALLBACK);
  });
})();
