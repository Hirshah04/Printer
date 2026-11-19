@echo off
title HP LaserJet Remote Print Worker
color 0A
cls
echo =====================================================================
echo           AIRPRINT HUB - LOCAL PRINT WORKER DAEMON
echo =====================================================================
echo.
echo   Cloud Backend  : https://printer-8bki.onrender.com
echo   Architecture   : Cloud (Vercel + Render) ^<--- HTTPS ---^> Local Worker
echo   Connection Mode: Automatic (USB Priority / Wi-Fi Fallback at 600 DPI)
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

:: 2. Check Python and Dependencies for Windows Print Bridge
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    python -c "import fitz, win32print, PIL" >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo [*] Installing required Python print packages: pymupdf, pywin32, pillow...
        pip install --quiet pymupdf pywin32 pillow
    )
) else (
    echo [WARNING] Python not detected in PATH.
)

:: 3. Ensure native SumatraPDF vector print engine exists
if not exist "bin\SumatraPDF.exe" (
    echo [*] Setting up native vector print engine: SumatraPDF...
    if not exist "bin" mkdir "bin"
    powershell -Command "try { Invoke-WebRequest -Uri 'https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip' -OutFile 'sumatra_tmp.zip' -UseBasicParsing; Expand-Archive -Path 'sumatra_tmp.zip' -DestinationPath 'bin' -Force; Move-Item -Path 'bin\SumatraPDF*.exe' -Destination 'bin\SumatraPDF.exe' -Force; Remove-Item 'sumatra_tmp.zip' -Force; echo '[*] SumatraPDF vector print engine ready.' } catch { echo '[WARNING] Could not auto-download SumatraPDF. Fallback to GDI will be used.' }"
)

:: 4. Check dependencies and build
if not exist "node_modules" (
    echo [*] Installing worker npm dependencies...
    call npm install
)

echo [*] Compiling worker TypeScript to ensure latest updates...
call npm run build

:: 5. Pre-flight connection detection
echo [*] Checking active printer hardware connection...
python -c "import sys; sys.path.append('.'); import print_helper; print_helper.detect_active_connection()"

echo.
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
