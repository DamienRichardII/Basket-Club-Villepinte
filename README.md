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
assets/img/sponsors/     4 logos de partenaires détourés sur fond transparent
assets/fonts/            Anton + Barlow (woff2, SIL OFL)

supabase/schema.sql      Schéma complet + politiques RLS + bucket Storage
supabase/schema-notifications.sql  Notification email des inscriptions (déclencheur + table)
supabase/functions/      Edge Function d'envoi des emails (déployée)

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
| `notification_recipients` | **admin uniquement** | **admin uniquement** |

Un compte n'est administrateur que s'il figure dans la table `public.admins`.
Créer un compte via Supabase Auth ne donne **aucun** droit d'écriture.

Deux comptes sont déclarés (droits identiques, il n'y a pas de niveaux) :

| Compte | Rôle |
|---|---|
| `damien.miyouna@gmail.com` | DamCompany — développeur |
| `bcvillepinte93@gmail.com` | Jean-Georges — président du club |

Les mots de passe ne figurent pas ici : ils se réinitialisent depuis l'écran de
connexion ou depuis Supabase Studio.

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
  En haut de l'onglet, le bloc « Notification par email » liste les adresses qui
  reçoivent chaque nouvelle demande : en ajouter une, la désactiver ou la
  supprimer ne demande aucune intervention technique. Chaque ligne du tableau
  porte un témoin ✉ indiquant si l'email est bien parti.

Un réseau social laissé vide dans les réglages est automatiquement masqué sur le site.

---

## 5. Ajouter ou retirer un partenaire

Les logos sont en dur dans `index.html` (les partenaires changent une fois par saison,
cela ne justifiait pas une table en base). Pour en ajouter un :

1. detourer le logo sur fond transparent, hauteur 240 px, l'enregistrer en WebP dans
   `assets/img/sponsors/` ;
2. dans `index.html`, ajouter la ligne `<img class="sponsors__logo" ...>` **dans les cinq
   groupes** `.sponsors__group` (ils doivent rester identiques, sinon la boucle saute) ;
3. ajouter le nom du partenaire dans la liste `sr-only` juste au-dessus.

---

## 6. Emails des inscriptions

Chaque demande de pré-inscription part par email vers les adresses déclarées dans
le back-office (onglet **Inscriptions** → « Notification par email »), **en plus**
d'apparaître dans le tableau.

### La chaîne

```
formulaire du site
  → insertion dans `inscriptions`
  → déclencheur SQL `inscriptions_notify`      (supabase/schema-notifications.sql)
  → Edge Function `notify-inscription`         (supabase/functions/)
  → envoi via Resend
  → horodatage dans `inscriptions.notified_at`
```

L'appel est **asynchrone** et le déclencheur avale ses propres erreurs : un
problème d'email ne peut jamais faire échouer une inscription. Si l'envoi ne part
pas, la demande est quand même enregistrée, visible dans le back-office, et son
témoin ✉ reste sur « non envoyée ». Rien ne peut être perdu.

### Ce qu'il reste à renseigner (une seule fois, sans ligne de commande)

Le code et la base sont en place. Il manque deux valeurs, à saisir dans
**Supabase Studio → Edge Functions → notify-inscription → Secrets** :

| Secret | Valeur |
|---|---|
| `RESEND_API_KEY` | la clé API d'un compte [resend.com](https://resend.com) (offre gratuite : 3 000 emails/mois) |
| `BCV_HOOK_SECRET` | exactement la valeur du secret `bcv_hook_secret` du Vault (Studio → Integrations → Vault) |

Tant que `RESEND_API_KEY` est absente, la fonction répond « no_api_key » et
n'envoie rien : le site continue de fonctionner normalement.

**Sans nom de domaine**, l'expéditeur par défaut `onboarding@resend.dev` de Resend
n'écrit qu'à l'adresse du titulaire du compte Resend. Il faut donc **créer le
compte Resend avec l'adresse qui doit recevoir les inscriptions**. C'est suffisant
pour démarrer.

Le jour où `basketclubvillepinte.com` est branché et vérifié chez Resend, ajouter
deux secrets de plus :

| Secret | Valeur |
|---|---|
| `MAIL_FROM` | `BCV93 <inscriptions@basketclubvillepinte.com>` |
| `MAIL_CONFIRM_FAMILY` | `true` pour envoyer aussi l'accusé de réception à la famille |

### Diagnostic

```sql
-- réponses des derniers appels sortants
select id, status_code, content, error_msg, created
  from net._http_response order by created desc limit 10;
```

`503 hook_secret_not_configured` = `BCV_HOOK_SECRET` pas encore saisi ·
`403 forbidden` = les deux secrets ne correspondent pas ·
`200 {"skipped":"no_api_key"}` = clé Resend manquante ·
`200 {"notified":true}` = email parti.

---

## 7. Origine des données

- **Catégories et planning** — document **« Planning Provisoire à Valider »** transmis
  par le président (version 2 du 2 septembre 2026), qui remplace le
  `planningentrainement.xlsx` initial. Il scinde les U11 en Filles / Garçons, déplace les U15 Filles au Cosec et
  redistribue les créneaux du soir. Trois contradictions subsistent (U18M/U21M dans
  deux gymnases à la même heure, fusion U21/Séniors, Séniors Filles absentes) :
  les arbitrages retenus sont documentés dans `docs/CONTENU-A-FOURNIR.md`.
  Le planning étant provisoire, un bandeau le signale sur la page Catégories —
  il se retire depuis **Réglages → Planning des entraînements**.
- **Tarifs des licences** — grille « Tarifs saison 2026-2027 » fournie par le club.
  L'académie U13-U15 n'y figure pas : elle affiche « Sur demande ».
- **Boutique** — brochure Upset Sports. Seuls les visuels portant le blason de
  Villepinte ont été retenus (les pages Boissy sont ignorées). Les images ont été
  détourées automatiquement puis normalisées en WebP 560×560 sur fond transparent.
  Les articles blancs (chaussettes, gourde, gobelet) ont demandé un détourage par
  détection de contour, le seuillage par couleur étant inopérant sur blanc/gris.
  Les prix de la brochure sont des tarifs d'achat groupé dégressifs : c'est le
  premier palier (le plus élevé) qui est affiché, marqué « Tarif indicatif ».

---

## 8. Choix techniques

- **Aucune dépendance externe au chargement.** Polices et librairies sont auto-hébergées :
  pas d'appel à Google Fonts ni à un CDN, donc aucune adresse IP de visiteur transmise
  à un tiers (point de conformité RGPD régulièrement relevé en France sur Google Fonts).
  Seule exception : la carte des gymnases (iframe Google Maps), signalée dans les mentions légales.
- **Site public sans librairie JS.** `js/api.js` interroge directement l'API REST de Supabase
  en `fetch`. Le back-office charge `supabase-js` (auth + Storage), lui aussi auto-hébergé.
- **QR code généré côté client** (`qrcode-generator`, MIT), rendu en SVG aux couleurs du club
  et téléchargeable en SVG pour l'impression. Aucun service tiers, aucune clé d'API.
  L'adresse encodée se règle dans `js/config.js` (clé `qrUrl`) — actuellement
  `https://basket-club-villepinte.vercel.app/inscription`. Le paramètre `?qr=1` y est
  ajouté automatiquement : les demandes venues d'un flyer sont enregistrées avec
  `source = 'qr-code'` dans la table `inscriptions`, ce qui permet de mesurer le
  rendement des affiches. L'ancre `#formulaire` fait arriver directement sur le formulaire.
  **À mettre à jour** le jour où basketclubvillepinte.com sera branché sur Vercel :
  les flyers déjà imprimés continueront de fonctionner (Vercel garde l'adresse
  `.vercel.app` active), mais les nouveaux porteront le bon domaine.
- **Bande des partenaires** (accueil, entre le hero et le bandeau de chiffres).
  Défilement CSS pur, sans JavaScript : la piste contient **5 groupes de logos
  identiques** et se déplace de `-20 %`, soit exactement la largeur d'un groupe.
  À la fin du cycle l'image est rigoureusement la même qu'au départ — la boucle est
  donc invisible, sans saut ni temps mort. Les groupes en réserve couvrent plus de
  deux largeurs d'écran, il ne peut jamais y avoir de blanc.
  La piste animée porte `aria-hidden` (elle répète cinq fois les mêmes logos) et une
  liste `sr-only` donne les noms des partenaires aux lecteurs d'écran.
- **Cache des assets.** Les polices sont mises en cache un an (`immutable`) : leur nom
  et leur contenu ne changent jamais. Les images, elles, gardent le même nom d'un
  déploiement à l'autre — elles sont donc servies avec `max-age=86400, must-revalidate`,
  sinon un visuel remplacé resterait bloqué jusqu'à un an dans le navigateur des visiteurs.
  Si un visuel doit être rafraîchi immédiatement chez tout le monde, ajouter un paramètre
  de version à son URL (`...webp?v=2`) dans le champ « Photo » du back-office.
- **Header et pied de page dupliqués dans chaque page** : choix assumé pour rester en HTML
  statique pur (bon pour le SEO, pas de flash au chargement). Une modification du menu ou
  du pied de page doit être répercutée dans les 9 fichiers `.html`.

---

## 9. Vérifications effectuées

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
