@echo off
title Home Wi-Fi Print Worker
echo ========================================================
echo   Starting Remote Print Worker for Home Wi-Fi
echo   Cloud Backend: https://printer-8bki.onrender.com
echo   Target Printer: HP LaserJet Pro MFP M126nw
echo ========================================================
cd /d "%~dp0worker"
node dist/index.js
pause
