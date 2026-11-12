@echo off
REM Sauvegarde PostgreSQL (Windows). Planifier via le Planificateur de tâches.
REM Prérequis : pg_dump dans le PATH (ex. C:\Program Files\PostgreSQL\18\bin) et DATABASE_URL défini.
if "%DATABASE_URL%"=="" ( echo Definissez DATABASE_URL & exit /b 1 )
if not exist backups mkdir backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
pg_dump --format=custom --no-owner --dbname="%DATABASE_URL%" --file="backups\ecole_%TS%.dump" || exit /b 1
echo Sauvegarde creee : backups\ecole_%TS%.dump
powershell -NoProfile -Command "Get-ChildItem backups -Filter 'ecole_*.dump' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item"
