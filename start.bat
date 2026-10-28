@echo off
chcp 65001 >nul
title EcclesiaManager - Serveur Gestion d'Assemblee
echo =======================================================
echo   Demarrage de EcclesiaManager (Gestion d'Assemblee)
echo =======================================================
cd /d "%~dp0"

if not exist "public\index.html" (
  echo.
  echo ERREUR : le dossier "public" ou le fichier public\index.html est introuvable.
  echo L'interface ne peut pas s'afficher. Restaurez le dossier "public".
  echo.
  pause
  exit /b 1
)

set "NODE_EXE=%APPDATA%\Antigravity\bin\agy-node.cmd"
set "RUN="

if exist "%NODE_EXE%" (
  set "RUN=call "%NODE_EXE%""
) else (
  where node >nul 2>nul
  if %ERRORLEVEL% EQU 0 (
    set "RUN=node"
  )
)

if "%RUN%"=="" (
  echo ERREUR : aucun Node.js detecte. Installez Node.js 22.5 ou plus recent : https://nodejs.org
  pause
  exit /b 1
)

echo Ouverture du navigateur dans 3 secondes...
start "" /b cmd /c "timeout /t 3 >nul & start http://localhost:3000"

%RUN% server.js

echo.
echo Le serveur s'est arrete. Si c'est une erreur, lisez le message ci-dessus.
echo (Node.js 22.5 ou plus recent est requis pour le module SQLite integre.)
pause
