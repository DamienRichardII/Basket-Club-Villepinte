/* ==========================================================================
   Back-office — Basket Club Villepinte (TeamBCV93)
   --------------------------------------------------------------------------
   Authentification Supabase + gestion des médias, des contenus et des
   inscriptions. Les droits réels sont appliqués côté base par les politiques
   RLS : un compte qui n'est pas dans la table `admins` ne peut rien écrire,
   même s'il parvient à afficher cette page.
   ========================================================================== */
/* supabase-js est auto-hébergé (js/vendor/supabase.min.js) : aucune dépendance
   à un CDN tiers, le back-office reste fonctionnel quoi qu'il arrive. */
const cfg = window.BCV_CONFIG;
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const BUCKET = 'medias';

/* ======================================================================
   Messages
   ====================================================================== */
function say(el, state, text) {
  if (!el) return;
  if (!state) { el.removeAttribute('data-state'); el.textContent = ''; return; }
  el.setAttribute('data-state', state);
  el.textContent = text;
}
const msgGlobal = () => $('#msg-global');

function flash(state, text) {
  say(msgGlobal(), state, text);
  if (state === 'success') setTimeout(() => say(msgGlobal(), null), 4000);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ======================================================================
   1. AUTHENTIFICATION
   ====================================================================== */
async function isAdmin(userId) {
  const { data, error } = await sb.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (error) return false;
  return !!data;
}

async function showApp(session) {
  const ok = await isAdmin(session.user.id);
  if (!ok) {
    await sb.auth.signOut();
    say($('#msg-connexion'), 'error',
      "Ce compte n'a pas les droits d'administration. Contactez DamCompany pour l'activer.");
    return;
  }
  $('#ecran-connexion').hidden = true;
  $('#ecran-admin').hidden = false;
  $('#admin-email').textContent = session.user.email;
  loadEverything();
}

$('#form-connexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btn-connexion');
  btn.disabled = true;
  say($('#msg-connexion'), 'info', 'Connexion en cours…');

  const { data, error } = await sb.auth.signInWithPassword({
    email: $('#login-email').value.trim(),
    password: $('#login-mdp').value
  });

  btn.disabled = false;
  if (error) {
    say($('#msg-connexion'), 'error', 'Email ou mot de passe incorrect.');
    return;
  }
  say($('#msg-connexion'), null);
  showApp(data.session);
});

$('#btn-deconnexion').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.reload();
});

/* ======================================================================
   2. ONGLETS
   ====================================================================== */
$$('.a-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.a-tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    const name = tab.getAttribute('data-panel');
    $$('.a-panel').forEach((p) => p.setAttribute('data-active', String(p.getAttribute('data-panel') === name)));
  });
});

/* ======================================================================
   3. ÉDITEURS DE TABLES
   ====================================================================== */
