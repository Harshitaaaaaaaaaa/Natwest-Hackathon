@echo off
echo ============================================
echo   Bolt - Starting All Services
echo ============================================
echo.

:: Start Python Execution Engine (port 8000)
echo [1/3] Starting Python Execution Engine on port 8000...
start "Execution Engine" cmd /k "cd /d %~dp0..\execution_engine && python -m uvicorn src.main:app --host 0.0.0.0 --port 8000"

:: Wait for engine to boot
timeout /t 3 /nobreak >nul

:: Start Node.js Backend (port 5000)
echo [2/3] Starting Node.js Backend on port 5000...
start "Backend" cmd /k "cd /d %~dp0..\backend && node src/server.js"

:: Wait for backend to boot
timeout /t 2 /nobreak >nul

:: Start Vite Frontend (port 5173)
echo [3/3] Starting Vite Frontend on port 5173...
start "Frontend" cmd /k "cd /d %~dp0..\frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo   All services started!
echo   Open http://127.0.0.1:5173 in your browser
echo ============================================
echo.

