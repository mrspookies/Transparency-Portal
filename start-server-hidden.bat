@echo off
cd /d "%~dp0"
netstat -ano | findstr ":5001" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 exit /b 0
node server/index.js
