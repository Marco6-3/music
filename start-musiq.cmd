@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js and run this script again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please check your Node.js installation.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  goto install_deps
)

if not exist "node_modules\sql.js\dist\sql-wasm.wasm" (
  goto install_deps
)

if not exist "node_modules\express\package.json" (
  goto install_deps
)

goto start_app

:install_deps
  echo Installing dependencies. The first launch may take a few minutes...
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/
  call npm install --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )

:start_app
call npm start
if errorlevel 1 (
  echo App launch failed.
  pause
  exit /b 1
)
