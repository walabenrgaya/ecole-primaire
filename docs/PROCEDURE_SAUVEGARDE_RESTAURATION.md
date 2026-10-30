# Procédure de Sauvegarde & de Restauration
## Continuité d'Activité & Rétention des Données (30 Jours)
**Conforme aux Chapitres 16, 17 et 21 du Cahier des Charges**

---

## 1. Politique de Sauvegarde (Backup Policy)

Conformément aux exigences de sécurité du cahier des charges :
- **Fréquence :** Sauvegarde quotidienne automatique complète.
- **Rétention :** Conservation garantie des archives sur une période glissante de **30 jours minimum**.
- **Chiffrement & Intégrité :** Les sauvegardes sont archivées au format compressé `.tar.gz` avec horodatage strict `AAAAMMJJ_HHMMSS`.

---

## 2. Procédure de Sauvegarde Manuelle et Automatisée

### 2.1 Exécution Manuelle sous Windows :
Dans le dossier racine du projet :
```powershell
scripts\backup.bat
```
Le script effectue :
1. La création d'un sous-dossier horodaté dans `backups\`.
2. L'export complet via `mongodump` de la collection scolaire.
3. La purge automatique de toutes les sauvegardes ayant plus de 30 jours d'ancienneté.

### 2.2 Exécution Automatisée sous Linux (Crontab) :
Sur un serveur de production ou un VPS :
```bash
sudo crontab -e
```
Ajouter la règle d'exécution quotidienne à 02h00 du matin :
```cron
0 2 * * * /var/www/ecole-mern/scripts/backup.sh >> /var/log/ecole-backup.log 2>&1
```

---

## 3. Procédure de Restauration (Disaster Recovery)

En cas de corruption de données, défaillance matérielle ou erreur de manipulation :

### 3.1 Restauration sous Windows :
```powershell
scripts\restore.bat ..\backups\20261025_120000\ecole
```

### 3.2 Restauration sous Linux :
```bash
./scripts/restore.sh ./backups/20261025_120000.tar.gz
```
Le script :
1. Décompresse l'archive dans un répertoire temporaire sécurisé.
2. Exécute `mongorestore` avec l'option `--drop` pour réinitialiser proprement la base sans conflits de clés primaires.
3. Supprime les résidus temporaires.

---

## 4. Plan de Reprise d'Activité (PRA / DRP)

| Scénario d'Incident | RPO (Perte de données max) | RTO (Temps de reprise max) | Action corrective |
| :--- | :---: | :---: | :--- |
| **Crash Système Serveur** | < 24 heures | < 30 minutes | Réinstallation Docker et lancement de `docker-compose up -d`. |
| **Altération de la base** | < 24 heures | < 10 minutes | Exécution de `restore.sh` avec la sauvegarde de la veille à 02h00. |
| **Panne Hébergeur Cloud** | < 24 heures | < 1 heure | Restauration sur l'option alternative (ex: bascule de Render vers VPS ou Railway). |
