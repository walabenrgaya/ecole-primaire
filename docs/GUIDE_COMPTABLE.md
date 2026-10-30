# Guide Utilisateur – Secrétariat & Comptabilité
## Application Web de Gestion d'École Primaire (Mono-École)
**Conforme aux Livrables du Cahier des Charges (Chapitre 21)**

---

## 1. Rôle et Périmètre du Secrétariat Financier
Le comptable a la responsabilité exclusive de :
- L'enregistrement des règlements des familles (Scolarité, Frais d'inscription).
- L'émission immédiate des reçus de paiement certifiés.
- Le suivi en temps réel du taux de recouvrement de l'établissement.
- La relance automatique des familles débitrices.
- L'instruction administrative des demandes de pré-inscription.

**Identifiant par défaut :** `comptable@ecole.tn` / `Comptable123!`

---

## 2. Enregistrement d'un Règlement & Émission de Reçu
1. Accédez à l'onglet **Paiements**.
2. Cliquez sur `+ Ajouter` :
   - Sélectionnez l'élève concerné.
   - Indiquez le montant en Dinars Tunisiens (TND).
   - Choisissez le mode de paiement : *Espèces*, *Virement bancaire*, ou *Mobile money*.
   - Précisez la nature de la tranche (*Scolarité T1*, *Scolarité T2*, *Frais Inscription*...).
3. Cliquez sur `Enregistrer`.
4. **Effets automatiques du système :**
   - Attribution d'un numéro de reçu unique : `REC-2026-XXXXXX`.
   - Calcul et mise à jour du nouveau solde restant de l'élève.
   - Envoi immédiat d'un message interne et d'un e-mail au parent avec le détail du versement et le lien de son reçu.
   - Inscription de l'encaissement dans le journal d'audit général.
5. Cliquez sur le bouton `🖨️ Reçu` pour imprimer le reçu officiel signé et tamponné pour les parents réglant au guichet.

---

## 3. Tableau de Bord Financier & Suivi des Impayés
1. Accédez à l'onglet **Finances & Impayés**.
2. **Indicateurs Clés (KPIs) :**
   - **Total Encaissé :** Montant cumulé effectif en caisse et sur le compte bancaire.
   - **Impayés Restants :** Différence entre les frais annuels dus (nb élèves × 1200 TND) et les encaissements.
   - **Taux de Recouvrement :** Pourcentage d'avancement de la rentrée financière.
3. **Tableau des Dossiers Débiteurs :** Liste nominative des élèves présentant un solde restant avec coordonnées téléphoniques et e-mail des parents.

---

## 4. Relance Automatique des Familles Débitrices (1-Clic)
Pour chaque élève apparaissant dans le tableau des impayés :
1. Cliquez sur le bouton `✉️ Relancer le parent`.
2. Le système génère automatiquement un message officiel rappelant le solde exact restant dû pour l'année scolaire en cours.
3. Le message est notifié au parent dans son espace personnel et envoyé sur sa boîte e-mail.
4. L'opération est horodatée et archivée dans le journal d'audit pour éviter les doublons de relance.
