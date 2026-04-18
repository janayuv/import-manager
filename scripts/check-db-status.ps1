# Simple Database Status Check
Write-Host "Checking database status..." -ForegroundColor Cyan

$dbPath = "import-manager.db"
if (Test-Path $dbPath) {
    Write-Host "Database file found!" -ForegroundColor Green
    $fileSize = (Get-Item $dbPath).Length
    Write-Host "File size: $fileSize bytes" -ForegroundColor Yellow
    
    # Try to read header
    try {
        $bytes = [System.IO.File]::ReadAllBytes($dbPath)
        $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..15])
        Write-Host "Header: $header" -ForegroundColor Yellow
        
        if ($header -eq "SQLite format 3") {
            Write-Host "WARNING: Database appears to be plaintext" -ForegroundColor Red
        } else {
            Write-Host "SUCCESS: Database appears to be encrypted" -ForegroundColor Green
        }
    } catch {
        Write-Host "Could not read database file" -ForegroundColor Red
    }
} else {
    Write-Host "No database file found yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Application should be running now." -ForegroundColor Cyan
Write-Host "Try adding some test data to verify encryption is working." -ForegroundColor Cyan
