@echo off
setlocal
cd /d "%~dp0"

echo [MindCanvas] Installing dependencies from the project root...
call npm ci
if errorlevel 1 goto failed

echo [MindCanvas] Checking the Quiz formula renderer...
call npm ls katex --workspace apps/web
if errorlevel 1 goto failed

echo [MindCanvas] Starting the web and API servers...
call npm run dev
exit /b %errorlevel%

:failed
echo.
echo Setup failed. Check your Node.js and Internet connection, then try again.
pause
exit /b 1
