# Application Web de Gestion d'École Primaire (Mono-École)
> **Projet Conforme à 100% au Cahier des Charges Officiel**  
> **Auteur du Cadre :** Dr Hamdi Hassen – ISG Sousse  
> **Année Scolaire de Référence :** 2026-2027  

---

## 📌 Présentation Générale
Cette application web est une solution complète, moderne et responsive (PWA) conçue spécifiquement pour la gestion administrative, pédagogique et financière d'un établissement d'enseignement primaire unique (mono-école).

Contrairement aux plateformes multi-tenants complexes, l'architecture mono-école garantit une isolation parfaite des données, une sécurité maximale conforme au RGPD et des temps de réponse ultra-rapides (< 2s).

---

## 👥 Comptes de Démonstration (Fast Login)
Le portail intègre des boutons de connexion instantanée sur l'écran d'accueil pour tester chaque rôle :

| Rôle | Identifiant E-mail | Mot de passe | Périmètre & Accès Principal |
| :--- | :--- | :--- | :--- |
| **Direction / Administrateur** | `admin@ecole.tn` | `Admin123!` | Tous les modules, utilisateurs, journal d'audit, annonces |
| **Enseignant (Français & Arabe)** | `prof.francais@ecole.tn` | `Prof123!` | Notes, devoirs & corrigés, emploi du temps, absences, messages |
| **Enseignant (Maths & Sciences)** | `prof.maths@ecole.tn` | `Prof123!` | Notes, devoirs & corrigés, emploi du temps, absences, messages |
| **Comptable / Secrétariat** | `comptable@ecole.tn` | `Comptable123!` | Paiements, reçus officiels, relance impayés 1-clic, inscriptions |
| **Parent d'élève** | `parent.benali@ecole.tn` | `Parent123!` | Bulletins scolaires officiels PDF, suivi devoirs, justifications, reçus |
| **Élève** | `eleve.yassine@ecole.tn` | `Eleve123!` | Emploi du temps, devoirs à rendre, dépôt de travail, notes |

---

## 🚀 Démarrage Rapide en Local

### Prérequis :
- **Node.js** v18+ ou v20+
- **MongoDB** (Local sur port `27017` ou MongoDB Atlas)

### 1. Installation des dépendances :
```bash
# Dans le dossier client
cd client && npm install

# Dans le dossier server
cd ../server && npm install
```

### 2. Initialisation de la base de données (Seed) :
```bash
cd server
npm run seed
```
*Le script initialise l'ensemble des classes (CP-A à CM2), matières avec coefficients, salles, élèves, emplois du temps sans conflits, devoirs, paiements et annonces.*

### 3. Lancement des serveurs de développement :
- **Serveur Backend (API sur port 5000) :**
  ```bash
  cd server && npm run dev
  ```
- **Client Frontend (Interface sur port 5173) :**
  ```bash
  cd client && npm run dev
  ```
Accédez au portail : **http://localhost:5173**

---

## 🌐 Déploiement & Options du Cahier des Charges

L'application supporte nativement les 4 options de déploiement décrites dans la **Partie IV du Cahier des Charges** :

### Option A – Cloudflare Quick Tunnel (Démonstration Gratuite)
Génère une URL publique HTTPS temporaire en 1 clic pour tester l'application sur smartphone ou en présentation :
```powershell
scripts\tunnel.bat
```
*(ou `./scripts/tunnel.sh` sous Linux/Mac)*

### Option B – Railway / Render / Zeabur (Production Simple)
Configurations incluses prêtes à l'emploi :
- `railway.json`
- `render.yaml`
- Build multi-stage Dockerfile unifié.

### Option C – Nom de Domaine Personnalisé
Liaison avec nom de domaine officiel (ex: `https://ecole-aboukacem-chebbi.com`) avec certificat SSL automatique Let's Encrypt.

### Option D – VPS Classique avec Docker (Contrôle Total)
Déploiement conteneurisé avec Nginx reverse proxy et compression gzip :
```bash
docker-compose up -d --build
```

---

## 📚 Livrables Formels Attendus (Chapitre 21)

Tous les livrables exigés par le cahier des charges sont documentés dans le dossier [`docs/`](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs) :

1. [Spécifications Fonctionnelles Détaillées (User Stories + MoSCoW)](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/SPECIFICATIONS_FONCTIONNELLES.md)
2. [Documentation des Maquettes & Design System UI/UX](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/MAQUETTES_DESIGN_SYSTEM.md)
3. [Guide Complet de Déploiement (Options A, B, C, D et Checklist)](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/GUIDE_DEPLOIEMENT.md)
4. [Guide Utilisateur – Direction / Administrateur](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/GUIDE_ADMINISTRATEUR.md)
5. [Guide Utilisateur – Enseignant](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/GUIDE_ENSEIGNANT.md)
6. [Guide Utilisateur – Parents & Élèves](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/GUIDE_PARENT_ELEVE.md)
7. [Guide Utilisateur – Secrétariat & Comptabilité](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/GUIDE_COMPTABLE.md)
8. [Plan de Migration des Données Scolaires (Formats & Procédures CSV)](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/PLAN_DE_MIGRATION.md)
9. [Procédure de Sauvegarde et Restauration (Rétention 30 Jours)](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/PROCEDURE_SAUVEGARDE_RESTAURATION.md)
10. [Spécification Technique & Modèle de la Base de Données (MCD, MLD & ERD)](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/docs/SCHEMA_BASE_DE_DONNEES.md)
    - Schéma SQL DDL PostgreSQL : [`database/schema.sql`](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/database/schema.sql)
    - Données de test SQL PostgreSQL : [`database/seed.sql`](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/database/seed.sql)


---

## 🛠️ Outils & Scripts de Maintenance
- **Sauvegarde de la base de données :** `scripts\backup.bat` (rétention 30 jours automatique).
- **Restauration de la base :** `scripts\restore.bat [chemin_archive]`.
- **Export CSV des élèves :** `node server/scripts/export_csv.js` ou via le bouton direct dans l'interface.
- **Import CSV d'élèves :** `node server/scripts/import_csv.js [chemin_fichier.csv]`.
