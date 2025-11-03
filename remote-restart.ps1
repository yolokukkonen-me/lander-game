# ============================================================
# RESTART REMOTE LANDER SERVER
# ============================================================
# Usage: .\remote-restart.ps1

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc"
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  RESTART REMOTE LANDER SERVER" -ForegroundColor Cyan
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

Write-Host "[2/2] Restarting lander service..." -ForegroundColor Yellow

$restartScript = @"
sudo systemctl restart lander
sleep 3
sudo systemctl status lander --no-pager | head -15
"@

try {
    $output = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" $restartScript
    Write-Host $output
    
    if ($output -like "*Active: active (running)*") {
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "  SERVER RESTARTED SUCCESSFULLY!" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "URLs:" -ForegroundColor Cyan
        Write-Host "  http://$Server/examples/50-lander_virtual_keyboard/" -ForegroundColor White
        Write-Host ""
        Write-Host "Clear browser cache: Ctrl+Shift+R" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "WARNING: Service restarted but status unclear" -ForegroundColor Yellow
        Write-Host "Check status: .\remote-status.ps1" -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to restart service" -ForegroundColor Red
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


