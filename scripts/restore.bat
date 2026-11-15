@echo off
REM Restauration : scripts\restore.bat backups\ecole_20261112_020000.dump  (ECRASE la base actuelle)
if "%DATABASE_URL%"=="" ( echo Definissez DATABASE_URL & exit /b 1 )
if "%~1"=="" ( echo Indiquez le fichier .dump & exit /b 1 )
set /p OK=Restaurer %1 et ecraser la base actuelle ? (oui/non)
if /i not "%OK%"=="oui" ( echo Annule. & exit /b 1 )
pg_restore --clean --if-exists --no-owner --dbname="%DATABASE_URL%" "%~1"
echo Restauration terminee.
