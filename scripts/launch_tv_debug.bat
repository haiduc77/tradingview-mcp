@echo off
REM Launch TradingView Desktop on Windows with Chrome DevTools Protocol enabled
REM Usage: scripts\launch_tv_debug.bat [port]

set PORT=%1
if "%PORT%"=="" set PORT=9222

REM Kill existing TradingView instances
taskkill /F /IM TradingView.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Resolve the Windows Store / MSIX install location from the registered AppX package.
set "TV_EXE="
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-AppxPackage -Name 'TradingView.Desktop*' | Select-Object -First 1 -ExpandProperty InstallLocation" 2^>nul`) do (
    if exist "%%i\TradingView.exe" set "TV_EXE=%%i\TradingView.exe"
)

if "%TV_EXE%"=="" (
    echo Error: TradingView Desktop AppX package not found.
    echo Expected an installed package matching: TradingView.Desktop*
    echo.
    echo Install TradingView Desktop from the Microsoft Store or verify:
    echo   Get-AppxPackage -Name 'TradingView.Desktop*'
    exit /b 1
)

echo Found TradingView at: %TV_EXE%
echo Starting with --remote-debugging-port=%PORT%...
start "" "%TV_EXE%" --remote-debugging-port=%PORT%

echo Waiting for CDP to become available...
timeout /t 5 /nobreak >nul

:check
curl -s http://localhost:%PORT%/json/version >nul 2>&1
if %errorlevel% neq 0 (
    echo Still waiting...
    timeout /t 2 /nobreak >nul
    goto check
)

echo.
echo CDP ready at http://localhost:%PORT%
curl -s http://localhost:%PORT%/json/version
echo.
