@echo off
REM Phone app screens in the browser (test mode). Run dev-agentation.bat first:
REM it starts the test server that plays the shop PC.
cd /d "%~dp0apps\desktop"
start "Next POS phone screens" cmd /k npm.cmd run dev:mobile
timeout /t 4 >nul
start "" http://localhost:1421
echo Phone screens: http://localhost:1421  (use the browser's phone view: F12, then Ctrl+Shift+M)
