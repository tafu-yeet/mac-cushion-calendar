<#
Sets up the Mac Cushion Calendar worker on a Windows machine and schedules it
to run every 15 minutes, whether or not anyone is signed in.

Before running:
  1. Install Python 3.10 or newer from python.org (tick "Add python.exe to PATH")
     and Git for Windows.
  2. Clone the repo and copy worker\.env from your PC into the clone's worker
     folder. The .env holds your keys and is never in Git.

Then, in PowerShell opened with "Run as administrator", from the clone's worker folder:
  powershell -ExecutionPolicy Bypass -File deploy\setup-windows.ps1
#>
param(
    [int]$EveryMinutes = 15,
    [string]$TaskName = "Mac Cushion Calendar worker"
)
$ErrorActionPreference = "Stop"
$worker = Split-Path -Parent $PSScriptRoot
Set-Location $worker

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

Step "Checking Python"
# Prefer the py launcher (python.org installs); fall back to python on PATH.
if (Get-Command py -ErrorAction SilentlyContinue) { $pyExe = "py"; $pyArgs = @("-3") }
else { $pyExe = "python"; $pyArgs = @() }
& $pyExe @pyArgs -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
if ($LASTEXITCODE -ne 0) { throw "Python 3.10 or newer is required." }

Step "Creating the virtual environment and installing packages"
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    & $pyExe @pyArgs -m venv .venv
}
$venvPython = Join-Path $worker ".venv\Scripts\python.exe"
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Installing packages failed." }

Step "Checking worker\.env"
if (-not (Test-Path ".env")) {
    throw "worker\.env is missing. Copy it from your PC into $worker, then run this again."
}

Step "Checking settings, database, Claude, proxy and image downloads"
& $venvPython check_setup.py
if ($LASTEXITCODE -ne 0) { throw "A check failed; fix it and run this again." }

Step "Scheduling '$TaskName' every $EveryMinutes minutes"
$action = New-ScheduledTaskAction -Execute $venvPython -Argument "run.py --log-dir logs" -WorkingDirectory $worker
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
# IgnoreNew: a long run (like the first catch-up) is never overlapped by the next one.
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# S4U: runs whether or not you're signed in, without storing your password.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "`nDone. The first run starts in about a minute." -ForegroundColor Green
Write-Host "Logs:        $worker\logs\<date>.log (kept 14 days)"
Write-Host "Run now:     Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Last result: Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Host "Pause:       Disable-ScheduledTask -TaskName '$TaskName'"
Write-Host "Update code: git pull   (then re-run this script if requirements.txt changed)"
