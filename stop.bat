@echo off
setlocal

echo.
echo ============================================
echo   CodePanel - Stopping
echo ============================================
echo.

:: Note: Normally the Electron app handles backend shutdown automatically.
:: This script is for manual cleanup if needed.

echo [..] Stopping CodePanel processes...

:: Kill by window title
taskkill /FI "WINDOWTITLE eq CodePanel*" /T /F >nul 2>&1

:: Kill any Electron processes for this app
taskkill /IM electron.exe /F >nul 2>&1

:: Kill any Python processes on port 3000 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000.*LISTENING"') do (
    echo [..] Killing process on port 3000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill any Node processes on port 54321 (frontend dev server)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":54321.*LISTENING"') do (
    echo [..] Killing process on port 54321 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

echo [OK] CodePanel stopped.
echo.
echo ============================================
echo   All CodePanel processes terminated
echo ============================================
echo.
