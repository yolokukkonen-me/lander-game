# ============================================================
# CHECK LOCAL LANDER SERVER STATUS
# ============================================================
# Usage: .\status-local.ps1

$ErrorActionPreference = "Continue"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  LANDER LOCAL SERVER STATUS" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$processInfoFile = Join-Path $PSScriptRoot ".server-process.json"

# Check saved process info
$savedProcess = $null
if (Test-Path $processInfoFile) {
    try {
        $savedProcess = Get-Content $processInfoFile | ConvertFrom-Json
        Write-Host "Saved Process Info:" -ForegroundColor Yellow
        Write-Host "  PID: $($savedProcess.PID)" -ForegroundColor Gray
        Write-Host "  Port: $($savedProcess.Port)" -ForegroundColor Gray
        Write-Host "  Started: $($savedProcess.StartTime)" -ForegroundColor Gray
        Write-Host ""
    } catch {
        Write-Host "Could not read process info" -ForegroundColor Red
        Write-Host ""
    }
}

# Find running processes
Write-Host "Running Processes:" -ForegroundColor Yellow
$processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    try {
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        $cmdLine -like "*ige.js*50-lander_virtual_keyboard*"
    } catch {
        $false
    }
}

if ($processes) {
    foreach ($process in $processes) {
        $uptime = (Get-Date) - $process.StartTime
        $uptimeStr = "{0:hh\:mm\:ss}" -f $uptime
        
        Write-Host "  PID: $($process.Id)" -ForegroundColor Green
        Write-Host "    Status: Running" -ForegroundColor Green
        Write-Host "    CPU: $([math]::Round($process.CPU, 2))s" -ForegroundColor Gray
        Write-Host "    Memory: $([math]::Round($process.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host "    Uptime: $uptimeStr" -ForegroundColor Gray
        Write-Host ""
    }
    
    Write-Host "Server Status: RUNNING" -ForegroundColor Green
    
    # Check port
    $port = if ($savedProcess) { $savedProcess.Port } else { 3030 }
    $portInUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    
    if ($portInUse) {
        Write-Host "Port ${port}: LISTENING" -ForegroundColor Green
    } else {
        Write-Host "Port ${port}: NOT LISTENING (server may still be starting)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "URLs:" -ForegroundColor Cyan
    Write-Host "  http://localhost:$port" -ForegroundColor White
    Write-Host "  Node.js (backend): http://localhost:$port" -ForegroundColor Gray
    Write-Host "  Game URL:          http://localhost/examples/50-lander_virtual_keyboard/" -ForegroundColor White
    
} else {
    Write-Host "  No running processes found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Server Status: STOPPED" -ForegroundColor Red
    
    # Clean up stale process file
    if (Test-Path $processInfoFile) {
        Remove-Item $processInfoFile -Force
        Write-Host "Cleaned up stale process file" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Commands:" -ForegroundColor Yellow
Write-Host "  Start:   .\start-local.ps1" -ForegroundColor Gray
Write-Host "  Stop:    .\stop-local.ps1" -ForegroundColor Gray
Write-Host "  Restart: .\restart-local.ps1" -ForegroundColor Gray
Write-Host ""
