@echo off
chcp 65001 >nul
title Reinitialisation Mot de Passe PostgreSQL

echo ================================================================
echo  Reinitialisation securisee du mot de passe PostgreSQL
echo  Nouveau mot de passe defini : postgres
echo ================================================================

REM Verification des droits administrateur
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Demande d'elevation Administrateur requise...
    powershell -NoProfile -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set HBA_PATH=C:\Program Files\PostgreSQL\18\data\pg_hba.conf
set PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe
set SERVICE_NAME=postgresql-x64-18

echo [1/6] Sauvegarde de la configuration pg_hba.conf...
copy /y "%HBA_PATH%" "%HBA_PATH%.bak" >nul

echo [2/6] Activation temporaire du mode trust...
powershell -NoProfile -Command "(Get-Content -LiteralPath '%HBA_PATH%') -replace 'scram-sha-256', 'trust' | Set-Content -LiteralPath '%HBA_PATH%'"

echo [3/6] Redemarrage du service PostgreSQL (%SERVICE_NAME%)...
net stop %SERVICE_NAME%
net start %SERVICE_NAME%

echo [4/6] Definition du mot de passe postgres a 'postgres'...
"%PSQL%" -U postgres -h 127.0.0.1 -p 5432 -c "ALTER USER postgres WITH PASSWORD 'postgres';"

echo [5/6] Restauration du mode securise scram-sha-256...
copy /y "%HBA_PATH%.bak" "%HBA_PATH%" >nul
if exist "%HBA_PATH%.bak" del "%HBA_PATH%.bak" >nul

echo [6/6] Redemarrage final du service PostgreSQL...
net stop %SERVICE_NAME%
net start %SERVICE_NAME%

echo.
echo ================================================================
echo  SUCCES ! Le mot de passe de 'postgres' est maintenant : postgres
echo ================================================================
echo.
pause
