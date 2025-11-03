# ============================================================
# START LOCAL LANDER SERVER
# ============================================================
# Usage: .\start-local.ps1

param(
    [int]$Port = 3002
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  STARTING LANDER LOCAL SERVER" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$ServerPath = Join-Path $PSScriptRoot "server"

# Check if server is already running
$existingProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*ige.js*50-lander_virtual_keyboard*"
}

if ($existingProcess) {
    Write-Host "Server is already running (PID: $($existingProcess.Id))" -ForegroundColor Yellow
    Write-Host "Use .\stop-local.ps1 to stop it first" -ForegroundColor Yellow
    exit 1
}

# Check if port is available
$portInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($portInUse) {
    Write-Host "ERROR: Port $Port is already in use!" -ForegroundColor Red
    Write-Host "Process using port: $(Get-Process -Id $portInUse.OwningProcess -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Checking Node.js..." -ForegroundColor Green
try {
    $nodeVersion = node --version
    Write-Host "  Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "  Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

Write-Host "[2/3] Starting server..." -ForegroundColor Green
Write-Host "  Port: $Port" -ForegroundColor Gray
Write-Host "  Path: $ServerPath" -ForegroundColor Gray

# Save process info for stopping later
$processInfoFile = Join-Path $PSScriptRoot ".server-process.json"

# Start server in new window
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "node"
$startInfo.Arguments = "ige.js -g ../examples/50-lander_virtual_keyboard"
$startInfo.WorkingDirectory = $ServerPath
$startInfo.UseShellExecute = $true

$process = [System.Diagnostics.Process]::Start($startInfo)

# Wait a bit for server to start
Start-Sleep -Seconds 2

# Check if process is still running
if ($process.HasExited) {
    Write-Host ""
    Write-Host "ERROR: Server failed to start!" -ForegroundColor Red
    exit 1
}

# Save process ID
@{
    PID = $process.Id
    Port = $Port
    StartTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
} | ConvertTo-Json | Out-File -FilePath $processInfoFile -Encoding UTF8

Write-Host "[3/3] Server started successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  SERVER RUNNING" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Process ID: $($process.Id)" -ForegroundColor White
Write-Host "  Node.js server: http://localhost:$Port (backend)" -ForegroundColor Gray
Write-Host "  Game URL: http://localhost/examples/50-lander_virtual_keyboard/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Commands:" -ForegroundColor Yellow
Write-Host "  Stop server:    .\stop-local.ps1" -ForegroundColor Gray
Write-Host "  Restart server: .\restart-local.ps1" -ForegroundColor Gray
Write-Host "  Check status:   .\status-local.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Opening browser in 3 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Open browser on OpenServer port 80 (not Node.js port 3000)
Start-Process "http://localhost/examples/50-lander_virtual_keyboard/"

Write-Host "Server logs visible in the opened terminal window" -ForegroundColor Gray

