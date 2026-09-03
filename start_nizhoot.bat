@echo off
title Nizhoot Server
cd /d "%~dp0"
echo ====================================================
echo   Menjalankan Nizhoot Server...
echo ====================================================
start "" http://localhost:3000/host
npm start
pause
