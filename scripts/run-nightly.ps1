# What the "TappedIn nightly tailoring" scheduled task runs (see install-nightly.ps1): the nightly
# batch, in this hidden window's console (so claude and pdflatex don't open windows), logged to
# %TEMP%\tappedin\nightly.log.
$repo = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:TEMP "tappedin"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir "nightly.log"
$node = (Get-Command node).Source
Set-Location $repo
& cmd.exe /d /c "`"$node`" `"$repo\node_modules\tsx\dist\cli.mjs`" `"$repo\scripts\nightly.ts`" >> `"$log`" 2>&1"
exit $LASTEXITCODE
