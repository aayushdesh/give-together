@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js version 24 or newer from nodejs.org, then try again.
  pause
  exit /b 1
)
if not exist "node_modules\google-auth-library\package.json" (
  echo First run: downloading Google's official sign-in library.
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo Setup could not finish. Check your internet and Node.js installation.
    pause
    exit /b 1
  )
)
echo Open http://localhost:3000 in Chrome or Edge after the ready message.
echo Google setup instructions: http://localhost:3000/google-setup.html
node server.mjs
pause
