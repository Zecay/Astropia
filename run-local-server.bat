@echo off
setlocal

REM Change to the folder this .bat file lives in
cd /d "%~dp0"

set PORT=8000

echo Starting local server for the game at http://localhost:%PORT%
echo (Press Ctrl+C in this window to stop the server)
echo.

REM Try Python first (most common)
where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%
    python -m http.server %PORT%
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%
    py -m http.server %PORT%
    goto :eof
)

REM Fall back to Node.js / npx if Python isn't found
where npx >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%
    npx --yes http-server -p %PORT%
    goto :eof
)

echo Could not find Python or Node.js/npx on this machine.
echo Please install one of them:
echo   Python: https://www.python.org/downloads/
echo   Node.js: https://nodejs.org/
pause
