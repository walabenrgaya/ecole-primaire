#!/usr/bin/env bash
# =====================================================================
# Installation de EduPilot + Nextcloud sur un serveur Ubuntu (22.04 / 24.04)
# Usage (en root ou avec sudo) :
#   curl -fsSL https://raw.githubusercontent.com/walabenrgaya/ecole-primaire/refonte-bi-securite/scripts/installer-serveur.sh | sudo bash
# Résultat : deux adresses HTTPS publiques (sslip.io, sans achat de domaine)
#   https://edupilot.<IP>.sslip.io   et   https://cloud.<IP>.sslip.io
# Pour un vrai domaine : APP_DOMAIN=... CLOUD_DOMAIN=... avant la commande.
# =====================================================================
set -euo pipefail

REPO=${REPO:-https://github.com/walabenrgaya/ecole-primaire.git}
BRANCHE=${BRANCHE:-refonte-bi-securite}
DOSSIER=${DOSSIER:-/opt/edupilot}

[ "$(id -u)" -eq 0 ] || { echo "Lancez ce script avec sudo."; exit 1; }

echo "==> 1/5 Installation de Docker"
if ! command -v docker >/dev/null; then
  apt-get update -y && apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null || apt-get install -y git

echo "==> 2/5 Récupération du code"
if [ -d "$DOSSIER/.git" ]; then
  git -C "$DOSSIER" fetch origin "$BRANCHE" && git -C "$DOSSIER" checkout "$BRANCHE" && git -C "$DOSSIER" pull --ff-only
else
  git clone --branch "$BRANCHE" "$REPO" "$DOSSIER"
fi
cd "$DOSSIER"

echo "==> 3/5 Ouverture des ports 80 et 443"
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp; ufw allow 443/tcp; fi
# Images Oracle Cloud : règles iptables restrictives par défaut
if iptables -S INPUT 2>/dev/null | grep -q "REJECT"; then
  iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT || true
  iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT || true
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi

echo "==> 4/5 Configuration (.env)"
if [ ! -f .env ]; then
  IP=$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)
  DOM=$(echo "$IP" | tr '.' '-').sslip.io
  secret() { openssl rand -hex "$1"; }
  cat > .env <<EOF
APP_DOMAIN=${APP_DOMAIN:-edupilot.$DOM}
CLOUD_DOMAIN=${CLOUD_DOMAIN:-cloud.$DOM}
POSTGRES_PASSWORD=$(secret 16)
NEXTCLOUD_DB_PASSWORD=$(secret 16)
NEXTCLOUD_ADMIN_USER=admin
NEXTCLOUD_ADMIN_PASSWORD=Cloud-$(secret 6)
JWT_SECRET=$(secret 32)
ANNEE_SCOLAIRE=2026-2027
EOF
  chmod 600 .env
fi
set -a; . ./.env; set +a

echo "==> 5/5 Démarrage (premier lancement : 3 à 6 minutes)"
docker compose up -d --build

echo
echo "Installation lancée."
echo "  Application : https://$APP_DOMAIN"
echo "  Nextcloud   : https://$CLOUD_DOMAIN   (utilisateur $NEXTCLOUD_ADMIN_USER / mot de passe dans $DOSSIER/.env)"
echo "Suivi : cd $DOSSIER && docker compose logs -f app nextcloud caddy"
