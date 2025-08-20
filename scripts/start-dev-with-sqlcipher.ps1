# Start Tauri Development with SQLCipher
Write-Host "Starting Tauri development with SQLCipher..." -ForegroundColor Cyan

# Set SQLCipher environment variables
$env:SQLCIPHER_LIB_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\lib"
$env:SQLCIPHER_INCLUDE_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\include"
$env:LIBSQLITE3_SYS_BUNDLED="0"

# Add vcpkg bin directory to PATH for DLL dependencies
$env:PATH += ";C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin"

Write-Host "Environment variables set:" -ForegroundColor Green
Write-Host "SQLCIPHER_LIB_DIR: $env:SQLCIPHER_LIB_DIR" -ForegroundColor Yellow
Write-Host "SQLCIPHER_INCLUDE_DIR: $env:SQLCIPHER_INCLUDE_DIR" -ForegroundColor Yellow
Write-Host "LIBSQLITE3_SYS_BUNDLED: $env:LIBSQLITE3_SYS_BUNDLED" -ForegroundColor Yellow

# Verify SQLCipher library exists
if (Test-Path "$env:SQLCIPHER_LIB_DIR\sqlcipher.lib") {
    Write-Host "✓ SQLCipher library found" -ForegroundColor Green
} else {
    Write-Host "✗ SQLCipher library not found!" -ForegroundColor Red
    Write-Host "Please install SQLCipher first:" -ForegroundColor Yellow
    Write-Host "vcpkg install sqlcipher" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Starting Tauri development server..." -ForegroundColor Cyan
Write-Host "This may take a moment to compile..." -ForegroundColor Yellow

# Start the development server
npm run tauri dev
