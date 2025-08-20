# Test Encryption Flow
Write-Host "🔐 Testing Database Encryption Flow" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

# Check if application is running
$tauriProcesses = Get-Process -Name "app" -ErrorAction SilentlyContinue
if ($tauriProcesses) {
    Write-Host "✅ Application is running" -ForegroundColor Green
} else {
    Write-Host "❌ Application is not running" -ForegroundColor Red
    Write-Host "   Start the application first with: npm run tauri dev" -ForegroundColor Yellow
    exit 1
}

# Wait a moment for database creation
Write-Host "⏳ Waiting for database initialization..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Check database location
$dbPath = "$env:APPDATA\com.jana.importmanager\import-manager.db"
if (Test-Path $dbPath) {
    Write-Host "✅ Database file exists at: $dbPath" -ForegroundColor Green
    
    $fileInfo = Get-Item $dbPath
    Write-Host "   Size: $($fileInfo.Length) bytes" -ForegroundColor Gray
    Write-Host "   Created: $($fileInfo.CreationTime)" -ForegroundColor Gray
    
    # Check encryption status
    try {
        $bytes = [System.IO.File]::ReadAllBytes($dbPath)
        $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..15])
        
        if ($header -eq "SQLite format 3") {
            Write-Host "⚠️  Database appears to be plaintext" -ForegroundColor Yellow
            Write-Host "   This might be normal for a new database" -ForegroundColor Gray
        } else {
            Write-Host "🔐 Database appears to be encrypted!" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "❌ Error reading database file" -ForegroundColor Red
    }
} else {
    Write-Host "⏳ No database file found yet" -ForegroundColor Yellow
    Write-Host "   Add some data to the application to create the database" -ForegroundColor Gray
}

# Check Windows Credential Manager
Write-Host ""
Write-Host "🔑 Checking Windows Credential Manager..." -ForegroundColor Cyan
try {
    $credential = cmdkey /list | Select-String "com.jana.importmanager"
    if ($credential) {
        Write-Host "✅ Encryption key found in Credential Manager" -ForegroundColor Green
    } else {
        Write-Host "⚠️  No encryption key found in Credential Manager" -ForegroundColor Yellow
        Write-Host "   This is normal if no data has been added yet" -ForegroundColor Gray
    }
}
catch {
    Write-Host "❌ Error checking Credential Manager" -ForegroundColor Red
}

Write-Host ""
Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "=============" -ForegroundColor Cyan
Write-Host "1. Add some test data to the application (supplier, invoice, etc.)" -ForegroundColor Gray
Write-Host "2. Close the application" -ForegroundColor Gray
Write-Host "3. Run this script again to verify encryption" -ForegroundColor Gray
Write-Host "4. Or run: powershell -ExecutionPolicy Bypass -File scripts\check-encryption.ps1" -ForegroundColor Gray
