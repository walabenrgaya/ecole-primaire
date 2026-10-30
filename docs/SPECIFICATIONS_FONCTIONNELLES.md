# Cahier des Spécifications Fonctionnelles Détaillées
## Application Web de Gestion d'École Primaire (Mono-École)
**Institution :** ISG Sousse  
**Auteur du Cadre :** Dr Hamdi Hassen  
**Année Scolaire :** 2026-2027  
**Statut du Document :** Livrable Final Conforme au Cahier des Charges  

---

## 1. Contexte et Objectifs Métier

### 1.1 Contexte Général
Le projet consiste en une solution logicielle complète de gestion scolaire destinée à un établissement primaire unique (mono-école). L'architecture élimine volontairement la complexité superflue du multi-tenancy SaaS pour concentrer 100% de la valeur sur les processus pédagogiques et administratifs quotidiens de l'école :
- Inscription et dossiers des élèves
- Organisation des classes, matières et salles
- Emploi du temps dynamique avec détection d'interférences
- Évaluations, calcul des moyennes pondérées et bulletins scolaires officiels
- Gestion financière des frais de scolarité, reçus automatisés et relance d'impayés
- Gestion des devoirs à domicile (Homework) avec cycle complet de dépôt et correction
- Messagerie interne sécurisée et traçable avec immuabilité certifiée des messages envoyés
- Annonces officielles de la direction

### 1.2 Objectifs Quantifiables
- **Gain de temps :** Réduction de 40 % du temps de saisie administrative.
- **Centralisation :** 100 % des dossiers élèves et historiques consolidés dans une base de données unique avec colonne `annee_scolaire`.
- **Temps réel :** Consultation instantanée des notes, absences, devoirs et soldes pour les familles.
- **Multi-plateforme :** Accès fluide sur ordinateurs, tablettes et smartphones (PWA responsive).

---

## 2. Matrice des Rôles & Droits d'Accès (RBAC)

| Entité / Module | Administrateur / Direction | Enseignant | Parent | Élève | Comptable / Secrétariat |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Classes & Salles** | CRUD Total | Consultation | Consultation | Consultation | Consultation |
| **Matières** | CRUD Total | Consultation | Consultation | Consultation | Consultation |
| **Élèves (Dossiers)** | CRUD Total | Consultation (affectés) | Consultation (ses enfants) | Consultation (soi-même) | CRUD (Inscriptions) |
| **Pré-inscriptions** | Validation / Rejet | - | Soumission formulaire | - | Validation / Rejet |
| **Emploi du temps** | CRUD Total (Gestion conflits) | Consultation (son planning) | Consultation (ses enfants) | Consultation (sa classe) | Consultation |
| **Notes & Évaluations** | CRUD Total | Saisie / Édition (ses cours) | Consultation (ses enfants) | Consultation (ses notes) | - |
| **Bulletins Officiels** | Consultation & Impression | Consultation | Consultation & Impression PDF | Consultation | - |
| **Absences** | CRUD Total | Saisie & Validation justif. | Consultation & Justification | Consultation | - |
| **Paiements & Reçus** | CRUD Total | - | Consultation & Reçus PDF | - | CRUD Total (Reçus auto) |
| **Relances Impayés** | Déclenchement 1-clic | - | Réception rappels | - | Déclenchement 1-clic |
| **Devoirs (Homework)** | Consultation & Gestion | Création, Dépôt corrigé, Notation | Consultation & Suivi ("Vu") | Dépôt travaux, Consultation | - |
| **Messagerie Interne** | Envoi à tous rôles | Vers Parents de ses élèves & Admin | Vers Enseignants & Admin | Vers Enseignants & Admin | Vers Parents & Admin |
| **Annonces Générales** | Publication (Immuable) | Consultation | Consultation | Consultation | Consultation |
| **Comptes Utilisateurs** | CRUD Total | - | - | - | - |
| **Journal d'Audit** | Consultation intégrale | - | - | - | - |

---

## 3. User Stories par Acteur

