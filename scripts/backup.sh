#!/usr/bin/env bash
# Sauvegarde quotidienne de la base PostgreSQL, rétention 30 jours.
# Planification (cron) : 0 2 * * * DATABASE_URL=... /chemin/scripts/backup.sh
set -euo pipefail
DATABASE_URL=${DATABASE_URL:?Définissez DATABASE_URL}
DIR=${BACKUP_DIR:-./backups}
mkdir -p "$DIR"
FICHIER="$DIR/ecole_$(date +%Y%m%d_%H%M%S).dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$FICHIER"
echo "Sauvegarde créée : $FICHIER"
find "$DIR" -name 'ecole_*.dump' -type f -mtime +30 -delete
echo "Sauvegardes de plus de 30 jours supprimées."
