@echo off
REM =====================================================================
REM Option A du Cahier des Charges : Cloudflare Quick Tunnel (Démonstration)
REM Expose l'application locale sur Internet via une URL HTTPS publique temporaire
REM =====================================================================

echo [1/2] Verification de cloudflared...
where cloudflared >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo cloudflared n'est pas installe sur votre systeme.
    echo Installation recommandee via winget :
    echo   winget install Cloudflare.cloudflared
    echo.
    echo En cours de telechargement direct...
    winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
)

echo [2/2] Lancement du tunnel Cloudflare vers le port 5000 (ou 5173)...
echo Votre application sera accessible publiquement via le lien HTTPS ci-dessous :
echo.
cloudflared tunnel --url http://localhost:5000
pause
