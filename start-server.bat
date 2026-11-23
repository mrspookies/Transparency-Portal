@echo off
title Transparency Portal - Server
cd /d "%~dp0"

netstat -ano | findstr ":5001" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [Transparency] A server is already running on port 5001.
  echo [Transparency] Close the other window, or end node.exe in Task Manager, then try again.
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo [Transparency] Installing dependencies...
  pushd server
  call npm install
  popd
)

echo [Transparency] Starting server...
echo [Transparency] Portal: http://localhost:5001/
echo [Transparency] Admin:  http://localhost:5001/admin/
echo [Transparency] Close this window to stop the server.
echo.
node server/index.js
echo.
echo [Transparency] Server stopped.
pause
