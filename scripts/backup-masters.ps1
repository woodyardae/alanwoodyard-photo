# ==============================================================================
# One-Way Deterministic Master Archive Backup (Hash-Gated)
# Target Remote: b2-masters:alanwoodyard-photo-masters
# Compatible: Windows PowerShell 5.1+
# ==============================================================================
param(
    [switch]$DryRun
)

$source = Join-Path (Get-Location) "assets\source-masters"
$remote = "b2-masters:alanwoodyard-photo-masters"

if (-not (Test-Path $source)) {
    Write-Error "Source directory not found: $source"
    exit 1
}

$argsList = @(
    "copy",
    $source,
    $remote,
    "--checksum",
    "--transfers", "4",
    "--fast-list",
    "--verbose"
)

if ($DryRun) {
    Write-Host "=== RUNNING IN DRY-RUN MODE (NO BYTES TRANSFERRED) ===" -ForegroundColor Yellow
    $argsList += "--dry-run"
}

Write-Host "Backing up master images to offsite B2 vault: $remote..." -ForegroundColor Cyan
& rclone @argsList

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nMaster archive push completed successfully." -ForegroundColor Green
} else {
    Write-Error "`nBackup failed with exit code $LASTEXITCODE."
}