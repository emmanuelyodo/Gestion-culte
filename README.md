# ⛪ EcclesiaManager - Mission Apostolique de Pentecôte (MAP) • Temple Ébénézer

Application web complète de gestion d'assemblée et de suivi pastoral, 100 % en français, responsive (**Mobile-First** pour smartphones, tablettes et ordinateurs), sécurisée et adaptée aux responsables non techniques.

---

## 🏛️ Identité de l'Assemblée
- **Nom de l'église** : Mission Apostolique de Pentecôte (MAP) - Temple Ébénézer
- **Départements intégrés** :
  1. **Département des Enfants** (Éveil spirituel et formation biblique)
  2. **Département des Jeunes** (Jeunesse, étudiants et jeunes professionnels)
  3. **Département des Femmes** (Fraternité et ministère des femmes et mères)
  4. **Département des Hommes** (Communauté des hommes, pères et serviteurs)
  5. **Département de la Louange** (Chantres, musiciens et audiovisuel)
  6. **Département d'Intercession & Accueil** (Prière fervente, protocole et accueil)

---

## 🔑 Identifiants & Mots de Passe Dédiés par Responsable

Chaque responsable possède un compte séparé, un identifiant de connexion et un mot de passe sécurisé. Les permissions sont automatiquement ajustées selon la fonction et le département assigné :

| Responsable | Fonction / Département | Identifiant (Email) | Mot de passe | Périmètre d'Accès |
|---|---|---|---|---|
| **Pasteur Principal** | Direction générale & Pastorale | `pasteur@map-ebenezer.org` | `pasteur123` | **Accès Total** : Tableau de bord, tous les modules, création de comptes responsables, notes pastorales, audits et paramètres. |
| **Secrétaire Général** | Secrétariat de l'église | `secretaire@map-ebenezer.org` | `secret123` | **Secrétariat** : Répertoire des membres, pointage des présences, calendrier, baptêmes. |
| **Trésorier de l'Église** | Finances & Caisse | `tresorier@map-ebenezer.org` | `tresor123` | **Accès Exclusif Finances** : Entrées (dîmes, offrandes), workflow de dépenses, budgets, reçus de dons et clôture verrouillée. |
| **Responsable des Jeunes** | Département des Jeunes | `jeunes@map-ebenezer.org` | `jeunes123` | **Son département uniquement** : Membres jeunes, dépôt des rapports réguliers, score de santé des jeunes, projets jeunesse. |
| **Responsable des Femmes** | Département des Femmes | `femmes@map-ebenezer.org` | `femmes123` | **Son département uniquement** : Membres femmes, rapports, projets et santé du département des femmes. |
| **Responsable des Hommes** | Département des Hommes | `hommes@map-ebenezer.org` | `hommes123` | **Son département uniquement** : Fraternité des hommes, rapports périodiques et suivi des hommes. |
| **Responsable des Enfants** | Département des Enfants | `enfants@map-ebenezer.org` | `enfants123` | **Son département uniquement** : Classes des enfants, assiduité et rapports d'activité. |
| **Responsable de la Louange**| Département de la Louange | `louange@map-ebenezer.org` | `louange123` | **Son département uniquement** : Équipe de louange, répétitions, rapports et besoins matériels. |
| **Resp. Intercession** | Intercession & Accueil | `intercession@map-ebenezer.org`| `priere123` | **Son département uniquement** : Sentinelles de prière, veillées, chaîne d'intercession et accueil. |
| **Fidèle / Membre** | Membre simple | `membre@map-ebenezer.org` | `membre123` | **Espace Membre** : Consultation de son profil et du calendrier des cultes et activités. |

---

## 👥 Comment Créer ou Modifier les Accès Responsables

En tant que **Pasteur Principal (Administrateur)** :
1. Connectez-vous avec vos identifiants ou sélectionnez **Pasteur Principal** dans le sélecteur d'accès en haut à droite.
2. Cliquez sur l'onglet **🔑 Comptes & Responsables** dans le menu de gauche.
3. Cliquez sur **➕ Créer un Compte Responsable** pour ajouter un nouveau responsable :
   - Renseignez son nom complet.
   - Attribuez-lui un identifiant (ex. `adjoint.jeunes@map-ebenezer.org`).
   - Définissez son mot de passe initial.
   - Choisissez son rôle et sélectionnez son département de rattachement.
4. Pour changer ou réinitialiser le mot de passe d'un responsable existant, cliquez simplement sur le bouton **🔑 MDP** sur sa ligne.

---

## 🚀 Comment Lancer l'Application

1. Placez ces fichiers dans le dossier du projet (à côté de `public/` et `assemblee.db`), en remplaçant les anciens.
2. Double-cliquez sur **`start.bat`** et **laissez la fenêtre noire ouverte** (la fermer arrête le serveur).
3. Le navigateur s'ouvre sur 👉 **http://localhost:3000**

**Prérequis** : Node.js **22.5 ou plus récent** (module `node:sqlite`). Vérifiez avec `node --version`.

**Dossier attendu** :
```
assemblee-manager/
├── public/          ← interface (index.html, CSS, JS) — indispensable
├── assemblee.db     ← base de données
├── server.js  cron.js  database.js  seed.js  test_app.js
└── start.bat
```

## 🔒 Avant une mise en ligne réelle
- Changez **tous** les mots de passe par défaut ci-dessus.
- Faites des sauvegardes régulières de `assemblee.db` (menu Sauvegarde du Pasteur).
