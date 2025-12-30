@echo off
setlocal

echo.
echo ============================================
echo   CodePanel - Stopping
echo ============================================
echo.

:: Kill by window title (more targeted than killing all python/node)
echo [..] Stopping CodePanel-Backend...
taskkill /FI "WINDOWTITLE eq CodePanel-Backend*" /T /F >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Backend stopped.
) else (
    echo [--] Backend was not running.
)

echo [..] Stopping CodePanel-Frontend...
taskkill /FI "WINDOWTITLE eq CodePanel-Frontend*" /T /F >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Frontend stopped.
) else (
    echo [--] Frontend was not running.
)

:: Also try to kill any processes on our ports (fallback)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":54321.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ============================================
echo   CodePanel Stopped
echo ============================================
echo.
