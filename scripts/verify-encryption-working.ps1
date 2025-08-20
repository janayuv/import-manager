# Verify Encryption is Working
Write-Host "🔐 Verifying Encryption Status" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

# Check if database exists
$dbPath = "import-manager.db"
if (Test-Path $dbPath) {
    Write-Host "✓ Database file found" -ForegroundColor Green
    
    # Get file info
    $fileInfo = Get-Item $dbPath
    Write-Host "File size: $($fileInfo.Length) bytes" -ForegroundColor Yellow
    Write-Host "Created: $($fileInfo.CreationTime)" -ForegroundColor Yellow
    
    # Check if it's encrypted
    try {
        $bytes = [System.IO.File]::ReadAllBytes($dbPath)
        $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..15])
        
        if ($header -eq "SQLite format 3") {
            Write-Host "❌ WARNING: Database appears to be plaintext!" -ForegroundColor Red
            Write-Host "This means encryption is not working properly." -ForegroundColor Red
        } else {
            Write-Host "✅ SUCCESS: Database appears to be encrypted!" -ForegroundColor Green
            Write-Host "Header: $header" -ForegroundColor Gray
        }
    } catch {
        Write-Host "❌ Error reading database file" -ForegroundColor Red
    }
    
} else {
    Write-Host "⏳ No database file found yet" -ForegroundColor Yellow
    Write-Host "The application may still be starting or hasn't created data yet." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "=============" -ForegroundColor Cyan
Write-Host "1. If app is running, try adding some test data" -ForegroundColor Gray
Write-Host "2. Close the application" -ForegroundColor Gray
Write-Host "3. Run this script again to check encryption" -ForegroundColor Gray
Write-Host "4. Try: sqlite3 import-manager.db 'SELECT 1;'" -ForegroundColor Gray
Write-Host "   (should fail if encrypted)" -ForegroundColor Gray
