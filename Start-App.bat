@echo off
title GBHS Record Management - Server
cd /d "%~dp0"
echo ========================================================
echo   Starting GBHS Record Management Development Server
echo ========================================================
echo.
bun run dev
if %errorlevel% neq 0 (
    echo.
    echo Trying fallback Bun path...
    "%USERPROFILE%\.bun\bin\bun.exe" run dev
)
pause
