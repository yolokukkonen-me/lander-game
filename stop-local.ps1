# ============================================================
# STOP LOCAL LANDER SERVER
# ============================================================
# Usage: .\stop-local.ps1

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  STOPPING LANDER LOCAL SERVER" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$processInfoFile = Join-Path $PSScriptRoot ".server-process.json"

# Try to find process from saved info
$savedProcess = $null
if (Test-Path $processInfoFile) {
    try {
        $savedProcess = Get-Content $processInfoFile | ConvertFrom-Json
        Write-Host "Found saved process info (PID: $($savedProcess.PID))" -ForegroundColor Gray
    } catch {
        Write-Host "Could not read process info file" -ForegroundColor Yellow
    }
}

# Find running node processes with lander
$processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    try {
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        $cmdLine -like "*ige.js*50-lander_virtual_keyboard*"
    } catch {
        $false
    }
}

if (-not $processes -and -not $savedProcess) {
    Write-Host "No running server found" -ForegroundColor Yellow
    Write-Host ""
    # Clean up process file if exists
    if (Test-Path $processInfoFile) {
        Remove-Item $processInfoFile -Force
    }
    exit 0
}

Write-Host "Stopping server..." -ForegroundColor Yellow

$stopped = $false

# Try to stop by saved PID first
if ($savedProcess) {
    try {
        $proc = Get-Process -Id $savedProcess.PID -ErrorAction Stop
        Stop-Process -Id $savedProcess.PID -Force
        Write-Host "  Stopped process (PID: $($savedProcess.PID))" -ForegroundColor Green
        $stopped = $true
    } catch {
        Write-Host "  Saved process not found" -ForegroundColor Gray
    }
}

# Stop any other matching processes
foreach ($process in $processes) {
    try {
        Stop-Process -Id $process.Id -Force
        Write-Host "  Stopped process (PID: $($process.Id))" -ForegroundColor Green
        $stopped = $true
    } catch {
        Write-Host "  Failed to stop process (PID: $($process.Id))" -ForegroundColor Red
    }
}

# Clean up process file
if (Test-Path $processInfoFile) {
    Remove-Item $processInfoFile -Force
}

if ($stopped) {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  SERVER STOPPED" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "No server processes were stopped" -ForegroundColor Yellow
    Write-Host ""
}



