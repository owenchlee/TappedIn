# Registers the nightly batch (scripts/nightly.ts) with Windows Task Scheduler:
#   powershell -ExecutionPolicy Bypass -File scripts\install-nightly.ps1            # 2:00 AM daily
#   powershell -ExecutionPolicy Bypass -File scripts\install-nightly.ps1 -At 3:30   # another time
#   powershell -ExecutionPolicy Bypass -File scripts\install-nightly.ps1 -Remove
# It wakes the PC from sleep to run (when plugged in), runs hidden, and catches up at the next wake
# if the PC was off. Log: %TEMP%\tappedin\nightly.log
param([string]$At = "2:00", [switch]$Remove)

$name = "TappedIn nightly tailoring"
if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
  Write-Output "Removed '$name'."
  return
}

$repo = Split-Path -Parent $PSScriptRoot
$log = Join-Path $env:TEMP "tappedin\nightly.log"

# A hidden PowerShell window whose console the claude CLI and pdflatex share, so nothing pops up.
$action = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $repo `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$repo\scripts\run-nightly.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Registered '$name': daily at $At. Log: $log"
