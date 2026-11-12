# EduPilot – Plateforme SaaS de gestion scolaire

Application web **multi-établissements** et **multi-utilisateurs** de gestion d'écoles primaires, avec un module de **Business Intelligence et d'aide à la décision**. Projet pratique *Cloud & Big Data* (ISG Sousse).

| | |
|---|---|
| Frontend | React 18 + Vite, PWA installable, graphiques Recharts, icônes Lucide |
| Backend | Node.js / Express (API REST), JWT, bcrypt, Helmet, limitation de débit |
| Base de données | PostgreSQL (une base, isolation stricte par `school_id`) |
| Documents | Reçus et bulletins PDF générés côté serveur (PDFKit) |
| Notifications | Notifications in-app, e-mail SMTP/SendGrid (simulé et tracé si non configuré) |
| Déploiement | Docker, Render (`render.yaml`), Railway (`railway.json`), VPS (`docker-compose.yml`), Cloudflare Tunnel |

## Fonctionnalités

- **SaaS multi-écoles** : console éditeur (création d'établissements, offres, suspension), données isolées par établissement, assistance en contexte d'une école.
- **7 profils** : super-admin (éditeur), administrateur, directeur, enseignant, comptable, parent, élève – chacun avec ses droits (RBAC appliqué côté serveur en lecture *et* en écriture).
- **Scolarité** : dossiers élèves, pré-inscription en ligne avec affectation automatique, classes (contrôle des effectifs), matières (coefficients), salles, import/export CSV.
- **Emploi du temps** avec détection des conflits (enseignant, salle, classe).
- **Notes et bulletins** : saisie par trimestre, moyenne = 40 % contrôle continu + 60 % examen, moyenne générale pondérée, rang, bulletin PDF.
- **Absences et retards** avec justification en ligne par les parents et validation.
- **Finances** : grille tarifaire par année et niveau, paiements, **reçu PDF + message automatique au parent** (montant, date, mode, solde, lien du reçu) avec journal des envois, relances automatiques quotidiennes, dépenses.
- **Devoirs** : publication (notification élèves/parents), dépôt de fichiers, statut rendu / en retard / noté, correction, corrigé, marquage « vu » par les parents.
- **Messagerie** : canaux autorisés par rôle, messages envoyés immuables, brouillons, masquage côté destinataire, accusés de lecture, journalisation des consultations ; **annonces** immuables avec correctifs.
- **Traçabilité et RGPD** : journal d'audit (anciennes / nouvelles valeurs), suppression logique contrôlée, consentement, portabilité (export JSON), droit à l'effacement (anonymisation).

### Module Business Intelligence (10 tableaux de bord)

Vue générale · Finances (prévision des recettes) · Pédagogie · Absences (corrélation absences/résultats) · Enseignants (charge, remplacements) · Inscriptions et fidélisation (prévision N+1) · Communication parents · Ressources et emplois du temps · **Alertes précoces** (score de risque échec / abandon / impayé) · **Stratégie** (simulateur de scénarios, comparaison pluriannuelle, recommandations automatiques).
Détails des indicateurs et des méthodes : [docs/MODULE_BI.md](docs/MODULE_BI.md).

## Démarrage local

Prérequis : Node.js 20+, PostgreSQL 14+.

```bash
cd server && npm install && cp .env.example .env    # renseigner DATABASE_URL
cd ../client && npm install
cd .. && npm run seed                                 # crée le schéma + 3 écoles de démonstration
npm run dev:server                                    # API sur http://localhost:5000
npm run dev                                           # interface sur http://localhost:5173
```

Au premier démarrage sur une base vide, le serveur crée automatiquement le schéma et les données de démonstration.

Tests automatisés (authentification, isolation multi-écoles, RBAC, règles métier, BI) :

```bash
npm test -- http://localhost:5000
```

## Comptes de démonstration

Trois établissements de démonstration (Sousse, Tunis, Sfax), chacun avec un compte par profil : `<rôle>@<domaine-école>` (ex. `directeur@chebbi.demo.tn`). La liste complète et les mots de passe temporaires figurent dans le document Word `docs/Identifiants_EduPilot.docx` (généré par `npm run docs`). Aucune donnée personnelle réelle n'est utilisée.

## Déploiement

Voir [docs/GUIDE_DEPLOIEMENT.md](docs/GUIDE_DEPLOIEMENT.md) : Render (recommandé), Railway, VPS Docker + Nginx + Let's Encrypt, Cloudflare Tunnel pour une démonstration.

## Structure

```
client/src/        App.jsx (navigation), pages/ (écrans), ui/ (composants, graphiques), lib/ (API, formats)
server/            index.js, config.js, routes/ (core, scolarite, bi), lib/ (crud, scope, bi, metier, pdf, notify, audit)
server/seed.js     générateur de données de démonstration (3 écoles × 3 années)
database/schema.sql
docs/              guides utilisateurs, déploiement, sauvegarde, schéma, module BI
```
