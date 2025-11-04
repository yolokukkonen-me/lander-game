# ============================================================
# DOWNLOAD TRAINING LOGS FROM REMOTE SERVER
# ============================================================
# Usage: 
#   .\remote-logs-download.ps1                    # Download all logs
#   .\remote-logs-download.ps1 -LastN 50          # Download last 50 logs
#   .\remote-logs-download.ps1 -LastDays 7        # Download logs from last 7 days

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc",
    [string]$OutputDir = ".\downloaded_logs",
    [int]$LastN = 0,
    [int]$LastDays = 0
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  TRAINING LOGS DOWNLOADER" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check SSH key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

$RemoteLogsPath = "/opt/lander/server/logs"

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    Write-Host "Created directory: $OutputDir" -ForegroundColor Green
}

Write-Host "Fetching logs list..." -ForegroundColor Yellow

# Build find command based on parameters
$FindCommand = "cd $RemoteLogsPath && find . -name 'success_segment_*.json'"

if ($LastDays -gt 0) {
    $FindCommand += " -mtime -$LastDays"
    Write-Host "Filter: Last $LastDays days" -ForegroundColor Cyan
} elseif ($LastN -gt 0) {
    $FindCommand += " | sort -r | head -$LastN"
    Write-Host "Filter: Last $LastN files" -ForegroundColor Cyan
} else {
    Write-Host "Filter: All files" -ForegroundColor Cyan
}

# Get list of files
$FilesList = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" $FindCommand 2>&1

if (-not $FilesList) {
    Write-Host "No logs found on server!" -ForegroundColor Red
    exit 1
}

# Convert to array and clean up
$Files = $FilesList | Where-Object { $_ -match "success_segment_" } | ForEach-Object { $_.Trim('./') }
$TotalFiles = $Files.Count

Write-Host "Found $TotalFiles log files" -ForegroundColor Green
Write-Host ""

if ($TotalFiles -eq 0) {
    Write-Host "Nothing to download!" -ForegroundColor Yellow
    exit 0
}

# Confirm download
Write-Host "Download $TotalFiles files to $OutputDir ?" -ForegroundColor Yellow
Write-Host "Press Enter to continue or Ctrl+C to cancel..." -ForegroundColor Gray
Read-Host

Write-Host ""
Write-Host "Downloading logs..." -ForegroundColor Green

# Use scp for bulk download
$ScpSource = "$User@${Server}:$RemoteLogsPath/success_segment_*.json"
$ScpDest = $OutputDir

try {
    & 'C:\Windows\System32\OpenSSH\scp.exe' -i $KeyPath -r $ScpSource $ScpDest 2>&1 | Out-Null
    
    # Count downloaded files
    $DownloadedCount = (Get-ChildItem -Path $OutputDir -Filter "success_segment_*.json").Count
    
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  DOWNLOAD COMPLETE!" -ForegroundColor Green
    Write-Host "  Files downloaded: $DownloadedCount" -ForegroundColor Green
    Write-Host "  Location: $OutputDir" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Analyze logs:   python analyze_successful_deliveries.py" -ForegroundColor White
    Write-Host "  2. Train BC model: cd ml_bot && python training/train_bc.py" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host "ERROR: Download failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

