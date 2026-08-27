# Basket Club Villepinte — TeamBCV93

Site web du Basket Club Villepinte. HTML / CSS / JavaScript vanilla, backend Supabase.
Réalisation : **DamCompany**.

---

## 1. Démarrer

Aucun build, aucune dépendance à installer. Le site est du HTML statique.

```bash
# aperçu local
python -m http.server 8000
# puis http://localhost:8000
```

Déploiement : `git push` vers GitHub → Vercel. `index.html` est à la racine, `vercel.json`
gère les en-têtes de sécurité et le cache des assets.

---

## 2. Arborescence

```
index.html               Accueil
categories.html          Nos équipes
histoire.html            Frise chronologique
palmares.html            Titres et distinctions
inscription.html         Formulaire de pré-inscription + QR code
boutique.html            Boutique (collection officielle du club)
contact.html             Coordonnées, horaires, carte des 2 gymnases
mentions-legales.html    Mentions légales + RGPD
admin.html               Back-office (non listé dans le menu, noindex)

css/style.css            Site public — tout le design system
css/admin.css            Back-office
css/fonts.css            Polices auto-hébergées

js/config.js             Clés Supabase + URL du site  ← seul fichier à éditer au déploiement
js/api.js                Lecture/écriture Supabase via fetch (site public, 0 dépendance)
js/main.js               Header, réglages, chargement du contenu par page
js/inscription.js        Formulaire + génération du QR code
js/admin.js              Back-office
js/vendor/               qrcode-generator (MIT) + supabase-js (MIT), auto-hébergés

assets/img/              Logo, favicons
assets/img/boutique/     24 visuels d'articles détourés depuis la brochure fournisseur
assets/fonts/            Anton + Barlow (woff2, SIL OFL)

supabase/schema.sql      Schéma complet + politiques RLS + bucket Storage
supabase/functions/      Edge Function d'email de confirmation (prête, non déployée)

docs/CONTENU-A-FOURNIR.md  Ce que le club doit encore transmettre
```

---

## 3. Supabase

Projet : **Basket Club Villepinte** — ref `vtpgflcndrcjivdryynr`, région `eu-west-3` (Paris).
URL et clé publique sont dans `js/config.js`. Cette clé est publique par conception :
la sécurité repose entièrement sur les politiques RLS.

| Table | Lecture | Écriture |
|---|---|---|
| `categories`, `honours`, `timeline_events`, `shop_products`, `training_slots` | publique (si `is_published`) | admin |
| `site_settings`, `media_assets` | publique | admin |
| `inscriptions` | **admin uniquement** | publique (consentement obligatoire) |

Un compte n'est administrateur que s'il figure dans la table `public.admins`.
Créer un compte via Supabase Auth ne donne **aucun** droit d'écriture.

### Ajouter un administrateur

1. Supabase Studio → **Authentication → Users → Add user** (cocher « Auto Confirm User »).
2. Puis en SQL :

```sql
insert into public.admins (user_id, email, full_name)
select id, email, 'Prénom Nom' from auth.users where email = 'adresse@exemple.fr';
```

### Retirer un administrateur

```sql
delete from public.admins where email = 'adresse@exemple.fr';
```

---

## 4. Back-office (`/admin.html`)

Sept onglets :

- **Médias** — envoi de photos/vidéos dans Supabase Storage, aperçu avant et après,
  remplacement d'un fichier en conservant son URL, suppression. Le bouton « Copier l'URL »
  sert à coller l'adresse dans la fiche d'une catégorie ou d'un article.
- **Catégories** — nom, années de naissance, tarif de licence, créneaux, gymnase, photo.
  Le tarif saisi ici alimente à la fois la carte de l'équipe, le sélecteur du formulaire
  d'inscription et la grille tarifaire.
- **Planning** — un créneau par ligne (gymnase, équipe, jour, horaire, éducateur).
  Alimente la grille hebdomadaire de la page Catégories.
- **Palmarès / Histoire / Boutique** — édition en tableau, ajout et suppression
  de lignes, publication ligne par ligne (`En ligne`).
- **Réglages** — coordonnées, horaires, gymnases, réseaux sociaux, chiffres clés de l'accueil,
  textes des étapes d'inscription. Tout ce qui est modifiable sans toucher au code est ici.
