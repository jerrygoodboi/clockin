@echo off
REM Windows Task Scheduler installer for Keka Auto Attendance
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_tasks.ps1" %*
pause
