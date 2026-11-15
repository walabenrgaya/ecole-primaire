#!/usr/bin/env bash
# Restauration d'une sauvegarde : ./scripts/restore.sh backups/ecole_20261112_020000.dump
# ATTENTION : remplace le contenu actuel de la base.
set -euo pipefail
DATABASE_URL=${DATABASE_URL:?Définissez DATABASE_URL}
FICHIER=${1:?Indiquez le fichier .dump à restaurer}
read -r -p "Restaurer $FICHIER et écraser la base actuelle ? (oui/non) " OK
[ "$OK" = "oui" ] || { echo "Annulé."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$FICHIER"
echo "Restauration terminée."
