# ============================================================
# VIEW TRAINING LOGS ON REMOTE SERVER
# ============================================================
# Usage: .\remote-logs-view.ps1

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc",
    [switch]$Detailed
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  TRAINING LOGS VIEWER" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check SSH key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

$LogsPath = "/opt/lander/examples/50-lander_virtual_keyboard/logs"

Write-Host "Fetching logs information..." -ForegroundColor Yellow
Write-Host ""

# Execute commands via SSH - each command separately
$CheckDir = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" "test -d $LogsPath && echo EXISTS || echo NOT_FOUND" 2>&1

if ($CheckDir -match "NOT_FOUND") {
    Write-Host "LOGS DIRECTORY NOT FOUND!" -ForegroundColor Red
    Write-Host "Expected path: $LogsPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Create logs directory first or collect some training data." -ForegroundColor Yellow
    exit 1
}

Write-Host "=== LOGS STATISTICS ===" -ForegroundColor Cyan

$TotalCount = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" "cd $LogsPath && ls success_segment_*.json 2>/dev/null | wc -l" 2>&1
Write-Host "Total segments: $TotalCount" -ForegroundColor Green

$TotalSize = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" "cd $LogsPath && du -sh . 2>/dev/null | cut -f1" 2>&1
Write-Host "Total size: $TotalSize" -ForegroundColor Green

$Oldest = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" "cd $LogsPath && ls -t success_segment_*.json 2>/dev/null | tail -1" 2>&1
Write-Host "Oldest: $Oldest" -ForegroundColor Yellow

$Newest = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" "cd $LogsPath && ls -t success_segment_*.json 2>/dev/null | head -1" 2>&1
Write-Host "Newest: $Newest" -ForegroundColor Yellow

Write-Host ""
Write-Host "=== LAST 15 SEGMENTS ===" -ForegroundColor Cyan
$FileList = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" "cd $LogsPath && ls -lht success_segment_*.json 2>/dev/null | head -15" 2>&1
Write-Host $FileList
Write-Host ""

# Show detailed info for specific file if requested
if ($Detailed) {
    Write-Host "=== FILE CONTENT PREVIEW ===" -ForegroundColor Cyan
    Write-Host "Enter filename to preview (or press Enter to skip): " -ForegroundColor Yellow -NoNewline
    $Filename = Read-Host
    
    if ($Filename) {
        Write-Host ""
        Write-Host "First 50 lines of ${Filename}:" -ForegroundColor Green
        & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" "cat $LogsPath/$Filename | head -50"
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "To download logs, run:" -ForegroundColor Green
Write-Host "  .\remote-logs-download.ps1" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan

