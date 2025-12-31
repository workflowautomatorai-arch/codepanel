@echo off
setlocal

echo.
echo ============================================
echo   CodePanel - Starting
echo ============================================
echo.

:: Check if backend venv exists
if not exist "%~dp0backend\venv\Scripts\activate.bat" (
    echo [!] Backend venv not found. Running setup...
    echo.
    cd /d "%~dp0backend"
    python -m venv venv
    if errorlevel 1 (
        echo [X] Failed to create venv. Is Python installed?
        pause
        exit /b 1
    )
    call venv\Scripts\activate
    venv\Scripts\pip install -r requirements.txt
    echo.
    echo [OK] Backend setup complete.
    echo.
) else (
    echo [OK] Backend venv found
)

:: Check if node_modules exists
if not exist "%~dp0node_modules" (
    echo [!] node_modules not found. Running npm install...
    cd /d "%~dp0"
    npm install
    if errorlevel 1 (
        echo [X] npm install failed
        pause
        exit /b 1
    )
    echo [OK] Frontend dependencies installed.
) else (
    echo [OK] Frontend node_modules found
)

echo.
echo Starting CodePanel...
echo.

:: Start the app using npm run dev
:: Electron will automatically spawn the Python backend
cd /d "%~dp0"
start "CodePanel" cmd /k "npm run dev"

:: Wait for startup
timeout /t 3 /nobreak > nul

echo.
echo ============================================
echo   CodePanel Started!
echo ============================================
echo.
echo   The Electron app will automatically manage
echo   the Python backend - no separate windows needed.
echo.
echo   Frontend: http://localhost:54321
echo   Backend:  http://localhost:3000 (auto-managed)
echo.
echo   To stop: Close the Electron window or run stop.bat
echo ============================================
echo.
