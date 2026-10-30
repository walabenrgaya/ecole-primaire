# Plan de Migration des Données Scolaires
## Reprise de l'Existant vers la Plateforme MERN Mono-École
**Conforme aux Livrables du Cahier des Charges (Chapitre 21)**

---

## 1. Objectifs & Périmètre de la Migration
Ce document formalise la procédure technique permettant de migrer les données d'un établissement scolaire disposant d'un système préexistant (fichiers Excel, exports Access, ancienne base SQL) vers la nouvelle application.

### Données éligibles à la migration :
1. **Dossiers des élèves et états civils** (Nom, prénom, date de naissance, genre, antécédents médicaux).
2. **Coordonnées des parents et tuteurs légaux** (Nom, téléphone, e-mail).
3. **Structure des classes et matières** (Niveaux CP à CM2, sections, coefficients).
4. **Historique des règlements financiers** de l'année scolaire de référence.

---

## 2. Format de Fichier Pivot (Spécification CSV)

Le format pivot retenu pour l'importation est le standard CSV UTF-8 avec séparateur point-virgule (`;`) et encadrement textuel par guillemets (`"`).

### Schéma du fichier `eleves_import.csv` :
```csv
"ID";"Nom";"Prenom";"DateNaissance";"Genre";"Classe";"ParentNom";"ParentEmail";"ParentTel";"Statut"
"","Ben Salem";"Youssef";"2019-03-14";"M";"CP A";"M. Karim Ben Salem";"karim.bensalem@gmail.com";"+216 98 111 222";"inscrit"
"","Kacem";"Aya";"2018-07-22";"F";"CE1 A";"Mme Nadia Kacem";"nadia.kacem@yahoo.fr";"+216 22 333 444";"inscrit"
```

---

## 3. Procédure Technique d'Exécution

### Étape 1 : Nettoyage et Validation Préliminaire
- Normalisation des formats de dates au format ISO : `AAAA-MM-JJ`.
- Dédoublonnage des adresses e-mail des parents.
- Contrôle de la correspondance des noms de classes avec les classes créées dans le nouveau système.

### Étape 2 : Exécution du Script de Migration
Pour injecter en masse le fichier CSV préparé :
```bash
# Dans le dossier server
node scripts/import_csv.js ../donnees_migrees/eleves_import.csv
```
Le script effectue :
1. La lecture ligne par ligne avec exclusion des doublons.
2. L'attribution automatique de l'année scolaire `2026-2027`.
3. L'inscription de l'importation massive dans le journal d'audit de sécurité.

### Étape 3 : Exportation & Vérification de Contrôle
Pour valider l'intégrité des données importées :
```bash
node scripts/export_csv.js
```
Un fichier `eleves_export.csv` est généré et peut être comparé avec le fichier source d'origine pour valider la réconciliation à 100%.

---

## 4. Stratégie de Bascule (Go-Live) & Rollback

### Procédure de Bascule :
1. Gel des saisies sur l'ancien système le vendredi à 18h00.
2. Sauvegarde de la base de données de l'ancien système.
3. Exécution de la migration CSV sur la nouvelle plateforme.
4. Génération d'une sauvegarde à blanc (`scripts/backup.bat`).
5. Ouverture des accès aux enseignants et parents le lundi à 08h00.

### Plan de Repli (Rollback) :
En cas d'anomalie bloquante durant la phase de recette :
```bash
scripts/restore.bat ..\backups\sauvegarde_pre_migration
```
La base est immédiatement restaurée dans son état initial garanti.
