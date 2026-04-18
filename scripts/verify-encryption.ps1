# Verify Encryption Status
Write-Host "🔐 Verifying Encryption Status" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

$dbPath = "$env:APPDATA\com.jana.importmanager\import-manager.db"

if (Test-Path $dbPath) {
    Write-Host "✅ Database exists" -ForegroundColor Green
    
    $fileInfo = Get-Item $dbPath
    Write-Host "Size: $($fileInfo.Length) bytes" -ForegroundColor Gray
    
    # Check if it's encrypted
    try {
        $bytes = [System.IO.File]::ReadAllBytes($dbPath)
        $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..15])
        
        if ($header -eq "SQLite format 3") {
            Write-Host "⚠️  Database is plaintext (not encrypted)" -ForegroundColor Yellow
        } else {
            Write-Host "🔐 Database is encrypted!" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "❌ Error reading database" -ForegroundColor Red
    }
} else {
    Write-Host "⏳ No database found yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Application should be running now!" -ForegroundColor Green