### 3.1 Administrateur / Direction
- **US-DIR-01 :** En tant que Directeur, je peux administrer l'ensemble des classes et définir leur capacité maximale, avec blocage automatique en cas de dépassement d'effectif.
- **US-DIR-02 :** En tant que Directeur, je peux générer l'emploi du temps hebdomadaire avec une détection automatique des conflits de salles ou d'enseignants.
- **US-DIR-03 :** En tant que Directeur, je peux valider les pré-inscriptions en ligne et créer automatiquement le dossier élève et le compte parent associé.
- **US-DIR-04 :** En tant que Directeur, je peux publier une annonce officielle immuable destinée à toute l'école ou à un groupe d'acteurs ciblé.
- **US-DIR-05 :** En tant que Directeur, je peux consulter le journal d'audit chronologique de toutes les actions sensibles pour garantir la sécurité et la traçabilité.

### 3.2 Enseignant
- **US-ENS-01 :** En tant qu'enseignant, je peux saisir et modifier les notes de mes évaluations (Contrôle continu, Examens trimestriels) avec barème sur 20.
- **US-ENS-02 :** En tant qu'enseignant, je peux publier un devoir avec description, date limite de remise et consignes.
- **US-ENS-03 :** En tant qu'enseignant, je peux consulter la liste des devoirs rendus par mes élèves, attribuer une note, un commentaire et joindre le corrigé officiel.
- **US-ENS-04 :** En tant qu'enseignant, je peux signaler une absence et valider les motifs de justification transmis par les parents.

### 3.3 Parent d'Élève
- **US-PAR-01 :** En tant que parent, je peux me connecter et visualiser les dossiers de mes enfants inscrits.
- **US-PAR-02 :** En tant que parent, je peux consulter le bulletin scolaire officiel avec calcul automatique des moyennes pondérées par coefficients et l'imprimer au format PDF.
- **US-PAR-03 :** En tant que parent, je peux suivre les devoirs de mes enfants et cliquer sur "Marquer comme vu".
- **US-PAR-04 :** En tant que parent, je peux justifier une absence de mon enfant en soumettant un motif en ligne.
- **US-PAR-05 :** En tant que parent, je peux consulter l'historique des règlements financiers, mon solde restant dû et télécharger les reçus officiels.

### 3.4 Élève
- **US-ELE-01 :** En tant qu'élève, je peux consulter mon emploi du temps hebdomadaire interactif.
- **US-ELE-02 :** En tant qu'élève, je peux consulter mes devoirs à rendre et déposer mon travail ou fichier joint avant la date d'échéance.
- **US-ELE-03 :** En tant qu'élève, je peux visualiser la note obtenue, les commentaires de mon professeur et le corrigé officiel.

### 3.5 Comptable / Secrétariat
- **US-CPT-01 :** En tant que comptable, je peux enregistrer un paiement (Espèces, Virement, Mobile money), ce qui génère automatiquement un reçu numéroté et notifie le parent par message interne et e-mail.
- **US-CPT-02 :** En tant que comptable, je dispose d'un tableau de bord de recouvrement avec le taux de recouvrement, le total encaissé et la liste des impayés.
- **US-CPT-03 :** En tant que comptable, je peux déclencher une relance automatique en 1 clic pour notifier les parents dont les soldes sont débiteurs.

---

## 4. Critères d'Acceptation (Vérification de Conformité)
1. **Création sans assistance :** L'administrateur peut créer, modifier et supprimer des classes, matières, salles et enseignants directement via l'IHM.
2. **Accès Parent certifié :** Un parent connecté accède en temps réel aux notes, bulletins, emplois du temps et devoirs de ses enfants uniquement.
3. **Moyennes pondérées conformes :** Le calcul de la moyenne générale applique rigoureusement les coefficients des matières et affiche la mention officielle.
4. **Notification et reçu automatique :** Tout versement financier met à jour le solde instantanément, émet un reçu numéroté et envoie un message au parent.
5. **Immuabilité des messages et annonces :** Les messages envoyés et annonces publiées ne peuvent pas être altérés ni supprimés.
6. **Accessibilité multi-appareils :** L'application est responsive, supporte le mode sombre et est installable en PWA sur smartphone.
