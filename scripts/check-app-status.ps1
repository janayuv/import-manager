# Check Application Status
Write-Host "🔍 Checking Application Status" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

# Check if Tauri process is running
$tauriProcesses = Get-Process -Name "app" -ErrorAction SilentlyContinue
if ($tauriProcesses) {
    Write-Host "✅ Tauri application is running" -ForegroundColor Green
    Write-Host "Process ID: $($tauriProcesses.Id)" -ForegroundColor Gray
} else {
    Write-Host "❌ Tauri application is not running" -ForegroundColor Red
}

# Check if database exists
$dbPath = "import-manager.db"
if (Test-Path $dbPath) {
    Write-Host "✅ Database file exists" -ForegroundColor Green
    
    $fileInfo = Get-Item $dbPath
    Write-Host "Size: $($fileInfo.Length) bytes" -ForegroundColor Yellow
    Write-Host "Created: $($fileInfo.CreationTime)" -ForegroundColor Yellow
    
    # Check encryption status
    try {
        $bytes = [System.IO.File]::ReadAllBytes($dbPath)
        $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..15])
        
        if ($header -eq "SQLite format 3") {
            Write-Host "⚠️  Database appears to be plaintext" -ForegroundColor Yellow
            Write-Host "   (This is normal for a new database)" -ForegroundColor Gray
        } else {
            Write-Host "🔐 Database appears to be encrypted!" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "❌ Error reading database file" -ForegroundColor Red
    }
} else {
    Write-Host "⏳ No database file found yet" -ForegroundColor Yellow
    Write-Host "   (This is normal if the app just started)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "=============" -ForegroundColor Cyan
Write-Host "1. If app is running, try adding some test data" -ForegroundColor Gray
Write-Host "2. Close the application" -ForegroundColor Gray
Write-Host "3. Run this script again to check encryption" -ForegroundColor Gray
Write-Host "4. Or run: powershell -ExecutionPolicy Bypass -File scripts\check-encryption.ps1" -ForegroundColor Gray
