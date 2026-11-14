# Procédure de sauvegarde et de restauration

Exigence : sauvegarde quotidienne de la base, rétention de 30 jours minimum.

## Hébergement managé

- **Render** : les bases payantes ont des sauvegardes quotidiennes automatiques (restauration *Point-in-time* depuis le tableau de bord). En offre gratuite, utiliser la sauvegarde manuelle ci-dessous.
- **Railway** : onglet *Backups* du service PostgreSQL.

## Sauvegarde manuelle ou planifiée (pg_dump)

```bash
export DATABASE_URL="postgresql://..."
./scripts/backup.sh            # Linux / macOS
scripts\backup.bat             # Windows
```

Chaque exécution crée `backups/ecole_AAAAMMJJ_HHMMSS.dump` (format compressé de PostgreSQL) et supprime les fichiers de plus de 30 jours.

Planification quotidienne à 2 h (cron) :

```
0 2 * * * cd /opt/ecole-mern && DATABASE_URL=... ./scripts/backup.sh >> backups/backup.log 2>&1
```

Sous Windows : Planificateur de tâches → action `scripts\backup.bat`. Copier régulièrement le dossier `backups` hors du serveur (stockage objet, autre machine).

Les fichiers déposés (`server/uploads`) se sauvegardent séparément (copie du dossier ou du volume Docker `uploads`).

## Restauration

```bash
./scripts/restore.sh backups/ecole_20261112_020000.dump
```

Le script demande confirmation puis remplace le contenu de la base (`pg_restore --clean`). Après restauration, redémarrer l'application.

## Test de restauration

Une fois par trimestre, restaurer la dernière sauvegarde sur une base de test (`createdb ecole_test`), lancer l'application dessus et vérifier la connexion et les tableaux de bord.
