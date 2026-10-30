#!/usr/bin/env bash
# =====================================================================
# Procédure de sauvegarde quotidienne automatique de la base MongoDB
# Rétention : 30 jours (Chapitres 16 & 21 du Cahier des Charges)
# À exécuter par exemple via cron : 0 2 * * * /path/to/scripts/backup.sh
# =====================================================================

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_ROOT="./backups"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

MONGO_URI=${MONGO_URI:-"mongodb://127.0.0.1:27017/ecole"}

echo "Démarrage de la sauvegarde de la base de données..."
mongodump --uri="${MONGO_URI}" --out="${BACKUP_DIR}"

if [ $? -eq 0 ]; then
    echo "Sauvegarde effectuée avec succès dans : ${BACKUP_DIR}"
    # Compression de l'archive
    tar -czf "${BACKUP_DIR}.tar.gz" -C "${BACKUP_ROOT}" "${TIMESTAMP}" && rm -rf "${BACKUP_DIR}"
    echo "Archive compressée créée : ${BACKUP_DIR}.tar.gz"
else
    echo "Erreur lors de l'exécution de mongodump !" >&2
    exit 1
fi

# Rétention 30 jours
echo "Nettoyage des sauvegardes antérieures à 30 jours..."
find "${BACKUP_ROOT}" -name "*.tar.gz" -type f -mtime +30 -delete
echo "Sauvegarde et purge terminées."
