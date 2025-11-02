# ============================================================
# QUICK DEPLOY TO YANDEX.CLOUD
# ============================================================
# Usage: .\deploy.ps1

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc"
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  DEPLOY LANDER TO YANDEX.CLOUD" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# SSH and SCP paths
$SSH = "C:\Windows\System32\OpenSSH\ssh.exe"
$SCP = "C:\Windows\System32\OpenSSH\scp.exe"

# Check SSH key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

$LocalPath = $PSScriptRoot
Write-Host "[1/5] Local path: $LocalPath" -ForegroundColor Green

Write-Host "[2/5] Preparing files for deploy..." -ForegroundColor Green

# Check connection
Write-Host "[3/5] Checking SSH connection..." -ForegroundColor Green
try {
    $testResult = & $SSH -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$User@$Server" "echo 'OK'" 2>&1
    if ($testResult -notlike "*OK*") {
        throw "SSH connection failed"
    }
    Write-Host "  OK: SSH connection established" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: SSH failed: $_" -ForegroundColor Red
    exit 1
}

# Copy files via SCP
Write-Host "[4/5] Copying files to server..." -ForegroundColor Yellow
Write-Host "  (this may take a few minutes)" -ForegroundColor Gray

try {
    # Clean temp directory on server
    & $SSH -i $KeyPath "$User@$Server" "rm -rf /tmp/lander-deploy && mkdir -p /tmp/lander-deploy"
    
    # Copy main directories
    Write-Host "  -> Copying engine..." -ForegroundColor Gray
    & $SCP -i $KeyPath -r -o StrictHostKeyChecking=no "$LocalPath\engine" "$User@${Server}:/tmp/lander-deploy/"
    
    Write-Host "  -> Copying examples..." -ForegroundColor Gray
    & $SCP -i $KeyPath -r -o StrictHostKeyChecking=no "$LocalPath\examples" "$User@${Server}:/tmp/lander-deploy/"
    
    Write-Host "  -> Copying server..." -ForegroundColor Gray
    & $SCP -i $KeyPath -r -o StrictHostKeyChecking=no "$LocalPath\server" "$User@${Server}:/tmp/lander-deploy/"
    
    Write-Host "  -> Copying tools..." -ForegroundColor Gray
    & $SCP -i $KeyPath -r -o StrictHostKeyChecking=no "$LocalPath\tools" "$User@${Server}:/tmp/lander-deploy/"
    
    Write-Host "  OK: Files copied" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Copy failed: $_" -ForegroundColor Red
    exit 1
}

# Apply changes on server
Write-Host "[5/5] Applying changes on server..." -ForegroundColor Yellow

$RemoteScript = @'
#!/bin/bash
set -e

echo "-> Stopping game server..."
sudo systemctl stop lander

echo "-> Creating backup..."
sudo cp -r /opt/lander /opt/lander.backup.$(date +%Y%m%d_%H%M%S)

echo "-> Updating files..."
sudo rsync -av --delete /tmp/lander-deploy/ /opt/lander/

echo "-> Setting permissions..."
sudo chown -R www-data:www-data /opt/lander
sudo chmod -R 755 /opt/lander

echo "-> Installing npm dependencies..."
cd /opt/lander/server
sudo npm ci --production --quiet

echo "-> Starting game server..."
sudo systemctl start lander

echo "-> Checking status..."
sleep 3
sudo systemctl status lander --no-pager | head -15

echo ""
echo "OK: Deploy completed successfully!"
echo "URL: http://51.250.30.92/examples/50-lander_virtual_keyboard/"
'@

try {
    & $SSH -i $KeyPath "$User@$Server" $RemoteScript
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  SUCCESS: DEPLOY COMPLETED!" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Game URL:" -ForegroundColor Cyan
    Write-Host "  http://51.250.30.92/examples/50-lander_virtual_keyboard/" -ForegroundColor White
    Write-Host ""
    Write-Host "Clear browser cache: Ctrl+Shift+R" -ForegroundColor Yellow
    Write-Host ""
} catch {
    Write-Host ""
    Write-Host "ERROR: Deploy failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Rolling back..." -ForegroundColor Yellow
    & $SSH -i $KeyPath "$User@$Server" "sudo systemctl start lander"
    exit 1
}
