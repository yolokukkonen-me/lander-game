# ============================================================
# VIEW REMOTE LANDER SERVER LOGS
# ============================================================
# Usage: .\remote-logs.ps1 [-Lines 50] [-Follow]

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc",
    [int]$Lines = 50,
    [switch]$Follow
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  REMOTE LANDER SERVER LOGS" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check & 'C:\Windows\System32\OpenSSH\ssh.exe' key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: & 'C:\Windows\System32\OpenSSH\ssh.exe' key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "Connecting to server..." -ForegroundColor Green
try {
    $testResult = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$User@$Server" "echo 'OK'" 2>&1
    if ($testResult -notlike "*OK*") {
        throw "& 'C:\Windows\System32\OpenSSH\ssh.exe' connection failed"
    }
    Write-Host "OK: Connected" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    exit 1
}

if ($Follow) {
    Write-Host "Streaming logs (Ctrl+C to stop)..." -ForegroundColor Yellow
    Write-Host ""
    $logsScript = "sudo journalctl -u lander -f --no-pager"
} else {
    Write-Host "Showing last $Lines lines..." -ForegroundColor Yellow
    Write-Host ""
    $logsScript = "sudo journalctl -u lander --no-pager -n $Lines"
}

try {
    & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" $logsScript
    
    if (-not $Follow) {
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Cyan
        Write-Host "  Press any key to close..." -ForegroundColor Yellow
        Write-Host "=============================================" -ForegroundColor Cyan
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to retrieve logs" -ForegroundColor Red
    Write-Host "Details: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to close..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

