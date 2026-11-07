@echo off
REM Next POS browser testing:
REM   1. test server with the real backend (port 4848, test data in %APPDATA%\NextPOS-dev)
REM   2. Agentation server (port 4747)
REM   3. Vite dev page (port 1420)
cd /d "%~dp0"

echo Starting the Next POS test server. The first start compiles Rust and takes a few minutes.
start "Next POS test server (4848)" cmd /k cargo run -p pos-core --features dev-server --bin pos-dev-server

cd /d "%~dp0apps\desktop"

REM Start the Agentation server only if nothing is on port 4747 yet
REM (Claude Code starts it itself once the MCP server is registered).
netstat -ano | findstr ":4747 " | findstr LISTENING >nul
if errorlevel 1 (
  start "Agentation server (4747)" cmd /k npx -y agentation-mcp server
) else (
  echo Agentation server already running on port 4747.
)

start "Next POS dev page (1420)" cmd /k npm.cmd run dev
timeout /t 8 /nobreak >nul
start "" http://localhost:1420
echo If the page says the test server is not running, wait for the test server window to show
echo "Next POS browser test server on http://127.0.0.1:4848" and refresh the page.
