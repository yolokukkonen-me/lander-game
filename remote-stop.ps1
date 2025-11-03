# ============================================================
# STOP REMOTE LANDER SERVER
# ============================================================
# Usage: .\remote-stop.ps1

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc"
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  STOP REMOTE LANDER SERVER" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check & 'C:\Windows\System32\OpenSSH\ssh.exe' key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: & 'C:\Windows\System32\OpenSSH\ssh.exe' key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "[1/2] Connecting to server..." -ForegroundColor Green
try {
    $testResult = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$User@$Server" "echo 'OK'" 2>&1
    if ($testResult -notlike "*OK*") {
        throw "& 'C:\Windows\System32\OpenSSH\ssh.exe' connection failed"
    }
    Write-Host "  OK: Connected" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
    exit 1
}

Write-Host "[2/2] Stopping lander service..." -ForegroundColor Yellow

$stopScript = @"
sudo systemctl stop lander
sleep 2
sudo systemctl status lander --no-pager | head -10
"@

try {
    $output = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" $stopScript
    Write-Host $output
    
    if ($output -like "*Active: inactive*" -or $output -like "*Active: failed*") {
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "  SERVER STOPPED" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "To start again: .\remote-start.ps1" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "WARNING: Service status unclear" -ForegroundColor Yellow
        Write-Host "Check status: .\remote-status.ps1" -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to stop service" -ForegroundColor Red
    Write-Host "Details: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "" -ForegroundColor Cyan
Write-Host "Press any key to close..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")


Write-Host "" -ForegroundColor Cyan
Write-Host "Press any key to close..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")