const SCHEMAS = {
  categories: {
    label: 'catégorie',
    order: 'sort_order',
    fields: [
      { key: 'code',          label: 'Code',        type: 'text',     width: '78px' },
      { key: 'name',          label: 'Nom',         type: 'text' },
      { key: 'birth_years',   label: 'Nés en',      type: 'text',     width: '130px' },
      { key: 'price_cents',   label: 'Licence (€)', type: 'euros',    width: '96px' },
      { key: 'age_range',     label: 'Âge',         type: 'text',     width: '110px' },
      { key: 'description',   label: 'Description', type: 'textarea' },
      { key: 'training_days', label: 'Entraînements', type: 'text' },
      { key: 'venue',         label: 'Gymnase',     type: 'text' },
      { key: 'photo_url',     label: 'Photo (URL)', type: 'media' },
      { key: 'photo_alt',     label: 'Texte alt.',  type: 'text' },
      { key: 'sort_order',    label: 'Ordre',       type: 'number',   width: '76px' },
      { key: 'is_published',  label: 'En ligne',    type: 'check',    width: '76px' }
    ],
    blank: () => ({ code: '', name: '', birth_years: '', price_cents: null, sort_order: 99, is_published: true })
  },
  honours: {
    label: 'titre',
    order: 'sort_order',
    fields: [
      { key: 'title',        label: 'Intitulé', type: 'text' },
      { key: 'category',     label: 'Équipe',   type: 'text' },
      { key: 'season',       label: 'Saison',   type: 'text', width: '120px' },
      { key: 'sort_order',   label: 'Ordre',    type: 'number', width: '76px' },
      { key: 'is_published', label: 'En ligne', type: 'check', width: '76px' }
    ],
    blank: () => ({ title: '', category: '', season: '', sort_order: 99, is_published: true })
  },
  timeline_events: {
    label: 'date',
    order: 'year',
    fields: [
      { key: 'year',         label: 'Année',       type: 'number', width: '92px' },
      { key: 'title',        label: 'Titre',       type: 'text' },
      { key: 'description',  label: 'Description', type: 'textarea' },
      { key: 'sort_order',   label: 'Ordre',       type: 'number', width: '76px' },
      { key: 'is_published', label: 'En ligne',    type: 'check', width: '76px' }
    ],
    blank: () => ({ year: new Date().getFullYear(), title: '', description: '', sort_order: 99, is_published: true })
  },
  training_slots: {
    label: 'créneau',
    order: 'sort_order',
    fields: [
      { key: 'venue',         label: 'Gymnase',    type: 'text' },
      { key: 'team_label',    label: 'Équipe',     type: 'text' },
      { key: 'category_code', label: 'Code cat.',  type: 'text',   width: '96px' },
      { key: 'weekday',       label: 'Jour (1=lun … 6=sam)', type: 'number', width: '112px' },
      { key: 'time_label',    label: 'Horaire',    type: 'text',   width: '130px' },
      { key: 'coach',         label: 'Éducateur',  type: 'text',   width: '130px' },
      { key: 'sort_order',    label: 'Ordre',      type: 'number', width: '76px' },
      { key: 'is_published',  label: 'En ligne',   type: 'check',  width: '76px' }
    ],
    blank: () => ({ venue: '', team_label: '', weekday: 1, time_label: '',
                    sort_order: 99, is_published: true })
  },
  notification_recipients: {
    label: 'adresse',
    order: 'email',
    fields: [
      { key: 'email',     label: 'Adresse email', type: 'text' },
      { key: 'full_name', label: 'Personne',      type: 'text' },
      { key: 'is_active', label: 'Actif',         type: 'check', width: '76px' }
    ],
    blank: () => ({ email: '', full_name: '', is_active: true })
  },
  shop_products: {
    label: 'article',
    order: 'sort_order',
    fields: [
      { key: 'name',            label: 'Nom',            type: 'text' },
      { key: 'group_name',      label: 'Famille',        type: 'text',   width: '130px' },
      { key: 'description',     label: 'Description',    type: 'textarea' },
      { key: 'price_cents',     label: 'Prix (€)',       type: 'euros',  width: '96px' },
      { key: 'image_url',       label: 'Photo (URL)',    type: 'media' },
      { key: 'image_alt',       label: 'Texte alt.',     type: 'text' },
      { key: 'checkout_url',    label: 'Lien paiement',  type: 'text' },
      { key: 'is_placeholder',  label: 'Tarif indicatif', type: 'check', width: '86px' },
      { key: 'available',       label: 'En vente',       type: 'check', width: '76px' },
      { key: 'sort_order',      label: 'Ordre',          type: 'number', width: '76px' },
      { key: 'is_published',    label: 'En ligne',       type: 'check', width: '76px' }
    ],
    blank: () => ({ name: '', group_name: '', description: '', price_cents: null, is_placeholder: true,
                    available: false, sort_order: 99, is_published: true })
  }
};

/** Lignes chargées, par table. Une ligne sans `id` est une nouvelle entrée. */
const store = {};

