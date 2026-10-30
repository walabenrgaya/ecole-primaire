@echo off
REM =====================================================================
REM Procédure de restauration de la base MongoDB (Chapitre 21)
REM =====================================================================

if "%~1"=="" (
    echo Usage: restore.bat [CHEMIN_DU_DOSSIER_SAUVEGARDE]
    echo Exemple : restore.bat ..\backups\20261025_120000\ecole
    pause
    exit /b 1
)

set BACKUP_PATH=%~1
echo [1/2] Restauration de la base de donnees a partir de : %BACKUP_PATH%
mongorestore --uri="mongodb://127.0.0.1:27017/ecole" --drop "%BACKUP_PATH%"

if %ERRORLEVEL% equ 0 (
    echo [2/2] Restauration terminee avec succes !
) else (
    echo ERREUR : La restauration a echoue. Verifiez le chemin specifie.
)

pause
