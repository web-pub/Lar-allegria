# Lar'Allegria by Lara Rossoux — site du club (V29)

Dépôt GitHub : **web-pub/Lar-allegria**. Projet Firebase : **Lar-allegria**.

Site de l'école équestre **Lar'Allegria by Lara Rossoux** (ASBL, Grâce-Hollogne),
construit sur le même modèle que le site "Les Cabots de Fernelmont" : un site
statique (HTML/CSS/JS, sans framework ni étape de build) hébergé sur
**Firebase Hosting** et connecté à **Firebase Authentication** + **Firestore**
pour tout ce qui est dynamique (espace membre, espace admin, réservations,
boutique...).

## 1. Ce que fait le site

- Pages publiques : Accueil, Le Club, Activités, **Nos chevaux**, Lara,
  **Événements**, **Blog**, Tarifs (grille tenue à jour par Lara), Inscription
  (formulaire public de demande d'adhésion), Contact, CGV, Confidentialité.
- **Inscription en ligne** : un visiteur choisit "membre cours", "membre
  demi-pension" (les chevaux appartiennent tous à Lara ; un membre demi-pension
  en a un mis à sa disposition comme s'il était le sien) ou **"membre
  bénévole"** (vient régulièrement aider au club selon un planning de tâches)
  et remplit sa fiche complète. La demande part dans Firestore
  (`demandes_inscription`) ; Lara la valide depuis l'espace admin et crée le
  compte membre.
- **Espace membre** (après connexion) : profil, cheval (si membre demi-pension),
  réservation de la piste dans une grille horaire (cours d'1h ou usage libre
  de la piste, avec prise en compte des jours fermés / horaires exceptionnels
  fixés par Lara), météo affichée sur chaque créneau, activités (stages,
  spectacles), nettoyage du box (si assigné), tarifs, boutique, **stock du
  club** (signaler ce qu'on a pris), messages, historique. Un membre
  "bénévole" voit en plus l'onglet **"Bénévolat"** : ses propres créneaux
  (avec bouton "marquer comme fait") et le planning complet de l'équipe, pour
  que chacun voie qui vient quand et pour quelle tâche.
- **Espace admin** (Lara) : validation des réservations (une seule personne
  à la fois sur la piste), gestion des membres et des demandes d'inscription,
  box et planning de nettoyage, **planning des bénévoles** (assigner une
  tâche, une date et une heure à chaque bénévole, marquer fait, supprimer),
  tarifs, activités, **fiches des chevaux de l'écurie** (nom,
  race, photo, description — les photos sont déposées manuellement dans
  `assets/chevaux/` sur GitHub puis leur URL est collée dans la fiche),
  **calendrier** (jours fermés / horaires exceptionnels de la piste),
  **événements publics** (titre, date, heure, photo, description — visibles
  de tous les visiteurs), **articles de blog** (mode newsletter, brouillon ou
  publié), **stock** (foin, nourriture...), boutique/commandes, messages,
  horaires d'ouverture de la piste, et un onglet **"Contenu du site"** pour
  modifier les textes principaux des pages publiques (titre et texte
  d'accueil, présentation du club, bio de Lara) sans toucher au code.
- **Météo** : via [Open-Meteo](https://open-meteo.com/) (gratuit, sans clé),
  coordonnées de Grâce-Hollogne. Une alerte (pluie, vent, chaleur, gel)
  s'affiche automatiquement sur les créneaux concernés.

## 2. Projet Firebase

✅ Déjà fait : le projet Firebase **`lar-allegria`** est créé et sa config
est déjà branchée dans `assets/firebase-config.js` et `.firebaserc`. Il reste
seulement à activer les deux services suivants dans la
[console Firebase](https://console.firebase.google.com/project/lar-allegria) :

1. **Authentication** → Sign-in method → active **E-mail/Mot de passe** (si
   ce n'est pas déjà fait).
2. **Firestore Database** → Créer une base de données → région Europe (ex.
   `eur3` ou `europe-west1`) → mode production (si ce n'est pas déjà fait).

## 3. Créer le compte de Lara (administratrice)

Comme le site n'a pas de serveur (pas de Cloud Functions), la création d'un
compte se fait en deux étapes toutes simples. **Identifiants prévus pour
Lara : identifiant `ADMIN`, mot de passe `Lara4460`** (Lara pourra changer ce
mot de passe elle-même depuis l'espace admin, onglet "Paramètres" → "Mon mot
de passe").

1. Dans la console Firebase → **Authentication** → **Users** → **Add user**.
   - Email : `admin@membres.lar-allegria.local` (le mot-clé, ici "admin",
     est l'identifiant que Lara tapera pour se connecter sur
     `connexion.html`, qui transforme automatiquement l'identifiant saisi en
     cette adresse — donc taper "ADMIN" ou "admin" fonctionne pareil).
   - Mot de passe : `Lara4460` (à changer ensuite depuis le site si tu veux).
   - Une fois créé, **copie l'UID** généré (une longue chaîne du type
     `8f3kd92J...`).
2. Dans la console Firebase → **Firestore Database** → **Start collection** →
   nom de la collection : `membres`. Crée un document dont l'**ID est
   exactement cet UID**, avec au minimum les champs :
   - `role` (string) = `admin`
   - `identifiant` (string) = `ADMIN`
   - `prenom` (string) = `Lara`
   - `nom` (string) = `Rossoux`

Lara peut alors se connecter sur `connexion.html` avec l'identifiant `ADMIN`
et le mot de passe `Lara4460`, et elle arrive sur `admin.html`. Elle peut
changer ce mot de passe à tout moment depuis l'onglet **Paramètres** de
l'espace admin.

## 3bis. Créer le compte super-admin (HeleneL)

Même principe, mais avec `role` = `superadmin` : ce compte a toutes les
permissions d'un admin classique, plus un onglet exclusif **"🔑 Mots de
passe"** invisible pour Lara, qui liste le mot de passe actuel de tous les
comptes (admin et membres) et permet de les réinitialiser. Comme pour
Katia/Lara côté club canin, ce compte est invisible dans les listes de
membres et ne peut pas recevoir de messages (déjà géré par construction :
les requêtes excluent les rôles `admin` et `superadmin`).

1. Firebase Console → **Authentication** → **Users** → **Add user**.
   - Email : `helenel@membres.lar-allegria.local`
   - Mot de passe : `Helene123`
   - Copie l'UID généré.
2. Firebase Console → **Firestore Database** → collection `membres` → crée un
   document dont l'**ID est exactement cet UID**, avec les champs :
   - `role` (string) = `superadmin`
   - `identifiant` (string) = `HeleneL`
   - `prenom` (string) = `Hélène`
   - `motDePasseActuel` (string) = `Helene123` — **important** : c'est ce
     champ que l'onglet "Mots de passe" affiche et utilise pour pouvoir
     réinitialiser les mots de passe des autres comptes (le SDK Firebase
     client ne permet de changer le mot de passe d'un compte tiers qu'en se
     connectant brièvement avec son mot de passe actuel connu — pas d'accès
     Admin SDK sur le plan Spark).
3. Pour que le mot de passe de Lara soit lui aussi visible/réinitialisable
   dès le départ (son compte a été créé avant cette fonctionnalité), ajoute
   aussi le champ `motDePasseActuel` = `Lara4460` sur le document `membres`
   de Lara. Les comptes créés ensuite (nouveaux membres, ou tout compte dont
   le mot de passe est changé depuis le site) ont ce champ renseigné
   automatiquement.

HeleneL se connecte alors sur `connexion.html` avec l'identifiant `HeleneL`
et le mot de passe `Helene123`.

**Pour chaque membre ensuite**, tout se fait directement depuis l'espace
admin du site (onglet "Membres") → **"+ Ajouter un membre"** : Lara choisit
un identifiant et un mot de passe temporaire (pré-rempli, modifiable), remplit
la fiche, clique **Enregistrer** — le compte Firebase Authentication *et* la
fiche Firestore sont créés automatiquement en un seul clic, sans passer par
la console Firebase. Depuis une **demande d'inscription**, le bouton "Créer
la fiche membre" pré-remplit tout le formulaire automatiquement. Le membre
pourra ensuite changer ce mot de passe lui-même depuis son espace, onglet
"Mon profil" → "Mon mot de passe" (même fonctionnement que pour Lara).

Seul le tout premier compte (celui de Lara, l'administratrice) doit être créé
à la main via la console Firebase, comme décrit ci-dessus — logique, puisqu'il
n'y a pas encore d'espace admin accessible avant que ce compte existe.

## 4. Déployer les règles Firestore

⚠️ **Étape indispensable à chaque fois que `firestore.rules` change** (par
exemple à chaque nouvelle fonctionnalité livrée : chevaux, événements, blog,
stock, planning bénévoles, contenu du site...). Uploader les fichiers sur
GitHub ne suffit pas : les règles de sécurité vivent dans le projet Firebase
et doivent être copiées à part. Tant que ce n'est pas fait, toute tentative
d'écriture sur une collection qui n'existe pas encore dans les règles
publiées échoue silencieusement (le bouton "Enregistrer" ne fait rien, ou
affiche une erreur de type "permissions insuffisantes").

**Option simple, sans rien installer (recommandée)** :

1. Ouvre la [console Firebase](https://console.firebase.google.com/project/lar-allegria/firestore/rules).
2. Va dans **Firestore Database** → onglet **Règles**.
3. Ouvre le fichier `firestore.rules` du projet (avec un éditeur de texte, ou
   directement sur GitHub), sélectionne tout son contenu et copie-le.
4. Colle-le dans l'éditeur de règles de la console Firebase, à la place du
   contenu existant.
5. Clique sur **Publier**.

C'est tout — pas besoin d'installer quoi que ce soit. À refaire à chaque fois
que le fichier `firestore.rules` est mis à jour.

**Option CLI** (si tu as déjà Node.js et que tu préfères la ligne de commande) :

```bash
npm install -g firebase-tools
firebase login
cd lar-allegria
firebase deploy --only firestore:rules,firestore:indexes
```

## 5. Héberger le site

### Option recommandée : Firebase Hosting

```bash
firebase deploy --only hosting
```

Le site sera en ligne sur `https://TON-PROJET.web.app`.

### Alternative : GitHub Pages

Le dépôt `web-pub/Lar-allegria` existe déjà (vide) sur GitHub. Pour y pousser
le site :

```bash
cd lar-allegria
git init
git add .
git commit -m "Site Lar'Allegria V04"
git branch -M main
git remote add origin https://github.com/web-pub/Lar-allegria.git
git push -u origin main
```

Puis dans le dépôt GitHub → **Settings** → **Pages** → **Build and
deployment** → Source = "Deploy from a branch" → Branch = `main`, dossier
`/ (root)` → **Save**. Le site sera en ligne en 1-2 minutes sur
`https://web-pub.github.io/Lar-allegria/` (déjà l'adresse utilisée dans les
`canonical`, `sitemap.xml` et `robots.txt` de ce projet).

Dans les deux cas, Firebase Authentication + Firestore restent utilisés
normalement (ils ne dépendent pas de l'endroit où le HTML est hébergé) —
pense juste à ajouter le domaine final (`....github.io` ou `....web.app`)
dans Firebase Authentication → **Settings** → **Authorized domains**.

## 6. Premiers pas une fois en ligne

1. Connecte-toi en tant que Lara sur `/connexion.html`.
2. Onglet **Paramètres** : règle les horaires d'ouverture de la piste — un
   horaire différent est possible pour chaque jour de la semaine (coche les
   jours ouverts, indique l'heure d'ouverture et de fermeture pour chacun) —
   c'est cette grille qui apparaît ensuite côté membres. Pour un jour précis
   qui déroge à ces horaires habituels (fermeture exceptionnelle, horaire
   spécial ponctuel), utilise le bloc "Jours fermés / horaires exceptionnels"
   juste en dessous.
3. Onglet **Tarifs** : encode la grille tarifaire (cours, demi-pension, stages...).
   Elle apparaît automatiquement sur la page publique `tarifs.html` et dans
   l'espace membre.
4. Onglet **Nettoyage box** : crée les box de l'écurie.
5. Partage le lien `inscription.html` pour que les premiers membres
   s'inscrivent, puis crée leurs comptes comme décrit au point 3 ci-dessus.

## 7. Arborescence du projet

```
lar-allegria/
├── index.html, club.html, activites.html, chevaux.html, lara.html,
│   evenements.html, blog.html, tarifs.html, inscription.html, contact.html,
│   connexion.html, cgv.html, confidentialite.html   → pages publiques
├── espace-membre.html             → espace membre (connecté)
├── admin.html                     → espace admin (Lara)
├── assets/
│   ├── style.css, app.css         → charte graphique (ambiance flamenco)
│   ├── firebase-config.js         → config Firebase (à compléter, voir §2)
│   ├── meteo.js                   → météo Open-Meteo (Grâce-Hollogne)
│   ├── app-membre.js              → logique espace membre
│   ├── app-admin.js               → logique espace admin
│   ├── chevaux/                   → photos des chevaux déposées par Lara (voir §1)
│   ├── logo.png, photo-spectacle-lara.jpg, photo-equipe-spectacle.jpg → visuels du club
├── firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
└── robots.txt, sitemap.xml
```

Nouvelles collections Firestore (V06-V08) : `contenu_site` (textes éditables des
pages publiques), `chevaux_ecurie` (fiches chevaux), `disponibilites_exceptions`
(jours fermés / horaires spéciaux, un document par date), `evenements`,
`articles_blog`, `stock` et `stock_signalements` (journal des prises de stock
par les membres), `planning_benevoles` (créneaux des membres bénévoles : qui
vient quand et pour quelle tâche). Les règles d'accès sont dans `firestore.rules`.

## 8. Prochaines pistes d'évolution

Ce premier site couvre l'ensemble des besoins décrits (inscription en ligne,
réservation de piste avec météo et validation, gestion des deux types de
membres, nettoyage des box, tarifs, boutique, stages/spectacles). Des
évolutions naturelles pour la suite : facturation/PDF automatique,
notifications par e-mail (nécessiterait des Cloud Functions, donc le plan
Firebase payant à l'usage "Blaze"), ou une page publique listant les
prochains stages/spectacles ouverts au public.
