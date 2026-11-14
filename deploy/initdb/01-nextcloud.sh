#!/bin/sh
# Crée la base et l'utilisateur dédiés à Nextcloud au premier démarrage de PostgreSQL.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE USER nextcloud WITH PASSWORD '${NEXTCLOUD_DB_PASSWORD}' CREATEDB;
CREATE DATABASE nextcloud OWNER nextcloud;
EOSQL
