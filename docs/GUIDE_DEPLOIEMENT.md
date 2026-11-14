# Guide de déploiement

L'application est un seul service (API Express qui sert aussi l'interface React compilée) relié à une base PostgreSQL. Au premier démarrage sur une base vide, le schéma et les données de démonstration sont créés automatiquement.

| Option | Usage | Coût | URL |
|---|---|---|---|
| A. Cloudflare Quick Tunnel | Démonstration | Gratuit | `https://xxxx.trycloudflare.com` (change à chaque lancement) |
| B. Render | Production simple | Gratuit / ~7 $ par mois | `https://edupilot.onrender.com` |
| B'. Railway | Production simple | ~5 $ par mois | `https://xxx.up.railway.app` |
| C. Domaine personnalisé | Production professionnelle | ~10–15 € par an | `https://votre-ecole.tn` |
| **D. Serveur Linux + Nextcloud** (retenu) | Production SaaS avec espace documentaire | 0–6 € par mois | `https://edupilot.<ip>.sslip.io` + `https://cloud.<ip>.sslip.io` |

## Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | oui | Chaîne de connexion PostgreSQL |
| `JWT_SECRET` | oui en production | Secret de signature des sessions (longue chaîne aléatoire) |
| `PUBLIC_URL` | recommandé | URL publique, utilisée dans les liens des reçus envoyés aux parents |
| `ANNEE_SCOLAIRE` | non | Année courante (défaut `2026-2027`) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | non | Envoi réel des e-mails (SendGrid : `smtp.sendgrid.net`, utilisateur `apikey`) |
| `AUTO_RELANCES` | non | `false` pour désactiver les relances quotidiennes des impayés |

Ne jamais mettre de secret dans le code : `server/.env` est ignoré par Git et par Docker.

## Option B – Render

1. Pousser le dépôt sur GitHub.
2. Sur https://dashboard.render.com : **New → Blueprint**, choisir le dépôt. Le fichier `render.yaml` crée le service web (Docker) et la base PostgreSQL, et génère `JWT_SECRET`.
3. Une fois l'URL connue, renseigner `PUBLIC_URL` (ex. `https://edupilot.onrender.com`) dans *Environment*, puis redéployer.
4. Vérifier `https://<url>/api/health` puis se connecter avec un compte de démonstration.

Offre gratuite : le service s'endort après 15 min d'inactivité (premier chargement ~30 s) et la base gratuite expire après 30 jours – suffisant pour la soutenance.

## Option B' – Railway

1. **New Project → Deploy from GitHub repo**.
2. Ajouter **PostgreSQL** (bouton +). Dans le service web, ajouter `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JWT_SECRET`, `NODE_ENV=production`, `PUBLIC_URL`.
3. *Settings → Networking → Generate Domain*.

## Option A – Cloudflare Quick Tunnel (démonstration)

```bash
npm run build          # compile l'interface dans client/dist
npm start              # sert l'application sur http://localhost:5000
cloudflared tunnel --url http://localhost:5000
```

## Option C – Nom de domaine

Acheter le domaine, puis chez Render : *Settings → Custom Domains*, ajouter l'enregistrement `CNAME` indiqué chez le registrar. Le certificat HTTPS est émis automatiquement.

## Option D – Serveur Linux avec Nextcloud (déploiement retenu)

Pile Docker (`docker-compose.yml`) sur un seul serveur Ubuntu :

| Service | Rôle |
|---|---|
| `app` | EduPilot (API + interface) |
| `db` | PostgreSQL 16 : base `ecole` (application) et base `nextcloud` |
| `nextcloud` | Espace documentaire : dépôts des élèves, pièces jointes et reçus PDF archivés par établissement (`EduPilot/<code-école>/recus/<année>/`) |
| `caddy` | Reverse proxy HTTPS, certificats Let's Encrypt automatiques |

EduPilot écrit et lit les fichiers dans Nextcloud par WebDAV (réseau Docker interne). Sans variables `NEXTCLOUD_*`, il revient au stockage sur disque.

**Installation (une commande, sur un serveur Ubuntu 22.04/24.04 avec les ports 80 et 443 ouverts) :**

```bash
curl -fsSL https://raw.githubusercontent.com/walabenrgaya/ecole-primaire/refonte-bi-securite/scripts/installer-serveur.sh | sudo bash
```

Le script installe Docker, récupère le code dans `/opt/edupilot`, génère les secrets dans `.env` et démarre la pile. Sans nom de domaine, il utilise `sslip.io` à partir de l'adresse IP publique :

- application : `https://edupilot.<ip-avec-tirets>.sslip.io`
- Nextcloud : `https://cloud.<ip-avec-tirets>.sslip.io` (compte `admin`, mot de passe dans `/opt/edupilot/.env`)

Avec un vrai domaine : `APP_DOMAIN=ecole.tn CLOUD_DOMAIN=cloud.ecole.tn` devant la commande, après avoir pointé les deux noms (enregistrements `A`) vers l'IP du serveur.

Serveurs possibles : VPS Hetzner ou OVH (~4–6 € par mois, 2 Go de RAM minimum), Oracle Cloud « Always Free » (VM Ampere A1, gratuite ; ouvrir aussi les ports 80/443 dans la *Security List* du réseau virtuel), ou une VM fournie par l'établissement.

Mise à jour : relancer la même commande (le `.env` existant est conservé). Journaux : `cd /opt/edupilot && docker compose logs -f app nextcloud caddy`.

## Checklist avant mise en ligne

- [ ] HTTPS actif (fourni par Render/Railway, Let's Encrypt sur VPS)
- [ ] `JWT_SECRET` long et aléatoire, aucun secret dans le dépôt
- [ ] Base PostgreSQL managée et sauvegardes quotidiennes (voir `PROCEDURE_SAUVEGARDE_RESTAURATION.md`)
- [ ] `PUBLIC_URL` renseignée
- [ ] Mots de passe de démonstration remplacés avant toute utilisation réelle