- **Inscriptions** — demandes reçues, changement de statut, export CSV.

Un réseau social laissé vide dans les réglages est automatiquement masqué sur le site.

---

## 5. Emails de confirmation

`supabase/functions/send-inscription-email/index.ts` est **écrit mais non déployé**.
Le mode d'emploi (3 commandes) figure en tête du fichier. Aujourd'hui, une demande
d'inscription affiche une confirmation à l'écran et apparaît dans le back-office avec
le badge « nouveau ».

---

## 6. Origine des données

- **Catégories et planning** — fichier `planningentrainement.xlsx` fourni par le club,
  feuille « Planning 2027 » (répartition réelle par gymnase). Cette feuille contredit
  la feuille « Catégories » sur trois lignes : les écarts sont documentés dans
  `docs/CONTENU-A-FOURNIR.md`, et c'est la feuille Planning qui fait foi partout.
- **Tarifs des licences** — grille « Tarifs saison 2026-2027 » fournie par le club.
  L'académie U13-U15 n'y figure pas : elle affiche « Sur demande ».
- **Boutique** — brochure Upset Sports. Seuls les visuels portant le blason de
  Villepinte ont été retenus (les pages Boissy sont ignorées). Les images ont été
  détourées automatiquement puis normalisées en WebP 560×560 sur fond transparent.
  Les articles blancs (chaussettes, gourde, gobelet) ont demandé un détourage par
  détection de contour, le seuillage par couleur étant inopérant sur blanc/gris.
  Les prix de la brochure sont des tarifs d'achat groupé dégressifs : ils ne sont
  **pas** affichés comme prix de vente.

---

## 7. Choix techniques

- **Aucune dépendance externe au chargement.** Polices et librairies sont auto-hébergées :
  pas d'appel à Google Fonts ni à un CDN, donc aucune adresse IP de visiteur transmise
  à un tiers (point de conformité RGPD régulièrement relevé en France sur Google Fonts).
  Seule exception : la carte des gymnases (iframe Google Maps), signalée dans les mentions légales.
- **Site public sans librairie JS.** `js/api.js` interroge directement l'API REST de Supabase
  en `fetch`. Le back-office charge `supabase-js` (auth + Storage), lui aussi auto-hébergé.
- **QR code généré côté client** (`qrcode-generator`, MIT), rendu en SVG aux couleurs du club
  et téléchargeable en SVG pour l'impression. Aucun service tiers, aucune clé d'API.
- **Header et pied de page dupliqués dans chaque page** : choix assumé pour rester en HTML
  statique pur (bon pour le SEO, pas de flash au chargement). Une modification du menu ou
  du pied de page doit être répercutée dans les 9 fichiers `.html`.

---

## 8. Vérifications effectuées

- Rendu desktop (1440 px), tablette (768 px) et mobile (360-390 px) sur les 8 pages publiques
  + le back-office.
- Aucune erreur console, aucun débordement horizontal sur aucune page.
- Formulaire d'inscription testé de bout en bout : validation, affichage automatique du bloc
  « responsable légal » pour un mineur, écriture réelle en base, message de confirmation.
  (La ligne de test a été supprimée.)
- QR code généré puis **décodé** pour vérifier qu'il pointe bien vers le formulaire.
- Politiques RLS testées depuis un client anonyme : lecture des inscriptions refusée,
  écriture sur le contenu vitrine refusée, insertion sans consentement refusée.
- Grille tarifaire : les 24 visuels de la boutique se chargent (24/24), le tarif s'affiche
  au changement de catégorie et la pré-sélection depuis la page Catégories fonctionne.
- Planning : grille hebdomadaire conforme au fichier du club, gymnase du Cosec en premier,
  bascule en cartes lisibles sous 860 px.
- Contrastes vérifiés sur 16 paires texte/fond : toutes conformes WCAG AA.
- Navigation clavier : lien d'évitement, focus visible sur tous les éléments interactifs.

**Non vérifié en conditions réelles :** les écrans authentifiés du back-office, faute de
compte confirmé au moment de la livraison. Le formulaire de connexion, la gestion d'erreur
d'identifiants et le chargement du module sont testés ; le reste demande une première
connexion (voir § 3).
