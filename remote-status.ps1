# ============================================================
# CHECK REMOTE LANDER SERVER STATUS
# ============================================================
# Usage: .\remote-status.ps1

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc"
)

$ErrorActionPreference = "Continue"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  REMOTE LANDER SERVER STATUS" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check SSH key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "[1/4] Checking SSH connection..." -ForegroundColor Green
try {
    $testResult = ssh -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$User@$Server" "echo 'OK'" 2>&1
    if ($testResult -notlike "*OK*") {
        throw "SSH connection failed"
    }
    Write-Host "  OK: Connected" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Cannot connect to server" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    exit 1
}

Write-Host "[2/4] Checking lander service..." -ForegroundColor Green

try {
    Write-Host ""
    
    # Service Status
    Write-Host "=== Service Status ===" -ForegroundColor Cyan
    ssh -i $KeyPath "$User@$Server" "sudo systemctl status lander --no-pager --lines=15"
    Write-Host ""
    
    # Port Status
    Write-Host "=== Port Status ===" -ForegroundColor Cyan
    $portCheck = ssh -i $KeyPath "$User@$Server" "sudo ss -tulpn | grep ':3000' || echo 'Port 3000 not listening'"
    Write-Host $portCheck
    Write-Host ""
    
    # Recent Logs
    Write-Host "=== Recent Logs (last 5 lines) ===" -ForegroundColor Cyan
    ssh -i $KeyPath "$User@$Server" "sudo journalctl -u lander --no-pager -n 5 --output=short-precise"
    Write-Host ""
    
    # Get full status for decision making
    $serviceStatus = ssh -i $KeyPath "$User@$Server" "sudo systemctl is-active lander"
    
    if ($serviceStatus -eq "active") {
        Write-Host "[3/4] Checking HTTP access..." -ForegroundColor Green
        try {
            $response = Invoke-WebRequest -Uri "http://$Server/examples/50-lander_virtual_keyboard/" -UseBasicParsing -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Host "  OK: HTTP responding (200)" -ForegroundColor Green
            }
        } catch {
            Write-Host "  WARNING: HTTP not responding" -ForegroundColor Yellow
        }
        
        Write-Host "[4/4] Overall Status" -ForegroundColor Green
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "  SERVER: RUNNING" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "URLs:" -ForegroundColor Cyan
        Write-Host "  http://$Server/examples/50-lander_virtual_keyboard/" -ForegroundColor White
        Write-Host ""
        Write-Host "Commands:" -ForegroundColor Yellow
        Write-Host "  Stop:    .\remote-stop.ps1" -ForegroundColor Gray
        Write-Host "  Restart: .\remote-restart.ps1" -ForegroundColor Gray
        Write-Host "  Logs:    .\remote-logs.ps1" -ForegroundColor Gray
        Write-Host "  Deploy:  .\deploy.ps1" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "[3/4] Service not running" -ForegroundColor Red
        Write-Host "[4/4] Overall Status" -ForegroundColor Red
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Red
        Write-Host "  SERVER: STOPPED" -ForegroundColor Red
        Write-Host "=============================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "To start: .\remote-start.ps1" -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to check status" -ForegroundColor Red
    Write-Host "Details: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}

