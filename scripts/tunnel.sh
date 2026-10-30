#!/usr/bin/env bash
# =====================================================================
# Option A du Cahier des Charges : Cloudflare Quick Tunnel (Démonstration)
# Expose l'application locale sur Internet via une URL HTTPS publique
# =====================================================================

if ! command -v cloudflared &> /dev/null; then
    echo "cloudflared n'est pas installé."
    echo "Sur Mac : brew install cloudflared"
    echo "Sur Linux : curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb"
    exit 1
fi

echo "Lancement du tunnel Cloudflare public pour http://localhost:5000..."
cloudflared tunnel --url http://localhost:5000
