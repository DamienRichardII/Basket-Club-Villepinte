/* ==========================================================================
   Couche d'accès aux données — API REST Supabase (PostgREST)
   --------------------------------------------------------------------------
   Le site public n'embarque volontairement AUCUNE librairie : quelques appels
   fetch suffisent pour lire le contenu et déposer une inscription.
   Le back-office (admin.html), lui, charge supabase-js pour l'authentification
   et l'envoi de fichiers dans le Storage.
   ========================================================================== */
(function (global) {
  'use strict';

  var cfg = global.BCV_CONFIG || {};
  var REST = cfg.supabaseUrl + '/rest/v1/';
  var HEADERS = {
    apikey: cfg.supabaseKey,
    Authorization: 'Bearer ' + cfg.supabaseKey
  };

  /**
   * Lecture d'une table.
   * @param {string} table  nom de la table
   * @param {string} query  paramètres PostgREST (select, order, filtres…)
   * @returns {Promise<Array>}
   */
  function select(table, query) {
    var url = REST + table + (query ? '?' + query : '');
    return fetch(url, { headers: HEADERS }).then(function (res) {
      if (!res.ok) throw new Error('Lecture ' + table + ' : HTTP ' + res.status);
      return res.json();
    });
  }

  /**
   * Insertion d'une ligne (utilisée par le formulaire d'inscription).
   * @param {string} table
   * @param {Object} row
   */
  function insert(table, row) {
    return fetch(REST + table, {
      method: 'POST',
      headers: Object.assign({}, HEADERS, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify(row)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('Insertion ' + table + ' : HTTP ' + res.status + ' ' + t);
        });
      }
      return true;
    });
  }

  /* --- Réglages du site : chargés une seule fois puis mis en cache ---------- */
  var settingsPromise = null;

  function settings() {
    if (!settingsPromise) {
      settingsPromise = select('site_settings', 'select=key,value')
        .then(function (rows) {
          var map = {};
          rows.forEach(function (r) { map[r.key] = r.value || ''; });
          return map;
        })
        .catch(function (err) {
          console.warn('[BCV] Réglages indisponibles :', err.message);
          return {};                       // le site reste utilisable hors ligne
        });
    }
    return settingsPromise;
  }

  global.BCV_API = {
    select: select,
    insert: insert,
    settings: settings,
    categories: function () {
      return select('categories', 'select=*&is_published=eq.true&order=sort_order.asc');
    },
    honours: function () {
      return select('honours', 'select=*&is_published=eq.true&order=sort_order.asc,season.desc');
    },
    timeline: function () {
      return select('timeline_events', 'select=*&is_published=eq.true&order=year.asc,sort_order.asc');
    },
    products: function () {
      return select('shop_products', 'select=*&is_published=eq.true&order=sort_order.asc');
    },
    media: function (page) {
      return select('media_assets', 'select=*&page=eq.' + encodeURIComponent(page) + '&order=sort_order.asc');
    }
  };
})(window);
