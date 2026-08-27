/* ==========================================================================
   Comportements communs + chargement du contenu dynamique
   Basket Club Villepinte (TeamBCV93) — DamCompany
   --------------------------------------------------------------------------
   Chaque page porte un attribut data-page sur <body>. Ce fichier :
     1. gère le header (menu mobile) et le pied de page,
     2. injecte les réglages du site (coordonnées, réseaux, chiffres clés),
     3. charge le contenu propre à la page depuis Supabase.
   Aucun contenu n'est inventé : si une table est vide, un état « à venir »
   explicite est affiché et le club le complète depuis le back-office.
   ========================================================================== */
(function () {
  'use strict';

  var API = window.BCV_API;
  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /** Échappe le texte avant insertion dans un gabarit HTML. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Remplace les retours à la ligne par des <br> (texte déjà échappé). */
  function nl2br(value) { return esc(value).replace(/\n/g, '<br>'); }

  /* ======================================================================
     1. HEADER — menu mobile
     ====================================================================== */
  function initHeader() {
    var burger = $('.burger');
    var nav = $('#nav-principal');
    if (!burger || !nav) return;

    function setOpen(open) {
      burger.setAttribute('aria-expanded', String(open));
      nav.setAttribute('data-open', String(open));
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    }

    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });

    // Fermeture au clic sur un lien puis à la touche Échap
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        burger.focus();
      }
    });
    // Le menu mobile ne doit pas rester ouvert en passant en desktop
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024) setOpen(false);
    });
  }

  /* ======================================================================
     2. RÉGLAGES DU SITE
     --------------------------------------------------------------------
     data-setting="cle"        -> injecte la valeur comme texte
     data-setting-multiline    -> conserve les retours à la ligne
     data-setting-href="cle"   -> injecte la valeur dans href
     data-setting-required     -> masque l'élément si la valeur est vide
     ====================================================================== */
  function applySettings(s) {
    $$('[data-setting]').forEach(function (el) {
      var val = s[el.getAttribute('data-setting')];
      if (!val) {
        if (el.hasAttribute('data-setting-required')) el.hidden = true;
        return;
      }
      if (el.hasAttribute('data-setting-multiline')) el.innerHTML = nl2br(val);
      else el.textContent = val;
    });

    $$('[data-setting-href]').forEach(function (el) {
      var key = el.getAttribute('data-setting-href');
      var val = s[key];
      var prefix = el.getAttribute('data-setting-prefix') || '';
      if (!val) {
        if (el.hasAttribute('data-setting-required')) el.hidden = true;
        return;
      }
      el.href = prefix + val;
      el.hidden = false;
    });

    // Chiffres clés du bandeau d'accueil
    $$('[data-stat]').forEach(function (el) {
      var i = el.getAttribute('data-stat');
      var value = s['stat' + i + '_value'];
      var label = s['stat' + i + '_label'];
      if (!value && !label) { el.hidden = true; return; }
      var v = $('.stat__value', el), l = $('.stat__label', el);
      if (v) v.textContent = value || '';
      if (l) l.textContent = label || '';
    });
  }

  /* ======================================================================
     3. GABARITS
     ====================================================================== */

  /** Bloc « contenu à venir » — jamais de fausse donnée à la place. */
  function emptyState(title, text, onNavy) {
    return '<div class="empty' + (onNavy ? ' empty--onnavy' : '') + '">' +
             '<p class="empty__title">' + esc(title) + '</p>' +
             '<p>' + esc(text) + '</p>' +
           '</div>';
  }

  /** Prix en euros, format français, à partir d'un montant en centimes. */
  function euros(cents) {
    return (cents / 100).toFixed(2).replace('.', ',').replace(',00', '') + ' \u20AC';
  }

  function categoryCard(c) {
    var media = c.photo_url
      ? '<img src="' + esc(c.photo_url) + '" alt="' + esc(c.photo_alt || ('Effectif ' + c.name)) + '" loading="lazy" decoding="async">'
      : '<span class="card__glyph" aria-hidden="true">' + esc(c.code) + '</span>';

    var meta = c.birth_years ? 'Nés en ' + c.birth_years : (c.age_range || '');

    return '<article class="card">' +
             '<div class="card__media">' + media + '</div>' +
             '<div class="card__body">' +
               '<h3 class="card__title">' + esc(c.name) + '</h3>' +
               (meta ? '<p class="card__meta">' + esc(meta) + '</p>' : '') +
               (c.description ? '<p class="card__text">' + esc(c.description) + '</p>' : '') +
               (c.training_days ? '<p class="card__text"><strong>Entraînements :</strong> ' + esc(c.training_days) + '</p>' : '') +
               (c.venue ? '<p class="card__text"><strong>Gymnase :</strong> ' + esc(c.venue) + '</p>' : '') +
               (c.price_cents != null ? '<p class="card__text"><strong>Licence :</strong> ' + esc(euros(c.price_cents)) + '</p>' : '') +
               '<div class="card__foot">' +
                 '<a class="pill" href="inscription.html?categorie=' + encodeURIComponent(c.code) + '">Rejoindre cette équipe</a>' +
               '</div>' +
             '</div>' +
           '</article>';
  }

  /* ------------------------------------------------------------------
     Planning des entraînements — une grille hebdomadaire par gymnase.
     Source : table training_slots, alimentée depuis le back-office.
     ------------------------------------------------------------------ */
  var JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  function planningTable(venue, slots) {
    // Regroupe les créneaux par équipe, en conservant l'ordre du planning
    var teams = [];
    var index = {};
    slots.forEach(function (s) {
      if (!index[s.team_label]) {
        index[s.team_label] = { label: s.team_label, days: {} };
        teams.push(index[s.team_label]);
      }
      (index[s.team_label].days[s.weekday] = index[s.team_label].days[s.weekday] || []).push(s);
    });

    var head = '<tr><th scope="col">Équipe</th>' +
      JOURS.map(function (j) { return '<th scope="col">' + j + '</th>'; }).join('') + '</tr>';

    var body = teams.map(function (t) {
      var cells = JOURS.map(function (jour, i) {
        var list = t.days[i + 1];
        if (!list) {
          return '<td class="is-empty" data-day="' + jour + '">—</td>';
        }
        return '<td data-day="' + jour + '">' + list.map(function (s) {
          return '<span class="slot">' + esc(s.time_label) +
                 (s.coach ? '<span class="slot__coach">' + esc(s.coach) + '</span>' : '') +
                 '</span>';
        }).join('') + '</td>';
      }).join('');
      return '<tr><th scope="row">' + esc(t.label) + '</th>' + cells + '</tr>';
    }).join('');

    return '<div class="venue-block">' +
             '<div class="venue-block__head">' +
               '<h3 class="venue-block__name">' + esc(venue) + '</h3>' +
             '</div>' +
             '<div class="planning-wrap">' +
               '<table class="planning"><caption class="sr-only">Créneaux d\'entraînement — ' +
                 esc(venue) + '</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
             '</div>' +
           '</div>';
  }

  /**
   * @param {Element} target  conteneur de la grille
   * @param {Object}  s       réglages du site, pour ordonner les gymnases
   *                          (venue1_name en premier, puis venue2_name)
   */
  function loadPlanning(target, s) {
    if (!target) return;
    API.trainingSlots().then(function (rows) {
      if (!rows.length) {
        target.innerHTML = emptyState('Planning à venir',
          'Les créneaux d\'entraînement seront publiés ici dès leur validation par le club.');
        return;
      }
      var venues = [];
      var byVenue = {};
      rows.forEach(function (r) {
        if (!byVenue[r.venue]) { byVenue[r.venue] = []; venues.push(r.venue); }
        byVenue[r.venue].push(r);
      });

      var ordre = [(s && s.venue1_name) || '', (s && s.venue2_name) || ''];
      venues.sort(function (a, b) {
        var ia = ordre.indexOf(a), ib = ordre.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });

      target.innerHTML = venues.map(function (v) { return planningTable(v, byVenue[v]); }).join('');
    }).catch(function () {
      target.innerHTML = emptyState('Planning momentanément indisponible',
        'Merci de réessayer dans quelques instants.');
    });
  }

  /* Visuels vectoriels de la boutique, aux couleurs du club.
     Ils disparaissent dès qu'une vraie photo est ajoutée (image_url). */
  var PRODUCT_ART = {
    'maillot-domicile':
      '<svg viewBox="0 0 120 120" role="img" aria-label="Illustration d\'un maillot domicile"><path d="M42 18 60 27l18-9 22 12-9 20-11-4v52H40V46l-11 4-9-20z" fill="#1b356f" stroke="#f5c518" stroke-width="3" stroke-linejoin="round"/></svg>',
    'maillot-exterieur':
      '<svg viewBox="0 0 120 120" role="img" aria-label="Illustration d\'un maillot extérieur"><path d="M42 18 60 27l18-9 22 12-9 20-11-4v52H40V46l-11 4-9-20z" fill="#c8281f" stroke="#f5c518" stroke-width="3" stroke-linejoin="round"/></svg>',
    'sac':
      '<svg viewBox="0 0 120 120" role="img" aria-label="Illustration d\'un sac de sport"><rect x="50" y="20" width="20" height="12" rx="3" fill="#0e2050" stroke="#f5c518" stroke-width="3"/><rect x="26" y="32" width="68" height="62" rx="8" fill="#0e2050" stroke="#f5c518" stroke-width="3"/></svg>',
    'ballon':
      '<svg viewBox="0 0 120 120" role="img" aria-label="Illustration d\'un ballon de basket"><circle cx="60" cy="60" r="34" fill="#f5c518" stroke="#0e2050" stroke-width="3"/><path d="M60 26v68M26 60h68" stroke="#0e2050" stroke-width="3"/></svg>'
  };

  function productCard(p) {
    var art = p.image_url
      ? '<img src="' + esc(p.image_url) + '" alt="' + esc(p.image_alt || p.name) + '" loading="lazy" decoding="async">'
      : (PRODUCT_ART[p.placeholder_key] || PRODUCT_ART.ballon);

    var price = (p.price_cents == null)
      ? '<span class="product__price">Tarif à venir</span>'
      : '<span class="product__price">' + (p.price_cents / 100).toFixed(2).replace('.', ',') + ' €</span>';

    var badge = p.available
      ? '<span class="badge badge--gold">Disponible</span>'
      : (p.is_placeholder
          ? '<span class="badge">Tarif indicatif</span>'
          : '<span class="badge">Bientôt</span>');

    var action = (p.available && p.checkout_url)
      ? '<a class="pill" href="' + esc(p.checkout_url) + '" rel="noopener">Commander</a>'
      : '';

    return '<article class="product">' +
             '<div class="product__media">' + art + '</div>' +
             '<div class="product__body">' +
               '<h3 class="product__name">' + esc(p.name) + '</h3>' +
               (p.description ? '<p class="product__desc">' + esc(p.description) + '</p>' : '') +
               '<div class="product__foot">' + price + badge + '</div>' +
               (action ? '<div class="card__foot">' + action + '</div>' : '') +
             '</div>' +
           '</article>';
  }

  /* ======================================================================
     4. CHARGEURS PAR PAGE
     ====================================================================== */

  function loadCategories(target, limit) {
    if (!target) return;
    API.categories().then(function (rows) {
      if (limit) rows = rows.slice(0, limit);
      target.innerHTML = rows.length
        ? rows.map(categoryCard).join('')
        : emptyState('Effectifs en cours de constitution',
            'Les équipes de la saison seront publiées ici dès leur validation par le club.');
    }).catch(function () {
      target.innerHTML = emptyState('Contenu momentanément indisponible',
        'Merci de réessayer dans quelques instants.');
    });
  }

  function loadTimeline(target) {
    if (!target) return;
    API.timeline().then(function (rows) {
      if (!rows.length) {
        target.innerHTML = emptyState('Frise en cours d\'écriture',
          'Les grandes dates du club seront ajoutées ici par le bureau.', true);
        return;
      }
      target.innerHTML = rows.map(function (e) {
        return '<li class="tl-item">' +
                 '<div class="tl-card">' +
                   '<p class="tl-year">' + esc(e.year) + '</p>' +
                   (e.title ? '<h3 class="tl-title">' + esc(e.title) + '</h3>' : '') +
                   (e.description ? '<p>' + esc(e.description) + '</p>' : '') +
                 '</div>' +
               '</li>';
      }).join('');
      target.classList.add('timeline');
    }).catch(function () {
      target.innerHTML = emptyState('Contenu momentanément indisponible',
        'Merci de réessayer dans quelques instants.', true);
    });
  }

  function loadHonours(listTarget, statsTarget) {
    if (!listTarget) return;
    API.honours().then(function (rows) {
      // La grille deux colonnes ne s'applique qu'en présence de titres :
      // l'état vide occupe toute la largeur.
      listTarget.classList.toggle('honours', rows.length > 0);

      if (!rows.length) {
        listTarget.innerHTML = emptyState('Palmarès à compléter',
          'Les titres et distinctions du club seront publiés ici dès que le bureau les aura transmis.', true);
        if (statsTarget) statsTarget.hidden = true;
        return;
      }
      listTarget.innerHTML = rows.map(function (h) {
        var label = h.category ? h.title + ' — ' + h.category : h.title;
        return '<li class="honour">' +
                 '<span class="honour__title">' + esc(label) + '</span>' +
                 '<span class="honour__season">' + esc(h.season) + '</span>' +
               '</li>';
      }).join('');

      // Le seul chiffre affiché est celui réellement compté en base.
      if (statsTarget) {
        var seasons = rows.map(function (h) { return h.season; });
        var uniqueSeasons = seasons.filter(function (v, i) { return seasons.indexOf(v) === i; });
        var lastSeason = uniqueSeasons.slice().sort().pop() || '—';
        statsTarget.hidden = false;
        statsTarget.innerHTML =
          '<div class="trophy-stat"><span class="trophy-stat__value">' + rows.length +
            '</span><span class="trophy-stat__label">Titres et distinctions</span></div>' +
          '<div class="trophy-stat"><span class="trophy-stat__value">' + uniqueSeasons.length +
            '</span><span class="trophy-stat__label">Saisons récompensées</span></div>' +
          '<div class="trophy-stat"><span class="trophy-stat__value">' + esc(lastSeason) +
            '</span><span class="trophy-stat__label">Dernier titre</span></div>';
      }
    }).catch(function () {
      listTarget.innerHTML = emptyState('Contenu momentanément indisponible',
        'Merci de réessayer dans quelques instants.', true);
    });
  }

  function loadProducts(target) {
    if (!target) return;
    API.products().then(function (rows) {
      if (!rows.length) {
        target.innerHTML = emptyState('Boutique en préparation',
          'Les articles du club seront mis en ligne prochainement.');
        return;
      }
      // Regroupement par famille d'articles, dans l'ordre défini en base
      var groups = [];
      var byGroup = {};
      rows.forEach(function (p) {
        var g = p.group_name || 'Articles du club';
        if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
        byGroup[g].push(p);
      });
      target.innerHTML = groups.map(function (g) {
        return '<section class="shop-group">' +
                 '<h2 class="shop-group__title">' + esc(g) + '</h2>' +
                 '<div class="shop-group__rule" aria-hidden="true"></div>' +
                 '<div class="grid grid--4">' + byGroup[g].map(productCard).join('') + '</div>' +
               '</section>';
      }).join('');
      target.classList.remove('grid', 'grid--4');
    }).catch(function () {
      target.innerHTML = emptyState('Contenu momentanément indisponible',
        'Merci de réessayer dans quelques instants.');
    });
  }

  /** Page contact : bascule entre les deux gymnases sur une carte Google Maps. */
  function initVenues(s) {
    var tabs = $$('.venue-tab');
    var frame = $('#carte-gymnase');
    var addr = $('#adresse-gymnase');
    if (!tabs.length || !frame) return;

    function show(index) {
      var name = s['venue' + index + '_name'] || '';
      var address = s['venue' + index + '_address'] || '';
      var query = (name + ' ' + address).trim();

      tabs.forEach(function (t) {
        t.setAttribute('aria-selected', String(t.getAttribute('data-venue') === String(index)));
      });

      if (addr) {
        addr.innerHTML = '<strong>' + esc(name) + '</strong><br>' + esc(address);
      }
      frame.innerHTML = query
        ? '<iframe title="Carte — ' + esc(name) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" ' +
          'src="https://maps.google.com/maps?q=' + encodeURIComponent(query) + '&z=15&output=embed"></iframe>'
        : '';
    }

    tabs.forEach(function (t) {
      var i = t.getAttribute('data-venue');
      var name = s['venue' + i + '_name'];
      if (name) t.textContent = name;
      t.addEventListener('click', function () { show(i); });
    });

    show('1');
  }

  /* ======================================================================
     5. DÉMARRAGE
     ====================================================================== */
  function init() {
    initHeader();

    var yearEl = $('#annee-courante');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    var page = document.body.getAttribute('data-page');

    API.settings().then(function (s) {
      applySettings(s);
      if (page === 'contact') initVenues(s);
      if (page === 'categories') loadPlanning($('#planning-entrainements'), s);
    });

    switch (page) {
      case 'accueil':
        loadCategories($('#apercu-categories'), 4);
        break;
      case 'categories':
        loadCategories($('#liste-categories'));
        break;
      case 'histoire':
        loadTimeline($('#frise'));
        break;
      case 'palmares':
        loadHonours($('#liste-palmares'), $('#stats-palmares'));
        break;
      case 'boutique':
        loadProducts($('#liste-produits'));
        break;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
