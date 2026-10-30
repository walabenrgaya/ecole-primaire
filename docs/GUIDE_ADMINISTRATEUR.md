# Guide Utilisateur – Administrateur / Direction
## Application Web de Gestion d'École Primaire (Mono-École)
**Conforme aux Livrables du Cahier des Charges (Chapitre 21)**

---

## 1. Connexion & Tableau de Bord
- **URL :** `http://localhost:5000` (ou domaine de production).
- **Identifiants par défaut :** `admin@ecole.tn` / `Admin123!`.
- **Tableau de Bord :** Dès la connexion, vous disposez d'une vue synthétique sur :
  - Le nombre total d'élèves inscrits.
  - Le montant global des frais scolaires perçus.
  - Le montant des impayés à recouvrer et le taux de recouvrement.
  - Les dernières annonces officielles et les raccourcis d'administration.

---

## 2. Gestion des Dossiers Élèves & Inscriptions
1. Rendez-vous dans l'onglet **Élèves**.
2. **Ajouter un élève :** Cliquez sur `+ Ajouter` et renseignez les informations d'état civil, coordonnées du tuteur et classe d'affectation.
3. **Contrôle de Capacité :** Si la capacité de la classe choisie est atteinte, le système vous affiche une confirmation explicite avant d'autoriser l'inscription exceptionnelle.
4. **Impression de Bulletin :** Cliquez sur le bouton `📜 Bulletin` sur la ligne d'un élève pour ouvrir son bulletin officiel avec moyennes pondérées et appréciation, prêt à imprimer.
5. **Export CSV :** Cliquez sur `📥 Exporter CSV` pour télécharger l'annuaire complet des élèves au format tableur standard.

---

## 3. Validation des Pré-inscriptions en Ligne
1. Accédez à l'onglet **Inscriptions en ligne**.
2. Les demandes soumises par les familles depuis le portail public apparaissent avec le statut `en_attente`.
3. Cliquez sur `✓ Valider` après avoir sélectionné la classe d'accueil.
4. **Action automatique :** Le système crée immédiatement le dossier élève, génère le compte d'accès pour le parent et lui transmet une notification de confirmation.

---

## 4. Emploi du Temps Hebdomadaire & Conflits
1. Accédez à l'onglet **Emploi du temps**.
2. Visualisez la grille de cours organisée du Lundi au Samedi.
3. Cliquez sur `+ Ajouter un cours` :
   - Sélectionnez la classe, la matière, l'enseignant, la salle, le jour et la plage horaire.
4. **Détection Automatique des Conflits :** Si la salle ou l'enseignant est déjà occupé sur la même tranche horaire, le système bloque la saisie et indique précisément la source du conflit.

---

## 5. Gestion des Utilisateurs & Journal d'Audit
- **Onglet Comptes Utilisateurs :** Permet de créer, éditer les rôles (Enseignant, Parent, Élève, Comptable) et réinitialiser les mots de passe.
- **Onglet Journal d'Audit :** Consigne chronologiquement toutes les opérations sensibles (connexions, modifications de notes, encaissements, envois de messages) pour assurer la traçabilité intégrale exigée par les normes de sécurité.

---

## 6. Publication des Annonces Officielles
1. Accédez à l'onglet **Annonces officielles**.
2. Cliquez sur `+ Publier une Annonce`.
3. Choisissez le titre, le texte et le public cible (Tous, Parents uniquement, Enseignants uniquement, Élèves uniquement).
4. **Règle d'Immuabilité :** Une fois publiée, l'annonce est certifiée et ne peut plus être supprimée ou modifiée. En cas de rectification, une annonce corrective doit être émise.
