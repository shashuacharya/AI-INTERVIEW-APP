@echo off
echo Starting AI Interview Coach...
echo.

echo [1/2] Starting Backend Server...
start "Backend Server" cmd /k cd /d "D:\AI PROJECT\AI-INTERVIEW-APP\backend" ^&^& node server.js
timeout /t 3

echo [2/2] Starting Frontend...
start "Frontend" cmd /k cd /d "D:\AI PROJECT\AI-INTERVIEW-APP\frontend" ^&^& npm start

echo.
echo ====================================
echo All services started!
echo ====================================
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:3000
echo.
pause
