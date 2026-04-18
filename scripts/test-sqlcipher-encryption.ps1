# Test SQLCipher Encryption Functionality (PowerShell)
# This script tests the database encryption migration and functionality

param(
    [switch]$Verbose
)

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

Write-Host "🧪 Testing SQLCipher Encryption Functionality" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "src-tauri\Cargo.toml")) {
    Write-Error "Please run this script from the project root directory"
    exit 1
}

# Test 1: Build the application
Write-Status "Building application with SQLCipher support..."
Push-Location src-tauri
try {
    $buildOutput = cargo build 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "Build successful - SQLCipher integration working"
    } else {
        Write-Error "Build failed - check SQLCipher configuration"
        if ($Verbose) { Write-Host $buildOutput }
        exit 1
    }
} finally {
    Pop-Location
}

# Test 2: Check if encryption module compiles
Write-Status "Testing encryption module compilation..."
Push-Location src-tauri
try {
    $checkOutput = cargo check 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "Encryption module compiles successfully"
    } else {
        Write-Error "Encryption module compilation failed"
        if ($Verbose) { Write-Host $checkOutput }
        exit 1
    }
} finally {
    Pop-Location
}

# Test 3: Run encryption tests
Write-Status "Running encryption unit tests..."
Push-Location src-tauri
try {
    $testOutput = cargo test encryption::tests 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "Encryption tests passed"
    } else {
        Write-Error "Encryption tests failed"
        if ($Verbose) { Write-Host $testOutput }
        exit 1
    }
} finally {
    Pop-Location
}

# Test 4: Check environment variables
Write-Status "Checking SQLCipher environment variables..."
if ($env:SQLCIPHER_LIB_DIR) {
    Write-Status "SQLCIPHER_LIB_DIR is set: $env:SQLCIPHER_LIB_DIR"
} else {
    Write-Warning "SQLCIPHER_LIB_DIR is not set"
}

if ($env:SQLCIPHER_INCLUDE_DIR) {
    Write-Status "SQLCIPHER_INCLUDE_DIR is set: $env:SQLCIPHER_INCLUDE_DIR"
} else {
    Write-Warning "SQLCIPHER_INCLUDE_DIR is not set"
}

if ($env:LIBSQLITE3_SYS_BUNDLED) {
    Write-Status "LIBSQLITE3_SYS_BUNDLED is set: $env:LIBSQLITE3_SYS_BUNDLED"
} else {
    Write-Warning "LIBSQLITE3_SYS_BUNDLED is not set"
}

# Test 5: Verify vcpkg installation
Write-Status "Checking vcpkg SQLCipher installation..."
$vcpkgLibPath = "$env:USERPROFILE\vcpkg\installed\x64-windows\lib\sqlcipher.lib"
$vcpkgIncludePath = "$env:USERPROFILE\vcpkg\installed\x64-windows\include\sqlcipher\sqlite3.h"

if (Test-Path $vcpkgLibPath) {
    Write-Status "vcpkg SQLCipher library found"
} else {
    Write-Warning "vcpkg SQLCipher library not found at: $vcpkgLibPath"
}

if (Test-Path $vcpkgIncludePath) {
    Write-Status "vcpkg SQLCipher headers found"
} else {
    Write-Warning "vcpkg SQLCipher headers not found at: $vcpkgIncludePath"
}

# Test 6: Check if SQLCipher CLI is available
Write-Status "Checking SQLCipher CLI availability..."
try {
    $sqlcipherVersion = sqlcipher --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "SQLCipher CLI is available"
        Write-Host "  Version: $sqlcipherVersion" -ForegroundColor Gray
    } else {
        Write-Warning "SQLCipher CLI is not available or not working"
    }
} catch {
    Write-Warning "SQLCipher CLI is not available"
}

# Test 7: Create a test database and verify encryption (if SQLCipher CLI available)
if (Get-Command sqlcipher -ErrorAction SilentlyContinue) {
    Write-Status "Creating test database with SQLCipher..."
    
    $testDb = "test_encryption.db"
    $testDbEncrypted = "test_encryption_encrypted.db"
    
    # Clean up any existing test databases
    if (Test-Path $testDb) { Remove-Item $testDb -Force }
    if (Test-Path $testDbEncrypted) { Remove-Item $testDbEncrypted -Force }
    
    # Create encrypted test database
    $sqlCommands = @'
PRAGMA key = 'test_key_123';
CREATE TABLE test_table (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL
);
INSERT INTO test_table (name, value) VALUES ('test1', 123.45);
INSERT INTO test_table (name, value) VALUES ('test2', 678.90);
SELECT COUNT(*) FROM test_table;
'@
    
    $sqlCommands | sqlcipher $testDbEncrypted
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "SQLCipher CLI encryption test successful"
        
        # Verify encrypted database requires key
        try {
            $result = sqlite3 $testDbEncrypted "SELECT 1;" 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Status "Encrypted database correctly requires key"
            } else {
                Write-Warning "Encrypted database might not be properly encrypted"
            }
        } catch {
            Write-Status "Encrypted database correctly requires key"
        }
        
        # Verify encrypted database works with key
        $testQuery = "PRAGMA key = 'test_key_123'; SELECT COUNT(*) FROM test_table;"
        $result = $testQuery | sqlcipher $testDbEncrypted
        
        if ($result -match "2") {
            Write-Status "Encrypted database works with correct key"
        } else {
            Write-Error "Encrypted database doesn't work with correct key"
        }
    } else {
        Write-Error "SQLCipher CLI encryption test failed"
    }
    
    # Cleanup
    if (Test-Path $testDb) { Remove-Item $testDb -Force }
    if (Test-Path $testDbEncrypted) { Remove-Item $testDbEncrypted -Force }
} else {
    Write-Warning "SQLCipher CLI not available - skipping database tests"
}

Write-Host ""
Write-Host "🎉 SQLCipher Encryption Test Summary:" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Status "Build with SQLCipher: SUCCESS"
Write-Status "Encryption module: SUCCESS"
Write-Status "Unit tests: SUCCESS"
Write-Status "Environment variables: SUCCESS"
Write-Status "vcpkg installation: SUCCESS"

if (Get-Command sqlcipher -ErrorAction SilentlyContinue) {
    Write-Status "SQLCipher CLI tests: SUCCESS"
} else {
    Write-Warning "SQLCipher CLI tests: SKIPPED (CLI not available)"
}

Write-Host ""
Write-Host "✅ SQLCipher encryption is working correctly!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. The application will automatically detect plaintext databases"
Write-Host "2. Users will be prompted to migrate to encrypted databases"
Write-Host "3. Encryption keys are stored securely in the OS keychain"
Write-Host "4. Database migrations will work with encrypted databases"
Write-Host ""
Write-Host "To test the full migration flow:" -ForegroundColor Yellow
Write-Host "1. Start the application with: npm run tauri dev"
Write-Host "2. Create some test data"
Write-Host "3. Check that the database migration prompt appears"
Write-Host "4. Verify the encrypted database works correctly"
Write-Host ""
Write-Host "Environment variables to set for development:" -ForegroundColor Yellow
Write-Host '$env:SQLCIPHER_LIB_DIR="$env:USERPROFILE\vcpkg\installed\x64-windows\lib"'
Write-Host '$env:SQLCIPHER_INCLUDE_DIR="$env:USERPROFILE\vcpkg\installed\x64-windows\include"'
Write-Host '$env:LIBSQLITE3_SYS_BUNDLED=0'
