# ============================================================
# START REMOTE LANDER SERVER
# ============================================================
# Usage: .\remote-start.ps1

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc"
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  START REMOTE LANDER SERVER" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check SSH key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Connecting to server..." -ForegroundColor Green
try {
    $testResult = ssh -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$User@$Server" "echo 'OK'" 2>&1
    if ($testResult -notlike "*OK*") {
        throw "SSH connection failed"
    }
    Write-Host "  OK: Connected" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] Starting lander service..." -ForegroundColor Yellow

$startScript = @"
sudo systemctl start lander
sleep 2
sudo systemctl status lander --no-pager | head -15
"@

try {
    $output = ssh -i $KeyPath "$User@$Server" $startScript
    Write-Host $output
    
    if ($output -like "*Active: active (running)*") {
        Write-Host ""
        Write-Host "[3/3] Checking service..." -ForegroundColor Green
        Write-Host "  OK: Service is running" -ForegroundColor Green
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "  SERVER STARTED SUCCESSFULLY!" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "URLs:" -ForegroundColor Cyan
        Write-Host "  http://$Server/examples/50-lander_virtual_keyboard/" -ForegroundColor White
        Write-Host ""
        Write-Host "Commands:" -ForegroundColor Yellow
        Write-Host "  Stop:    .\remote-stop.ps1" -ForegroundColor Gray
        Write-Host "  Restart: .\remote-restart.ps1" -ForegroundColor Gray
        Write-Host "  Status:  .\remote-status.ps1" -ForegroundColor Gray
        Write-Host "  Logs:    .\remote-logs.ps1" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "WARNING: Service started but status unclear" -ForegroundColor Yellow
        Write-Host "Check status: .\remote-status.ps1" -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to start service" -ForegroundColor Red
    Write-Host "Details: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}

