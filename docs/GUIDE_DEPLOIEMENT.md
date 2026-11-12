# Guide de déploiement

L'application est un seul service (API Express qui sert aussi l'interface React compilée) relié à une base PostgreSQL. Au premier démarrage sur une base vide, le schéma et les données de démonstration sont créés automatiquement.

| Option | Usage | Coût | URL |
|---|---|---|---|
| A. Cloudflare Quick Tunnel | Démonstration | Gratuit | `https://xxxx.trycloudflare.com` (change à chaque lancement) |
| **B. Render** (recommandé) | Production simple | Gratuit / ~7 $ par mois | `https://edupilot.onrender.com` |
| B'. Railway | Production simple | ~5 $ par mois | `https://xxx.up.railway.app` |
| C. Domaine personnalisé | Production professionnelle | ~10–15 € par an | `https://votre-ecole.tn` |
| D. VPS Docker | Contrôle total | 5–20 € par mois | domaine + Let's Encrypt |

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

## Option B – Render (recommandée)

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

## Option D – VPS (Ubuntu + Docker)

```bash
git clone <dépôt> && cd ecole-mern
printf "POSTGRES_PASSWORD=%s\nJWT_SECRET=%s\nPUBLIC_URL=https://votre-domaine.tn\n" "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" > .env
docker compose up -d --build
sudo certbot certonly --standalone -d votre-domaine.tn   # avant de lancer nginx, ou via webroot
```

Décommenter ensuite le bloc HTTPS de `nginx/nginx.conf` et redémarrer `nginx`.

## Checklist avant mise en ligne

- [ ] HTTPS actif (fourni par Render/Railway, Let's Encrypt sur VPS)
- [ ] `JWT_SECRET` long et aléatoire, aucun secret dans le dépôt
- [ ] Base PostgreSQL managée et sauvegardes quotidiennes (voir `PROCEDURE_SAUVEGARDE_RESTAURATION.md`)
- [ ] `PUBLIC_URL` renseignée
- [ ] Mots de passe de démonstration remplacés avant toute utilisation réelle
