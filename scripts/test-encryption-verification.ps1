# Test Encryption Verification Script
# This script helps verify that the encryption migration is working

Write-Host "🔐 Testing Encryption Migration Verification" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

# Function to write colored output
function Write-Status {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

Write-Info "Checking for encrypted database..."

# Check if database file exists
$dbPath = "import-manager.db"
if (Test-Path $dbPath) {
    Write-Status "Database file found: $dbPath"
    
    # Get file size
    $fileSize = (Get-Item $dbPath).Length
    Write-Info "Database file size: $fileSize bytes"
    
    # Check if it's encrypted by trying to read it with sqlite3
    Write-Info "Attempting to verify encryption status..."
    
    # Try to read the first few bytes to check if it's encrypted
    try {
        $bytes = [System.IO.File]::ReadAllBytes($dbPath)
        $header = [System.Text.Encoding]::ASCII.GetString($bytes[0..15])
        
        if ($header -eq "SQLite format 3") {
            Write-Warning "Database appears to be in plaintext format"
            Write-Host "This might mean encryption hasn't been applied yet." -ForegroundColor Yellow
        } else {
            Write-Status "Database appears to be encrypted (non-standard header)"
        }
    } catch {
        Write-Error "Could not read database file: $($_.Exception.Message)"
    }
    
    # Check for backup file
    $backupPath = "import-manager.db.backup"
    if (Test-Path $backupPath) {
        Write-Status "Backup file found: $backupPath"
        $backupSize = (Get-Item $backupPath).Length
        Write-Info "Backup file size: $backupSize bytes"
    } else {
        Write-Info "No backup file found (this is normal for new installations)"
    }
    
} else {
    Write-Info "No database file found yet - application may still be starting"
    Write-Host "The application should create an encrypted database on first run." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 WHAT TO LOOK FOR IN THE APPLICATION:" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "1. Application window should open successfully" -ForegroundColor Gray
Write-Host "2. No error messages about database encryption" -ForegroundColor Gray
Write-Host "3. Application should work normally (add invoices, expenses, etc.)" -ForegroundColor Gray
Write-Host "4. Check application logs for encryption-related messages" -ForegroundColor Gray

Write-Host ""
Write-Host "🔍 TO VERIFY ENCRYPTION IS WORKING:" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "1. Try to add some test data in the application" -ForegroundColor Gray
Write-Host "2. Close the application" -ForegroundColor Gray
Write-Host "3. Try to open the database file with a plain SQLite tool" -ForegroundColor Gray
Write-Host "4. If it's encrypted, you should see garbled data or get an error" -ForegroundColor Gray

Write-Host ""
Write-Host "🧪 TEST COMMANDS:" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan
Write-Host "To test if database is encrypted:" -ForegroundColor Gray
Write-Host "  sqlite3 import-manager.db 'SELECT * FROM sqlite_master;'" -ForegroundColor Yellow
Write-Host "If encrypted, this should fail with 'file is encrypted or is not a database'" -ForegroundColor Gray

Write-Host ""
Write-Host "✅ SUCCESS INDICATORS:" -ForegroundColor Green
Write-Host "====================" -ForegroundColor Green
Write-Host "✓ Application starts without errors" -ForegroundColor Gray
Write-Host "✓ Database file is created" -ForegroundColor Gray
Write-Host "✓ Plain SQLite tools cannot read the database" -ForegroundColor Gray
Write-Host "✓ Application can read/write data normally" -ForegroundColor Gray

Write-Host ""
Write-Host "Press any key to continue monitoring..." -ForegroundColor Yellow
Read-Host
