# ============================================================
# MANAGE REMOTE NGINX SERVER
# ============================================================
# Usage: .\remote-nginx.ps1 [-Action status|restart|reload]

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc",
    [ValidateSet("status", "restart", "reload", "stop", "start")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  MANAGE REMOTE NGINX" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "  Action: $Action" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check SSH key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "Connecting to server..." -ForegroundColor Green
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

Write-Host "Executing: nginx $Action..." -ForegroundColor Yellow
Write-Host ""

try {
    if ($Action -eq "status") {
        Write-Host "=== Nginx Service Status ===" -ForegroundColor Cyan
        ssh -i $KeyPath "$User@$Server" "sudo systemctl status nginx --no-pager --lines=15"
        Write-Host ""
        Write-Host "=== Nginx Configuration Test ===" -ForegroundColor Cyan
        ssh -i $KeyPath "$User@$Server" "sudo nginx -t 2>&1"
    }
    elseif ($Action -eq "restart") {
        ssh -i $KeyPath "$User@$Server" "sudo systemctl restart nginx && sleep 2 && sudo systemctl status nginx --no-pager --lines=15"
        Write-Host "OK: Nginx restarted" -ForegroundColor Green
    }
    elseif ($Action -eq "reload") {
        ssh -i $KeyPath "$User@$Server" "sudo nginx -t 2>&1 && sudo systemctl reload nginx"
        Write-Host ""
        Write-Host "OK: Nginx configuration reloaded (no downtime)" -ForegroundColor Green
        Write-Host ""
        ssh -i $KeyPath "$User@$Server" "sudo systemctl status nginx --no-pager --lines=10"
    }
    elseif ($Action -eq "stop") {
        ssh -i $KeyPath "$User@$Server" "sudo systemctl stop nginx && sudo systemctl status nginx --no-pager --lines=10"
        Write-Host "OK: Nginx stopped" -ForegroundColor Yellow
    }
    elseif ($Action -eq "start") {
        ssh -i $KeyPath "$User@$Server" "sudo systemctl start nginx && sleep 2 && sudo systemctl status nginx --no-pager --lines=15"
        Write-Host "OK: Nginx started" -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  NGINX $($Action.ToUpper()) COMPLETED" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to $Action nginx" -ForegroundColor Red
    Write-Host "Details: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}

