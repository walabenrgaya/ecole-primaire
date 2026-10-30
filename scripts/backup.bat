@echo off
REM =====================================================================
REM Procédure de sauvegarde quotidienne automatique de la base MongoDB
REM Rétention : 30 jours minimum (Chapitres 16 & 21 du Cahier des Charges)
REM =====================================================================

setlocal enabledelayedexpansion
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,8%_%datetime:~8,6%
set BACKUP_DIR=..\backups\%TIMESTAMP%

echo [1/3] Creation du dossier de sauvegarde : %BACKUP_DIR%
mkdir "%BACKUP_DIR%" 2>nul

echo [2/3] Exportation de la base de donnees via mongodump...
mongodump --uri="mongodb://127.0.0.1:27017/ecole" --out="%BACKUP_DIR%"

if %ERRORLEVEL% equ 0 (
    echo [3/3] Sauvegarde reussie avec succes dans : %BACKUP_DIR%
) else (
    echo ERREUR : La commande mongodump a echoue. Verifiez que MongoDB est demarre.
)

REM Purge automatique des sauvegardes de plus de 30 jours
echo Nettoyage automatique des sauvegardes depassant 30 jours de retention...
forfiles /p "..\backups" /d -30 /c "cmd /c if @isdir==TRUE rd /s /q @path" 2>nul

echo Operation terminee.
pause