function cellInput(table, rowIndex, field, value) {
  const name = `data-table="${table}" data-row="${rowIndex}" data-key="${field.key}"`;
  switch (field.type) {
    case 'check':
      return `<label class="a-check"><input type="checkbox" ${name} ${value ? 'checked' : ''}></label>`;
    case 'number':
      return `<input class="a-input" type="number" ${name} value="${value == null ? '' : value}">`;
    case 'euros':
      return `<input class="a-input" type="number" step="0.01" min="0" ${name}
                     value="${value == null ? '' : (value / 100).toFixed(2)}">`;
    case 'textarea':
      return `<textarea class="a-textarea" ${name} rows="2">${escapeHtml(value || '')}</textarea>`;
    case 'media':
      return `<input class="a-input" type="text" ${name} value="${escapeHtml(value || '')}"
                     placeholder="Coller l'URL depuis l'onglet Médias">`;
    default:
      return `<input class="a-input" type="text" ${name} value="${escapeHtml(value || '')}">`;
  }
}

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderTable(table) {
  const spec = SCHEMAS[table];
  const rows = store[table] || [];
  const el = $('#table-' + table);

  const head = '<thead><tr>' +
    spec.fields.map((f) => `<th${f.width ? ` style="width:${f.width}"` : ''}>${f.label}</th>`).join('') +
    '<th style="width:90px"></th></tr></thead>';

  const body = '<tbody>' + (rows.length ? rows.map((row, i) =>
    '<tr>' +
      spec.fields.map((f) => `<td>${cellInput(table, i, f, row[f.key])}</td>`).join('') +
      `<td><button class="a-btn a-btn--danger a-btn--sm" type="button"
            data-delete="${table}" data-row="${i}">Supprimer</button></td>` +
    '</tr>'
  ).join('') : `<tr><td colspan="${spec.fields.length + 1}" class="a-empty">Aucune ${spec.label} pour le moment.</td></tr>`) + '</tbody>';

  el.innerHTML = head + body;
}

/** Reprend les valeurs saisies dans le DOM avant enregistrement. */
function collect(table) {
  const spec = SCHEMAS[table];
  $$(`[data-table="${table}"]`).forEach((input) => {
    const i = Number(input.getAttribute('data-row'));
    const key = input.getAttribute('data-key');
    const field = spec.fields.find((f) => f.key === key);
    const row = store[table][i];
    if (!row || !field) return;

    if (field.type === 'check') row[key] = input.checked;
    else if (field.type === 'number') row[key] = input.value === '' ? null : Number(input.value);
    else if (field.type === 'euros') row[key] = input.value === '' ? null : Math.round(Number(input.value) * 100);
    else row[key] = input.value.trim() === '' ? null : input.value;
  });
}

async function loadTable(table) {
  const spec = SCHEMAS[table];
  const { data, error } = await sb.from(table).select('*').order(spec.order, { ascending: true });
  if (error) { flash('error', `Chargement impossible (${table}) : ${error.message}`); return; }
  store[table] = data || [];
  renderTable(table);
}

async function saveTable(table) {
  collect(table);
  const rows = store[table];
  const inserts = rows.filter((r) => !r.id).map((r) => { return { ...r }; });
  const updates = rows.filter((r) => r.id);

  try {
    if (updates.length) {
      const { error } = await sb.from(table).upsert(updates, { onConflict: 'id' });
      if (error) throw error;
    }
    if (inserts.length) {
      const { error } = await sb.from(table).insert(inserts);
      if (error) throw error;
    }
    await loadTable(table);
    flash('success', 'Modifications enregistrées.');
  } catch (err) {
    flash('error', 'Enregistrement impossible : ' + err.message);
  }
}

document.addEventListener('click', async (e) => {
  const add = e.target.closest('[data-add]');
  if (add) {
    const table = add.getAttribute('data-add');
    store[table] = store[table] || [];
    store[table].push(SCHEMAS[table].blank());
    renderTable(table);
    return;
  }

  const del = e.target.closest('[data-delete]');
  if (del) {
    const table = del.getAttribute('data-delete');
    const i = Number(del.getAttribute('data-row'));
    const row = store[table][i];
    if (!window.confirm(`Supprimer définitivement cette ${SCHEMAS[table].label} ?`)) return;
    if (row.id) {
      const { error } = await sb.from(table).delete().eq('id', row.id);
      if (error) { flash('error', 'Suppression impossible : ' + error.message); return; }
    }
    store[table].splice(i, 1);
    renderTable(table);
    flash('success', 'Élément supprimé.');
    return;
  }

  const save = e.target.closest('[data-save]');
  if (save) saveTable(save.getAttribute('data-save'));
});

/* ======================================================================
   4. MÉDIAS
   ====================================================================== */
let fichierChoisi = null;

