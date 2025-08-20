# Check Encryption Status
Write-Host "Checking encryption status..." -ForegroundColor Cyan

$dbPath = "import-manager.db"
if (Test-Path $dbPath) {
    Write-Host "Database found!" -ForegroundColor Green
    
    $fileInfo = Get-Item $dbPath
    Write-Host "Size: $($fileInfo.Length) bytes" -ForegroundColor Yellow
    
    try {
        $bytes = [System.IO.File]::ReadAllBytes($dbPath)
        $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..15])
        
        if ($header -eq "SQLite format 3") {
            Write-Host "WARNING: Database is plaintext!" -ForegroundColor Red
        } else {
            Write-Host "SUCCESS: Database is encrypted!" -ForegroundColor Green
        }
    } catch {
        Write-Host "Error reading database" -ForegroundColor Red
    }
} else {
    Write-Host "No database found yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Application should be running now." -ForegroundColor Cyan
Write-Host "Try adding test data and then check again." -ForegroundColor Cyan
