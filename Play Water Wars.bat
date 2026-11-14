@echo off
rem Starts the Water Wars dev server and opens the game in your browser (needs Node.js and a WebGPU browser).
rem Keep this window open while you play; close it to stop the server.
cd /d "%~dp0"
if not exist node_modules (
	echo Installing dependencies...
	call npm install
)
call npm run dev -- --open
