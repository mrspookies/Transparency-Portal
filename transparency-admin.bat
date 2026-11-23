@echo off
title Transparency Portal - Admin Console
cd /d "%~dp0"

netstat -ano | findstr ":5001" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==1 (
  echo [Transparency] Server not running - starting it in the background...
  wscript.exe "%~dp0start-server-hidden.vbs"
  for /l %%i in (1,1,15) do (
    netstat -ano | findstr ":5001" | findstr "LISTENING" >nul 2>&1 && goto ready
    timeout /t 1 /nobreak >nul
  )
)

:ready
echo [Transparency] Opening the Admin Console...
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --user-data-dir="%LOCALAPPDATA%\TransparencyPortal" --app=http://localhost:5001/admin/
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --user-data-dir="%LOCALAPPDATA%\TransparencyPortal" --app=http://localhost:5001/admin/
) else (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%LOCALAPPDATA%\TransparencyPortal" --app=http://localhost:5001/admin/
)
exit /b 0
