# ============================================================
# RESTART LOCAL LANDER SERVER
# ============================================================
# Usage: .\restart-local.ps1

param(
    [int]$Port = 3002
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  RESTARTING LANDER LOCAL SERVER" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Stop the server
Write-Host "[1/2] Stopping server..." -ForegroundColor Yellow
& "$PSScriptRoot\stop-local.ps1"

# Wait a bit
Start-Sleep -Seconds 1

# Start the server
Write-Host "[2/2] Starting server..." -ForegroundColor Yellow
& "$PSScriptRoot\start-local.ps1" -Port $Port

Write-Host "" -ForegroundColor Cyan
Write-Host "Press any key to close..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
