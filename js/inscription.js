/* ==========================================================================
   Page Inscription — formulaire de pré-inscription + QR code
   Basket Club Villepinte (TeamBCV93) — DamCompany
   --------------------------------------------------------------------------
   • Le sélecteur de catégories est alimenté par la table `categories`.
   • Le bloc « responsable légal » n'apparaît que si le joueur est mineur.
   • La soumission écrit dans la table `inscriptions` (insertion publique,
     lecture réservée à l'admin — voir supabase/schema.sql).
   • Le QR code est généré côté client (aucun service tiers) et pointe vers
     le formulaire de cette page, pour impression sur flyers et affiches.
   ========================================================================== */
(function () {
  'use strict';

  var API = window.BCV_API;
  var $ = function (s) { return document.querySelector(s); };

  var form     = $('#form-inscription');
  var select   = $('#categorie');
  var msg      = $('#message-formulaire');
  var submit   = $('#btn-envoyer');
  var blocResp = $('#bloc-responsable');
  var champNaissance = $('#naissance');

  /* ---------------------------------------------------------------- Utils */

  function setMsg(state, text) {
    if (!msg) return;
    msg.setAttribute('data-state', state);
    msg.textContent = text;
  }

  function markInvalid(el, invalid) {
    if (el) el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  /** Prix en euros, format français, à partir d'un montant en centimes. */
  function euros(cents) {
    return (cents / 100).toFixed(2).replace('.', ',').replace(',00', '') + ' \u20AC';
  }

  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Catégories chargées, indexées par code, pour l'affichage du tarif. */
  var CATS = {};

  /** Affiche le tarif de la catégorie sélectionnée sous le sélecteur. */
  function showTarif() {
    var note = $('#tarif-note');
    if (!note || !select) return;
    var c = CATS[select.value];
    if (!c) { note.setAttribute('data-visible', 'false'); note.innerHTML = ''; return; }
    note.setAttribute('data-visible', 'true');
    note.innerHTML = (c.price_cents != null)
      ? 'Tarif de la licence <strong>' + escHtml(c.name) + '</strong> : <strong>' +
        escHtml(euros(c.price_cents)) + '</strong> pour la saison.'
      : 'Le tarif de la catégorie <strong>' + escHtml(c.name) +
        '</strong> est communiqué par le secrétariat.';
  }

  /** Grille tarifaire complète affichée plus bas dans la page. */
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

  /** Âge révolu à la date du jour, à partir d'une date ISO (yyyy-mm-dd). */
  function age(iso) {
    if (!iso) return null;
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return null;
    var now = new Date();
    var a = now.getFullYear() - d.getFullYear();
    var m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a;
  }

  /* ------------------------------------------- Sélecteur de catégories --- */

  function fillCategories() {
    if (!select) return;
    API.categories().then(function (rows) {
      renderGrille(rows);
      rows.forEach(function (c) {
        CATS[c.code] = c;
        var opt = document.createElement('option');
        opt.value = c.code;
        var label = c.name;
        if (c.birth_years) label += ' — ' + c.birth_years;
        if (c.price_cents != null) label += ' — ' + euros(c.price_cents);
        opt.textContent = label;
        select.appendChild(opt);
      });
      // Pré-sélection depuis categories.html : inscription.html?categorie=U13M
      var wanted = new URLSearchParams(window.location.search).get('categorie');
      if (wanted && select.querySelector('option[value="' + CSS.escape(wanted) + '"]')) {
        select.value = wanted;
      }
      showTarif();
    }).catch(function () {
      /* Le formulaire reste utilisable : la catégorie devient facultative. */
      select.removeAttribute('required');
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Catégories momentanément indisponibles';
      select.appendChild(opt);
    });
  }

  /* ------------------------------------ Responsable légal si mineur ----- */

  function toggleGuardian() {
    if (!blocResp || !champNaissance) return;
    var a = age(champNaissance.value);
    var mineur = a !== null && a < 18;
    blocResp.hidden = !mineur;
    var nom = $('#responsable');
    if (nom) {
      if (mineur) nom.setAttribute('required', 'required');
      else { nom.removeAttribute('required'); markInvalid(nom, false); }
    }
  }

  /* ------------------------------------------------ Soumission ---------- */

  function validate(data) {
    var errors = [];
    function check(id, ok) {
      var el = $('#' + id);
      markInvalid(el, !ok);
      if (!ok) errors.push(el);
    }
    check('nom', !!data.last_name);
    check('prenom', !!data.first_name);
    check('naissance', !!data.birth_date);
    check('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email || ''));
    if (select && select.hasAttribute('required')) check('categorie', !!data.category_code);
    if (blocResp && !blocResp.hidden) check('responsable', !!data.guardian_name);
    return errors;
  }

  function handleSubmit(e) {
    e.preventDefault();

    var fd = new FormData(form);

    // Pot-de-miel : si ce champ est rempli, la soumission vient d'un robot.
    if ((fd.get('site_web') || '').trim() !== '') return;

    var consent = form.querySelector('#consentement').checked;
    var data = {
      last_name:      (fd.get('last_name')  || '').trim(),
      first_name:     (fd.get('first_name') || '').trim(),
      birth_date:     fd.get('birth_date') || null,
      category_code:  fd.get('category_code') || null,
      email:          (fd.get('email') || '').trim(),
      phone:          (fd.get('phone') || '').trim() || null,
      guardian_name:  (fd.get('guardian_name')  || '').trim() || null,
      guardian_phone: (fd.get('guardian_phone') || '').trim() || null,
      message:        (fd.get('message') || '').trim() || null,
      consent:        consent,
      source:         new URLSearchParams(window.location.search).has('qr') ? 'qr-code' : 'site'
    };

    var errors = validate(data);
    if (errors.length) {
      setMsg('error', 'Merci de corriger les champs signalés avant d\'envoyer.');
      errors[0].focus();
      return;
    }
    if (!consent) {
      setMsg('error', 'Merci de cocher la case de consentement pour envoyer votre demande.');
      form.querySelector('#consentement').focus();
      return;
    }

    submit.disabled = true;
    setMsg('pending', 'Envoi en cours…');

    API.settings().then(function (s) {
      data.season = s.inscription_season || null;
      return API.insert('inscriptions', data);
    }).then(function () {
      form.reset();
      if (blocResp) blocResp.hidden = true;
      showTarif();
      setMsg('success',
        'Demande envoyée. Le secrétariat du club vous recontacte pour convenir d\'un entraînement d\'essai ' +
        'et vous transmettre le dossier de licence.');
      msg.focus && msg.focus();
    }).catch(function (err) {
      console.error(err);
      setMsg('error',
        'L\'envoi a échoué. Merci de réessayer, ou de contacter directement le club par téléphone ou par email.');
    }).then(function () {
      submit.disabled = false;
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
      'role="img" aria-label="QR code vers le formulaire de pré-inscription du Basket Club Villepinte">' +
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
        a.download = 'qr-inscription-bcv93.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      });
    }
  }

  function qrTarget() {
    var base = (window.BCV_CONFIG && window.BCV_CONFIG.siteUrl) || '';
    if (base) return base.replace(/\/+$/, '') + '/inscription.html?qr=1#formulaire';
    // Repli : URL de la page courante (utile en pré-production)
    return window.location.origin + window.location.pathname + '?qr=1#formulaire';
  }

  /* ------------------------------------------------------ Démarrage ----- */

  fillCategories();
  if (select) select.addEventListener('change', showTarif);
  if (champNaissance) champNaissance.addEventListener('change', toggleGuardian);
  if (form) form.addEventListener('submit', handleSubmit);
  renderQR(qrTarget());
})();
