@echo off
title Home Wi-Fi Print Worker
echo ========================================================
echo   Starting Remote Print Worker for Home Wi-Fi
echo   Cloud Backend: https://printer-8bki.onrender.com
echo   Target Printer: 192.168.1.37:9100 / 631
echo ========================================================
cd /d "%~dp0worker"
npm run dev
pause
