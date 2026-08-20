@echo off
setlocal
REM ============================================================
REM  SPT Mod Sync v0.1 - Beta  --  build.bat
REM  Compila launcher.py (PyWebView) para um .exe único.
REM  O server.py vai EMBUTIDO no exe (Data/Server/server.py no bundle).
REM  Apenas Data/Lang/ fica externo (i18n) + Data/Server recebe
REM  versions.json e files/ (o servidor auto-cria-os se faltarem).
REM  (UI + server embutidos; Data/ editável ao lado do exe)
REM ============================================================

set VENV_PY=C:\Users\DarkAngel\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe
set PYINSTALLER=%VENV_PY% -m PyInstaller

cd /d "%~dp0Source"

echo [1/3] A limpar caches...
if exist __pycache__ rmdir /s /q __pycache__
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist "SPTModSync.spec" del /f /q "SPTModSync.spec" 2>nul

echo [2/3] A compilar SPTModSync.exe...
%PYINSTALLER% ^
  --onefile --noconsole --name SPTModSync --clean ^
  --hidden-import=webview.platforms.edgechromium ^
  --hidden-import=clr_loader ^
  --hidden-import=webview ^
  --hidden-import=requests ^
  --hidden-import=flask ^
  --hidden-import=waitress ^
  --hidden-import=werkzeug ^
  --hidden-import=werkzeug.utils ^
  --hidden-import=werkzeug.serving ^
  --add-data "index.html;." ^
  --add-data "assets;assets" ^
  --add-data "Data/Server/server.py;Data/Server" ^
  launcher.py

if errorlevel 1 (
  echo.
  echo [ERRO] BUILD FALHOU
  pause
  exit /b 1
)

echo [3/3] A montar exe\ ...
if not exist "..\exe" mkdir "..\exe"
copy /y "dist\SPTModSync.exe" "..\exe\SPTModSync.exe" > nul

REM Lang externo (i18n editável em runtime)
if not exist "..\exe\Data\Lang" mkdir "..\exe\Data\Lang"
xcopy /E /I /Y "Data\Lang" "..\exe\Data\Lang" > nul

REM Pasta Server: SEM server.py (vai dentro do exe). Cria-se versions.json + files/ vazios.
if not exist "..\exe\Data\Server" mkdir "..\exe\Data\Server"
if not exist "..\exe\Data\Server\files" mkdir "..\exe\Data\Server\files"
if not exist "..\exe\Data\Server\versions.json" (
  echo [] > "..\exe\Data\Server\versions.json"
)

echo.
echo ============================================================
echo  BUILD OK  --  SPTModSync.exe esta em exe\
echo  (server.py EMBUTIDO no exe; Data\Server so tem dados)
echo ============================================================
pause
