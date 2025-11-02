# Test deployment after GitHub Actions deploy
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  TESTING DEPLOYMENT" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$server = "51.250.30.92"

Write-Host "[1/3] Checking server status..." -ForegroundColor Yellow
& "$PSScriptRoot\remote-status.ps1"

Write-Host ""
Write-Host "[2/3] Checking recent logs..." -ForegroundColor Yellow
& "$PSScriptRoot\remote-logs.ps1" -Lines 20

Write-Host ""
Write-Host "[3/3] Testing HTTP response..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://$server/examples/50-lander_virtual_keyboard/" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "  OK: Game is accessible!" -ForegroundColor Green
    }
} catch {
    Write-Host "  ERROR: Game not accessible" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  OPEN GAME" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Game URL: http://$server/examples/50-lander_virtual_keyboard/" -ForegroundColor White
Write-Host ""
Write-Host "Opening in browser..." -ForegroundColor Yellow
Start-Process "http://$server/examples/50-lander_virtual_keyboard/"
Write-Host ""
Write-Host "REMEMBER: Clear cache with Ctrl+Shift+R!" -ForegroundColor Yellow
Write-Host ""

