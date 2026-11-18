@echo off
title HP LaserJet Remote Print Worker
color 0A
cls
echo =====================================================================
echo           AIRPRINT HUB - LOCAL PRINT WORKER DAEMON
echo =====================================================================
echo.
echo   Cloud Backend  : https://printer-8bki.onrender.com
echo   Target Printer : HP LaserJet Pro MFP M126nw (192.168.1.37)
echo   Local Driver   : Windows GDI / WSD Native Print Bridge
echo.
echo   Status: Connecting to Render cloud backend...
echo =====================================================================
echo.

cd /d "%~dp0worker"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

node dist/index.js

if %ERRORLEVEL% neq 0 (
    color 0C
    echo.
    echo [ERROR] Print worker stopped with error code %ERRORLEVEL%.
    echo.
    pause
)
