# Guide Complet de Déploiement & Mise en Ligne
## Application Web de Gestion d'École Primaire (Mono-École)
**Conforme à la Partie IV du Cahier des Charges (Options A, B, C, D et Checklist)**

---

## 1. Vue d'Ensemble des Options de Déploiement

| Option | Usage | Coût | URL & Caractéristiques |
| :--- | :---: | :---: | :--- |
| **A. Cloudflare Quick Tunnel** | Démonstration / Soutenance | Gratuit | URL temporaire `*.trycloudflare.com`, HTTPS automatique, aucun compte requis. |
| **B. Railway / Render / Zeabur** | Production simple recommandée | Gratuit à ~5 $/mois | URL stable HTTPS, base de données managée, build Git automatique. |
| **C. Nom de Domaine Personnalisé** | Production professionnelle | ~10-15 €/an | URL institutionnelle `https://ecole-aboukacem-chebbi.com` avec certificat SSL Let's Encrypt. |
| **D. VPS Classique (Docker)** | Contrôle total & Haute dispo | ~5 à 20 €/mois | Déploiement conteneurisé Docker-compose avec Nginx et MongoDB. |

---

## 2. Option A – Cloudflare Quick Tunnel (Démonstration Rapide)

Cette option permet de rendre instantanément l'application accessible sur Internet à distance (pour jury, démonstration sur smartphone 4G/5G, tests parents) sans configuration réseau ni ouverture de ports.

### Procédure sous Windows :
1. Démarrez l'application localement :
   ```powershell
   npm run build
   npm run start
   ```
2. Dans un terminal séparé, lancez le script fourni :
   ```powershell
   scripts\tunnel.bat
   ```
3. Cloudflare génère et affiche une URL publique HTTPS du type :
   `https://random-words-1234.trycloudflare.com`
4. Ouvrez cette adresse sur n'importe quel smartphone ou tablette pour accéder au portail.

---

## 3. Option B – Déploiement sur Railway ou Render (Production Simple)

Plateforme PaaS recommandée pour une école sans équipe technique dédiée.

### Déploiement avec Railway :
1. Créez un dépôt GitHub et poussez le code du projet :
   ```bash
   git init
   git add .
   git commit -m "feat: ecole primaire mern app complete"
   git push origin main
   ```
2. Rendez-vous sur [railway.app](https://railway.app) et connectez votre compte GitHub.
3. Créez un nouveau projet : **Deploy from GitHub repo**.
4. Ajoutez une base de données **MongoDB** ou **PostgreSQL** via le bouton `+`.
5. Dans l'onglet **Variables**, renseignez :
   - `NODE_ENV=production`
   - `PORT=5000`
   - `MONGO_URI=${{MongoDB.MONGO_URL}}`
   - `JWT_SECRET=cle_secrete_ultra_robuste_2026`
   - `ANNEE_SCOLAIRE=2026-2027`
   - `FRAIS_SCOLARITE=1200`
6. Railway construit automatiquement l'application via le [Dockerfile](file:///c:/Users/WE%20TEK/Downloads/ecole-mern/ecole-mern/Dockerfile) multi-stage et fournit un domaine HTTPS stable du type `https://ecole-app.up.railway.app`.

---

## 4. Option C – Nom de Domaine Personnalisé

Permet de lier l'application à un nom de domaine officiel comme `https://ecole-aboukacem-chebbi.com`.

1. **Achat du domaine :** Réserver le nom chez un registrar (OVH, Cloudflare Registrar, Namecheap, etc.) pour environ 10 à 15 €/an.
2. **Configuration DNS :**
   - Si hébergé sur Railway/Render : ajouter un enregistrement `CNAME` pointant vers l'URL fournie par la plateforme.
   - Si hébergé sur VPS : ajouter un enregistrement `A` pointant vers l'adresse IP publique du serveur.
3. **Certificat SSL :** Activation automatique et gratuite du cadenas vert HTTPS via Let's Encrypt.

---

## 5. Option D – VPS Classique avec Docker & Nginx (Contrôle Total)

Recommandé pour un déploiement autonome sur serveur Linux (Ubuntu 22.04 / 24.04 LTS).

### Procédure pas à pas :
1. Provisionner un VPS (OVH, DigitalOcean, AWS Lightsail, etc.)
2. Installer Docker et Docker-Compose :
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose
   ```
3. Cloner le projet sur le serveur :
   ```bash
   git clone <URL_DU_DEPOT> /var/www/ecole-mern
   cd /var/www/ecole-mern
   ```
4. Configurer les variables d'environnement dans `server/.env`.
5. Démarrer l'ensemble des conteneurs en arrière-plan :
   ```bash
   docker-compose up -d --build
   ```
6. Vérifier le bon fonctionnement des conteneurs :
   ```bash
   docker ps
   ```
   Trois services s'exécutent de concert :
   - `ecole-mongodb` : Base de données persistante
   - `ecole-app` : Application unifiée (API Express + Client Vite)
   - `ecole-nginx` : Reverse proxy avec compression gzip et sécurité HTTP

---

## 6. Checklist de Mise en Production (Chapitre 16 du CDC)

Avant toute mise en ligne officielle auprès des parents et élèves, vérifier impérativement :

- [x] **Nom de domaine stable :** URL mémorisable et pérenne configurée.
- [x] **HTTPS Obligatoire :** Certificat SSL actif (protection des données personnelles des enfants, RGPD).
- [x] **Base de données persistante :** Volume monté ou service MongoDB/PostgreSQL managé avec sauvegardes.
- [x] **Stockage des fichiers :** Dossier d'uploads configuré pour devoirs et reçus.
- [x] **Variables d'environnement :** Aucun secret ni mot de passe en clair dans le code source Git.
- [x] **Sauvegardes automatiques :** Tâche planifiée quotidienne avec rétention minimale de 30 jours (`scripts/backup.sh`).
- [x] **Champ `annee_scolaire` :** Présent sur l'ensemble des enregistrements pour assurer l'historique pluriannuel.
