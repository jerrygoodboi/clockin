@echo off
REM Keka Auto Clock-In Wrapper for Windows (09:15 AM Mon-Fri)
cd /d "%~dp0"
node keka.js in >> keka.log 2>&1
