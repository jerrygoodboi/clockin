@echo off
REM Keka Auto Clock-Out Wrapper for Windows (18:31 PM Mon-Fri)
cd /d "%~dp0"
node keka.js out >> keka.log 2>&1
