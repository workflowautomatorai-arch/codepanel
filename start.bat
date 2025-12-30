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
echo Starting services...
echo.

:: Start backend in a new window
echo [>>] Starting backend server...
start "CodePanel-Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\pip install -q -r requirements.txt && venv\Scripts\python server.py"

:: Wait for backend to initialize
echo     Waiting for backend...
timeout /t 3 /nobreak > nul

:: Start frontend in a new window
echo [>>] Starting frontend...
start "CodePanel-Frontend" cmd /k "cd /d %~dp0 && npm run dev"

:: Wait and check health
timeout /t 2 /nobreak > nul

echo.
echo ============================================
echo   CodePanel Started!
echo ============================================
echo.
echo   Backend:  http://localhost:3000
echo   Frontend: http://localhost:54321
echo.
echo   To stop: run stop.bat or close windows
echo ============================================
echo.
