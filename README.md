# Lar'Allegria by Lara Rossoux — site du club (V02)

Dépôt GitHub : **web-pub/Lar-allegria**. Projet Firebase : **Lar-allegria**.

Site du club d'équitation **Lar'Allegria by Lara Rossoux** (ASBL, Grâce-Hollogne),
construit sur le même modèle que le site "Les Cabots de Fernelmont" : un site
statique (HTML/CSS/JS, sans framework ni étape de build) hébergé sur
**Firebase Hosting** et connecté à **Firebase Authentication** + **Firestore**
pour tout ce qui est dynamique (espace membre, espace admin, réservations,
boutique...).

## 1. Ce que fait le site

- Pages publiques : Accueil, Le Club, Activités, Lara, Tarifs (grille tenue à
  jour par Lara), Inscription (formulaire public de demande d'adhésion),
  Contact, CGV, Confidentialité.
- **Inscription en ligne** : un visiteur choisit "membre cours" ou "membre
  pension" et remplit sa fiche complète. La demande part dans Firestore
  (`demandes_inscription`) ; Lara la valide depuis l'espace admin et crée le
  compte membre.
- **Espace membre** (après connexion) : profil, cheval (si membre pension),
  réservation de la piste dans une grille horaire (cours d'1h ou usage libre
  de la piste), météo affichée sur chaque créneau, activités (stages,
  spectacles), nettoyage du box (si assigné), tarifs, boutique, messages,
  historique.
- **Espace admin** (Lara) : validation des réservations (une seule personne
  à la fois sur la piste), gestion des membres et des demandes d'inscription,
  box et planning de nettoyage, tarifs, activités, boutique/commandes,
  messages, horaires d'ouverture de la piste.
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

**Pour chaque membre ensuite**, la même procédure s'applique — mais elle se
fait directement depuis l'espace admin du site (onglet "Membres") : Lara crée
d'abord le compte dans Firebase Authentication (email
`identifiant@membres.lar-allegria.local`), copie l'UID, puis l'entre dans le
formulaire "+ Ajouter un membre" qui crée la fiche complète dans Firestore.
Depuis une **demande d'inscription**, le bouton "Créer la fiche membre"
pré-remplit tout le formulaire automatiquement — il ne reste qu'à coller
l'UID une fois le compte Authentication créé.

## 4. Déployer les règles Firestore

Avec le [CLI Firebase](https://firebase.google.com/docs/cli) installé :

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
git commit -m "Site Lar'Allegria V02"
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
2. Onglet **Paramètres** : règle les horaires d'ouverture de la piste (jours
   + heures) — c'est cette grille qui apparaît ensuite côté membres.
3. Onglet **Tarifs** : encode la grille tarifaire (cours, pension, stages...).
   Elle apparaît automatiquement sur la page publique `tarifs.html` et dans
   l'espace membre.
4. Onglet **Nettoyage box** : crée les box de l'écurie.
5. Partage le lien `inscription.html` pour que les premiers membres
   s'inscrivent, puis crée leurs comptes comme décrit au point 3 ci-dessus.

## 7. Arborescence du projet

```
lar-allegria/
├── index.html, club.html, activites.html, lara.html, tarifs.html,
│   inscription.html, contact.html, connexion.html, cgv.html,
│   confidentialite.html          → pages publiques
├── espace-membre.html             → espace membre (connecté)
├── admin.html                     → espace admin (Lara)
├── assets/
│   ├── style.css, app.css         → charte graphique (ambiance flamenco)
│   ├── firebase-config.js         → config Firebase (à compléter, voir §2)
│   ├── meteo.js                   → météo Open-Meteo (Grâce-Hollogne)
│   ├── app-membre.js              → logique espace membre
│   ├── app-admin.js               → logique espace admin
│   ├── logo.png, hero-lara.jpg    → visuels du club
├── firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
└── robots.txt, sitemap.xml
```

## 8. Prochaines pistes d'évolution

Ce premier site couvre l'ensemble des besoins décrits (inscription en ligne,
réservation de piste avec météo et validation, gestion des deux types de
membres, nettoyage des box, tarifs, boutique, stages/spectacles). Des
évolutions naturelles pour la suite : facturation/PDF automatique,
notifications par e-mail (nécessiterait des Cloud Functions, donc le plan
Firebase payant à l'usage "Blaze"), ou une page publique listant les
prochains stages/spectacles ouverts au public.