function slugify(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
}

function previewMarkup(url, mime) {
  return (mime || '').startsWith('video/')
    ? `<video src="${escapeHtml(url)}" controls preload="metadata"></video>`
    : `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
}

function choisirFichier(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    flash('error', 'Fichier trop lourd : 10 Mo maximum.');
    return;
  }
  fichierChoisi = file;
  $('#btn-envoyer-media').disabled = false;
  const url = URL.createObjectURL(file);
  $('#apercu-avant').innerHTML =
    `<p style="font-size:.78rem;color:#5d6880;margin:0 0 8px">Aperçu avant envoi — ${escapeHtml(file.name)}</p>
     <div class="a-media" style="max-width:260px"><div class="a-media__preview">${previewMarkup(url, file.type)}</div></div>`;
}

$('#btn-choisir-fichier').addEventListener('click', () => $('#media-fichier').click());
$('#media-fichier').addEventListener('change', (e) => choisirFichier(e.target.files[0]));

const zone = $('#zone-depot');
['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
  e.preventDefault(); zone.setAttribute('data-drag', 'true');
}));
['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
  e.preventDefault(); zone.removeAttribute('data-drag');
}));
zone.addEventListener('drop', (e) => choisirFichier(e.dataTransfer.files[0]));

$('#btn-envoyer-media').addEventListener('click', async () => {
  if (!fichierChoisi) return;
  const btn = $('#btn-envoyer-media');
  btn.disabled = true;
  flash('info', 'Envoi du média en cours…');

  const page = $('#media-page').value;
  const path = `${page}/${Date.now()}-${slugify(fichierChoisi.name)}`;

  const up = await sb.storage.from(BUCKET).upload(path, fichierChoisi, {
    cacheControl: '3600', upsert: false, contentType: fichierChoisi.type
  });
  if (up.error) { flash('error', 'Envoi impossible : ' + up.error.message); btn.disabled = false; return; }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  const { error } = await sb.from('media_assets').insert({
    storage_path: path,
    public_url: pub.publicUrl,
    page,
    section: $('#media-section').value.trim() || null,
    caption: $('#media-legende').value.trim() || null,
    alt_text: $('#media-alt').value.trim() || null,
    mime_type: fichierChoisi.type,
    size_bytes: fichierChoisi.size
  });
  if (error) { flash('error', 'Enregistrement impossible : ' + error.message); btn.disabled = false; return; }

  fichierChoisi = null;
  $('#media-fichier').value = '';
  $('#apercu-avant').innerHTML = '';
  $('#media-section').value = '';
  $('#media-legende').value = '';
  $('#media-alt').value = '';
  flash('success', 'Média ajouté. Copiez son URL pour l\'associer à une catégorie ou à un article.');
  loadMedias();
});

async function loadMedias() {
  const filtre = $('#filtre-media').value;
  let q = sb.from('media_assets').select('*').order('created_at', { ascending: false });
  if (filtre) q = q.eq('page', filtre);
  const { data, error } = await q;
  if (error) { flash('error', 'Médiathèque indisponible : ' + error.message); return; }

  const grid = $('#grille-medias');
  if (!data.length) { grid.innerHTML = '<p class="a-empty">Aucun média pour le moment.</p>'; return; }

  grid.innerHTML = data.map((m) => `
    <figure class="a-media" data-media="${m.id}">
      <div class="a-media__preview">${previewMarkup(m.public_url, m.mime_type)}</div>
      <figcaption class="a-media__body">
        <strong style="font-size:.86rem">${escapeHtml(m.caption || m.storage_path.split('/').pop())}</strong>
        <span class="a-badge">${escapeHtml(m.page)}${m.section ? ' · ' + escapeHtml(m.section) : ''}</span>
        <span class="a-media__meta">${escapeHtml(m.public_url)}</span>
        <div class="a-media__foot">
          <button class="a-btn a-btn--ghost a-btn--sm" type="button" data-copy="${escapeHtml(m.public_url)}">Copier l'URL</button>
          <button class="a-btn a-btn--ghost a-btn--sm" type="button" data-replace="${m.id}" data-path="${escapeHtml(m.storage_path)}">Remplacer</button>
          <button class="a-btn a-btn--danger a-btn--sm" type="button" data-delmedia="${m.id}" data-path="${escapeHtml(m.storage_path)}">Supprimer</button>
        </div>
      </figcaption>
    </figure>`).join('');
}

$('#filtre-media').addEventListener('change', loadMedias);

document.addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.getAttribute('data-copy'));
      flash('success', 'URL copiée dans le presse-papiers.');
    } catch { flash('error', 'Copie impossible : sélectionnez l\'URL manuellement.'); }
    return;
  }

  const rep = e.target.closest('[data-replace]');
  if (rep) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      flash('info', 'Remplacement en cours…');
      const path = rep.getAttribute('data-path');
      const up = await sb.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) { flash('error', 'Remplacement impossible : ' + up.error.message); return; }
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      // Paramètre de version : force les navigateurs à recharger le nouveau fichier
      await sb.from('media_assets').update({
        public_url: pub.publicUrl + '?v=' + Date.now(),
        mime_type: file.type,
        size_bytes: file.size
      }).eq('id', rep.getAttribute('data-replace'));
      flash('success', 'Média remplacé.');
      loadMedias();
    });
    input.click();
    return;
  }

  const dm = e.target.closest('[data-delmedia]');
  if (dm) {
    if (!window.confirm('Supprimer définitivement ce média ? Il disparaîtra des pages qui l\'utilisent.')) return;
    await sb.storage.from(BUCKET).remove([dm.getAttribute('data-path')]);
    const { error } = await sb.from('media_assets').delete().eq('id', dm.getAttribute('data-delmedia'));
    if (error) { flash('error', 'Suppression impossible : ' + error.message); return; }
    flash('success', 'Média supprimé.');
    loadMedias();
  }
});

/* ======================================================================
   5. RÉGLAGES
   ====================================================================== */
const GROUP_LABELS = {
  general: 'Général',
  contact: 'Coordonnées et horaires',
  reseaux: 'Réseaux sociaux',
  chiffres: 'Chiffres clés (page d\'accueil)',
  inscription: 'Page inscription',
  boutique: 'Page boutique',
  documents: 'Documents'
};

async function loadSettings() {
  const { data, error } = await sb.from('site_settings').select('*')
    .order('group_name', { ascending: true }).order('sort_order', { ascending: true });
  if (error) { flash('error', 'Réglages indisponibles : ' + error.message); return; }

  const groups = {};
  data.forEach((s) => { (groups[s.group_name] = groups[s.group_name] || []).push(s); });

  $('#groupes-reglages').innerHTML = Object.keys(groups).map((g) => `
    <div class="a-card">
      <div class="a-card__head"><h2>${escapeHtml(GROUP_LABELS[g] || g)}</h2></div>
      ${groups[g].map((s) => `
        <div class="a-field">
          <label for="set-${escapeHtml(s.key)}">${escapeHtml(s.label)}</label>
          ${s.input_type === 'textarea'
            ? `<textarea class="a-textarea" id="set-${escapeHtml(s.key)}" data-setting-key="${escapeHtml(s.key)}">${escapeHtml(s.value || '')}</textarea>`
            : `<input class="a-input" id="set-${escapeHtml(s.key)}" data-setting-key="${escapeHtml(s.key)}"
                      type="${s.input_type === 'url' ? 'url' : s.input_type === 'email' ? 'email' : s.input_type === 'tel' ? 'tel' : 'text'}"
                      value="${escapeHtml(s.value || '')}">`}
        </div>`).join('')}
    </div>`).join('');
}

$('#btn-save-reglages').addEventListener('click', async () => {
  const rows = $$('[data-setting-key]').map((el) => ({
    key: el.getAttribute('data-setting-key'),
    value: el.value
  }));
  // upsert partiel : seules key + value changent, les libellés restent en base
  const results = await Promise.all(rows.map((r) =>
    sb.from('site_settings').update({ value: r.value }).eq('key', r.key)));
  const failed = results.find((r) => r.error);
  flash(failed ? 'error' : 'success',
    failed ? 'Enregistrement partiel : ' + failed.error.message : 'Réglages enregistrés.');
});

/* ======================================================================
   6. INSCRIPTIONS
   ====================================================================== */
let inscriptions = [];

async function loadInscriptions() {
  const filtre = $('#filtre-statut').value;
  let q = sb.from('inscriptions').select('*').order('created_at', { ascending: false });
  if (filtre) q = q.eq('status', filtre);
  const { data, error } = await q;
  if (error) { flash('error', 'Inscriptions indisponibles : ' + error.message); return; }
  inscriptions = data || [];

  const nouveaux = inscriptions.filter((i) => i.status === 'nouveau').length;
  $('#compteur-inscriptions').textContent =
    `${inscriptions.length} demande(s) affichée(s)${nouveaux ? ` — ${nouveaux} nouvelle(s)` : ''}.`;

  const el = $('#table-inscriptions');
  if (!inscriptions.length) {
    el.innerHTML = '<tbody><tr><td class="a-empty">Aucune demande pour le moment.</td></tr></tbody>';
    return;
  }

  el.innerHTML =
    '<thead><tr><th>Reçue le</th><th>Joueur</th><th>Naissance</th><th>Catégorie</th>' +
    '<th>Contact</th><th>Responsable légal</th><th>Message</th><th style="width:130px">Statut</th></tr></thead><tbody>' +
    inscriptions.map((i) => `
      <tr>
        <td>${new Date(i.created_at).toLocaleDateString('fr-FR')}<br>
            <span class="a-badge ${i.status === 'nouveau' ? 'a-badge--new' : i.status === 'traite' ? 'a-badge--done' : ''}">${escapeHtml(i.status)}</span>
            ${i.notified_at
                ? `<br><span class="a-sent" title="Notification envoyée le ${new Date(i.notified_at).toLocaleString('fr-FR')}">\u2709 envoyée</span>`
                : `<br><span class="a-sent a-sent--ko" title="Aucun email de notification n'est parti pour cette demande.">\u2709 non envoyée</span>`}</td>
        <td><strong>${escapeHtml(i.first_name)} ${escapeHtml(i.last_name)}</strong></td>
        <td>${i.birth_date ? new Date(i.birth_date).toLocaleDateString('fr-FR') : '—'}</td>
        <td>${escapeHtml(i.category_code || '—')}</td>
        <td><a href="mailto:${escapeHtml(i.email)}">${escapeHtml(i.email)}</a><br>${escapeHtml(i.phone || '')}</td>
        <td>${escapeHtml(i.guardian_name || '—')}<br>${escapeHtml(i.guardian_phone || '')}</td>
        <td style="max-width:260px">${escapeHtml(i.message || '')}</td>
        <td>
          <select class="a-select" data-statut="${i.id}">
            <option value="nouveau" ${i.status === 'nouveau' ? 'selected' : ''}>Nouveau</option>
            <option value="traite"  ${i.status === 'traite'  ? 'selected' : ''}>Traité</option>
            <option value="archive" ${i.status === 'archive' ? 'selected' : ''}>Archivé</option>
          </select>
        </td>
      </tr>`).join('') + '</tbody>';
}

$('#filtre-statut').addEventListener('change', loadInscriptions);

document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-statut]');
  if (!sel) return;
  const { error } = await sb.from('inscriptions').update({ status: sel.value }).eq('id', sel.getAttribute('data-statut'));
  flash(error ? 'error' : 'success', error ? 'Mise à jour impossible : ' + error.message : 'Statut mis à jour.');
});

$('#btn-export-csv').addEventListener('click', () => {
  if (!inscriptions.length) { flash('error', 'Aucune donnée à exporter.'); return; }
  const cols = ['created_at', 'last_name', 'first_name', 'birth_date', 'category_code',
                'email', 'phone', 'guardian_name', 'guardian_phone', 'message', 'season', 'status'];
  const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '﻿' + cols.join(';') + '\n' +
    inscriptions.map((r) => cols.map((c) => cell(r[c])).join(';')).join('\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `inscriptions-bcv93-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
});

/* ======================================================================
   7. DÉMARRAGE
   ====================================================================== */
function loadEverything() {
  loadMedias();
  Object.keys(SCHEMAS).forEach(loadTable);
  loadSettings();
  loadInscriptions();
}

sb.auth.getSession().then(function (res) {
  if (res.data.session) showApp(res.data.session);
});
