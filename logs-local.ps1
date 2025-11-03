# ============================================================
# VIEW LOCAL LANDER SERVER LOGS
# ============================================================
# Usage: .\logs-local.ps1

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  LANDER SERVER LOGS" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$processInfoFile = Join-Path $PSScriptRoot ".server-process.json"

# Check if server is running
$savedProcess = $null
if (Test-Path $processInfoFile) {
    try {
        $savedProcess = Get-Content $processInfoFile | ConvertFrom-Json
    } catch {}
}

$processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    try {
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        $cmdLine -like "*ige.js*50-lander_virtual_keyboard*"
    } catch {
        $false
    }
}

if (-not $processes -and -not $savedProcess) {
    Write-Host "Server is not running" -ForegroundColor Red
    Write-Host "Start it with: .\start-local.ps1" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

if ($processes) {
    Write-Host "Server is running (PID: $($processes[0].Id))" -ForegroundColor Green
    Write-Host ""
    Write-Host "Note: Server logs are shown in the terminal window where it was started." -ForegroundColor Yellow
    Write-Host "To see logs, check the Node.js console window." -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "Server process not found" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "For detailed logging, you can redirect output when starting:" -ForegroundColor Cyan
Write-Host "  cd server" -ForegroundColor Gray
Write-Host "  node ige.js -g ../examples/50-lander_virtual_keyboard > ../server.log 2>&1" -ForegroundColor Gray
Write-Host ""

Write-Host "" -ForegroundColor Cyan
Write-Host "Press any key to close..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")



