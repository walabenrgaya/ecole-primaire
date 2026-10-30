#!/usr/bin/env bash
# =====================================================================
# Procédure de restauration de la base MongoDB (Chapitre 21)
# =====================================================================

if [ -z "$1" ]; then
    echo "Usage: ./restore.sh <chemin_backup_ou_archive.tar.gz>"
    echo "Exemple : ./restore.sh ./backups/20261025_120000.tar.gz"
    exit 1
fi

TARGET="$1"
MONGO_URI=${MONGO_URI:-"mongodb://127.0.0.1:27017/ecole"}

if [[ "$TARGET" == *.tar.gz ]]; then
    TEMP_DIR=$(mktemp -d)
    echo "Extraction de l'archive compressée ${TARGET}..."
    tar -xzf "$TARGET" -C "$TEMP_DIR"
    RESTORE_SOURCE="$TEMP_DIR"
else
    RESTORE_SOURCE="$TARGET"
fi

echo "Restauration en cours avec écrasement sécurisé (--drop)..."
mongorestore --uri="${MONGO_URI}" --drop "$RESTORE_SOURCE"

if [ $? -eq 0 ]; then
    echo "Restauration effectuée avec succès !"
else
    echo "Erreur lors de la restauration." >&2
fi

if [ -n "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
fi
