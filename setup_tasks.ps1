<#
.SYNOPSIS
  Keka Automated Attendance Task Scheduler for Windows
.DESCRIPTION
  Creates or removes automated Windows Task Scheduler tasks for Clock-In (09:15 AM)
  and Clock-Out (18:31 PM) Monday through Friday.
.EXAMPLE
  .\setup_tasks.ps1
  .\setup_tasks.ps1 -Remove
#>

param (
    [switch]$Remove = $false
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClockInBat = Join-Path $ScriptDir "run_clockin.bat"
$ClockOutBat = Join-Path $ScriptDir "run_clockout.bat"

if ($Remove -or ($args[0] -eq "remove") -or ($args[0] -eq "uninstall")) {
    Write-Host "Removing Keka scheduled tasks..." -ForegroundColor Yellow
    schtasks /Delete /TN "KekaClockIn" /F 2>$null
    schtasks /Delete /TN "KekaClockOut" /F 2>$null
    Write-Host "✅ Keka attendance tasks removed successfully!" -ForegroundColor Green
    exit 0
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Keka Attendance Automation - Windows Task Scheduler" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Create Clock-In Task (09:15 AM Mon-Fri)
Write-Host "Registering Clock-In Task (09:15 AM Mon-Fri)..."
schtasks /Create /TN "KekaClockIn" /TR "`"$ClockInBat`"" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 09:15 /F

# 2. Create Clock-Out Task (18:31 PM Mon-Fri)
Write-Host "Registering Clock-Out Task (18:31 PM Mon-Fri)..."
schtasks /Create /TN "KekaClockOut" /TR "`"$ClockOutBat`"" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 18:31 /F

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "✅ Keka Windows tasks installed and activated!" -ForegroundColor Green
Write-Host "   - KekaClockIn:  09:15 AM (Mon-Fri)" -ForegroundColor White
Write-Host "   - KekaClockOut: 18:31 PM (Mon-Fri)" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "To remove anytime, run: powershell -ExecutionPolicy Bypass -File .\setup_tasks.ps1 -Remove" -ForegroundColor Gray
