# Mettre EcclesiaManager en ligne (Render)

Résultat : une adresse du type `https://ecclesia-manager.onrender.com`, accessible depuis tout téléphone ou ordinateur, avec cadenas HTTPS.

## Avant de commencer
- Un compte **GitHub** (gratuit) : https://github.com
- Un compte **Render** : https://render.com (inscription avec GitHub)
- Une carte bancaire : la base de données (SQLite) a besoin d'un **disque permanent**, ce qui exige un service payant sur Render (environ 7 $/mois + quelques centimes pour le disque ; vérifiez sur render.com/pricing). Le niveau gratuit s'endort et **efface les données** : à ne pas utiliser.

## Étape 1 — Préparer le dossier
Dans le dossier du projet, vous devez avoir :
```
server.js  cron.js  database.js  bootstrap.js  seed.js  test_app.js
package.json  Dockerfile  render.yaml  .gitignore  .dockerignore
public/        ← votre dossier d'interface (index.html, etc.)
```
**Ne mettez pas** `assemblee.db` : la base se crée toute seule, propre, en ligne.

## Étape 2 — Envoyer sur GitHub
1. GitHub → **New repository** → nom `ecclesia-manager` → cochez **Private** → Create.
2. Cliquez **uploading an existing file**, glissez-déposez **tout le contenu** du dossier (y compris `public`), puis **Commit changes**.
   (Le dépôt doit rester **privé** : il contient le code d'une application de données personnelles.)

## Étape 3 — Déployer sur Render
1. Render → **New +** → **Blueprint** → connectez GitHub → choisissez `ecclesia-manager`.
2. Render demande la valeur de **ADMIN_PASSWORD** : saisissez un mot de passe **long et unique** (12 caractères minimum, ne reprenez pas ceux du README).
3. Cliquez **Apply** et attendez 3 à 5 minutes (« Live » en vert).
4. Ouvrez l'adresse affichée en haut du service.

## Étape 4 — Première connexion
- Identifiant : `pasteur@map-ebenezer.org` (ou la valeur de `ADMIN_EMAIL`)
- Mot de passe : celui de `ADMIN_PASSWORD`
- Onglet **Comptes & Responsables** : créez les comptes du secrétaire, du trésorier et des responsables de départements, chacun avec son propre mot de passe.

## Ce qui est sécurisé automatiquement
- Tout compte qui a encore un mot de passe du README est **désactivé** au démarrage.
- Après 10 échecs de connexion, l'adresse est bloquée 15 minutes.
- La base est sur un disque permanent, sauvegardé par Render chaque jour ; le Pasteur peut aussi télécharger une sauvegarde depuis l'application.

## Si le mot de passe du Pasteur est oublié
Render → votre service → **Environment** : mettez un nouveau `ADMIN_PASSWORD` et ajoutez `RESET_ADMIN_PASSWORD` = `true`. Sauvegardez, puis **retirez** `RESET_ADMIN_PASSWORD` une fois connecté.

## Mises à jour
Modifiez un fichier sur GitHub → Render redéploie tout seul. Les données ne sont pas touchées.
