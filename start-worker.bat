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
echo   Local Protocol : Windows GDI Driver / IPP Port 631 / Port 9100
echo.
echo   Architecture   : Cloud (Vercel + Render) ^<--- HTTPS ---^> Local Worker
echo =====================================================================
echo.

cd /d "%~dp0worker"

:: 1. Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 2. Check Python & Dependencies (for Windows GDI Print Bridge)
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    python -c "import fitz, win32print, PIL" >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo [*] Installing required Python print packages (PyMuPDF, pywin32, Pillow)...
        pip install --quiet pymupdf pywin32 pillow
    )
) else (
    echo [WARNING] Python not detected in PATH. Windows GDI driver printing requires Python.
    echo Fallback to direct network port streaming will be used.
)

:: 3. Check dependencies and build
if not exist "node_modules" (
    echo [*] Installing worker npm dependencies...
    call npm install
)

if not exist "dist\index.js" (
    echo [*] Compiling worker TypeScript...
    call npm run build
)

echo [*] Starting local worker daemon...
echo.
node dist/index.js

if %ERRORLEVEL% neq 0 (
    color 0C
    echo.
    echo [ERROR] Print worker stopped with error code %ERRORLEVEL%.
    echo.
    pause
)
