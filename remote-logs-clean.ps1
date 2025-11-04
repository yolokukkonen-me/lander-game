# ============================================================
# CLEAN OLD TRAINING LOGS ON REMOTE SERVER
# ============================================================
# Usage: 
#   .\remote-logs-clean.ps1 -OlderThanDays 30     # Delete logs older than 30 days
#   .\remote-logs-clean.ps1 -OlderThanDays 7 -Archive  # Archive before delete

param(
    [string]$Server = "51.250.30.92",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\yc",
    [int]$OlderThanDays = 0,
    [switch]$Archive,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  TRAINING LOGS CLEANER" -ForegroundColor Cyan
Write-Host "  Server: $Server" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Validate parameters
if ($OlderThanDays -le 0) {
    Write-Host "ERROR: Please specify -OlderThanDays parameter" -ForegroundColor Red
    Write-Host "Example: .\remote-logs-clean.ps1 -OlderThanDays 30" -ForegroundColor Yellow
    exit 1
}

# Check SSH key
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

$RemoteLogsPath = "/opt/lander/server/logs"

Write-Host "Searching for logs older than $OlderThanDays days..." -ForegroundColor Yellow

# Find old files
$FindCommand = "cd $RemoteLogsPath && find . -name 'success_segment_*.json' -mtime +$OlderThanDays"
$OldFiles = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" $FindCommand 2>&1

if (-not $OldFiles) {
    Write-Host "No old logs found!" -ForegroundColor Green
    Write-Host "All logs are newer than $OlderThanDays days." -ForegroundColor Green
    exit 0
}

$FilesCount = ($OldFiles | Measure-Object).Count
Write-Host "Found $FilesCount files to delete" -ForegroundColor Yellow
Write-Host ""

# Show first 10 files as preview
Write-Host "Preview (first 10 files):" -ForegroundColor Cyan
$OldFiles | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
if ($FilesCount -gt 10) {
    Write-Host "  ... and $($FilesCount - 10) more" -ForegroundColor Gray
}
Write-Host ""

# Create archive if requested
if ($Archive) {
    Write-Host "Creating archive before deletion..." -ForegroundColor Yellow
    
    $ArchiveName = "logs_archive_$(Get-Date -Format 'yyyyMMdd_HHmmss').tar.gz"
    $ArchiveCommand = @"
cd $RemoteLogsPath
find . -name 'success_segment_*.json' -mtime +$OlderThanDays -print0 | tar -czf /tmp/$ArchiveName --null -T -
echo "Archive created: /tmp/$ArchiveName"
ls -lh /tmp/$ArchiveName
"@
    
    $ArchiveResult = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" $ArchiveCommand
    Write-Host $ArchiveResult -ForegroundColor Green
    Write-Host ""
    Write-Host "Archive location: /tmp/$ArchiveName" -ForegroundColor Cyan
    Write-Host "Download it with: scp -i $KeyPath $User@${Server}:/tmp/$ArchiveName ." -ForegroundColor Gray
    Write-Host ""
}

# Confirm deletion
if (-not $Force) {
    Write-Host "DELETE $FilesCount log files older than $OlderThanDays days?" -ForegroundColor Red
    Write-Host "This action CANNOT be undone!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Type 'yes' to confirm: " -ForegroundColor Yellow -NoNewline
    $Confirmation = Read-Host
    
    if ($Confirmation -ne "yes") {
        Write-Host "Operation cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "Deleting old logs..." -ForegroundColor Red

# Delete old files
$DeleteCommand = "cd $RemoteLogsPath && find . -name 'success_segment_*.json' -mtime +$OlderThanDays -delete"
& 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" $DeleteCommand 2>&1 | Out-Null

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  CLEANUP COMPLETE!" -ForegroundColor Green
Write-Host "  Deleted: $FilesCount files" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""

# Show remaining logs count
$RemainingCommand = "cd $RemoteLogsPath && ls success_segment_*.json 2>/dev/null | wc -l"
$Remaining = & 'C:\Windows\System32\OpenSSH\ssh.exe' -i $KeyPath "$User@$Server" $RemainingCommand
Write-Host "Remaining logs: $Remaining" -ForegroundColor Cyan

