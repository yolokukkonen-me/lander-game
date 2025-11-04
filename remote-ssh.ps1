# ============================================================
# & 'C:\Windows\System32\OpenSSH\ssh.exe' INTO REMOTE SERVER
# ============================================================
# Usage: .\remote-ssh.ps1

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc"
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  CONNECTING TO REMOTE SERVER" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check & 'C:\Windows\System32\OpenSSH\ssh.exe' key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: & 'C:\Windows\System32\OpenSSH\ssh.exe' key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "Connecting via SSH..." -ForegroundColor Green
Write-Host ""
Write-Host "Useful commands once connected:" -ForegroundColor Yellow
Write-Host "  sudo systemctl status lander    # Check service" -ForegroundColor Gray
Write-Host "  sudo systemctl restart lander   # Restart service" -ForegroundColor Gray
Write-Host "  sudo journalctl -u lander -f    # View logs" -ForegroundColor Gray
Write-Host "  cd /opt/lander                  # Go to app folder" -ForegroundColor Gray
Write-Host "  ls -la /opt/ | grep backup      # View backups" -ForegroundColor Gray
Write-Host "  exit                            # Disconnect" -ForegroundColor Gray
Write-Host ""

& 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server"







