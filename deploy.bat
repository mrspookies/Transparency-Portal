@echo off
title Transparency Portal - Publish
cd /d "%~dp0"

if not exist "data\exit-plan.json" (
  echo [Transparency] data\exit-plan.json missing - save from the admin console first.
  pause
  exit /b 1
)

git add -A
git diff --cached --quiet
if %errorlevel%==0 (
  echo [Transparency] Nothing to publish.
  pause
  exit /b 0
)

git commit -m "Update exit plan"
if errorlevel 1 (
  echo [Transparency] Commit failed.
  pause
  exit /b 1
)

git push origin main
if errorlevel 1 (
  echo [Transparency] Push failed.
  pause
  exit /b 1
)

echo [Transparency] Published.
pause
