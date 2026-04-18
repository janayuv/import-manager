# Start Tauri Development with SQLCipher
Write-Host "🔧 Starting Tauri Development with SQLCipher" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

# Set SQLCipher environment variables
$env:SQLCIPHER_LIB_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\lib"
$env:SQLCIPHER_INCLUDE_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\include"
$env:LIBSQLITE3_SYS_BUNDLED="0"

# Add vcpkg bin directory to PATH for DLL dependencies
$env:PATH += ";C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin"

Write-Host "✓ Environment variables set:" -ForegroundColor Green
Write-Host "  SQLCIPHER_LIB_DIR: $env:SQLCIPHER_LIB_DIR" -ForegroundColor Gray
Write-Host "  SQLCIPHER_INCLUDE_DIR: $env:SQLCIPHER_INCLUDE_DIR" -ForegroundColor Gray
Write-Host "  LIBSQLITE3_SYS_BUNDLED: $env:LIBSQLITE3_SYS_BUNDLED" -ForegroundColor Gray

# Verify SQLCipher library exists
if (Test-Path "$env:SQLCIPHER_LIB_DIR\sqlcipher.lib") {
    Write-Host "✓ SQLCipher library found" -ForegroundColor Green
} else {
    Write-Host "✗ SQLCipher library not found!" -ForegroundColor Red
    Write-Host "Installing SQLCipher..." -ForegroundColor Yellow
    & "$env:USERPROFILE\vcpkg\vcpkg.exe" install sqlcipher
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install SQLCipher" -ForegroundColor Red
        exit 1
    }
}

# Check if we're in the right directory
if (-not (Test-Path "src-tauri\Cargo.toml")) {
    Write-Host "✗ Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 Starting Tauri development server..." -ForegroundColor Cyan
Write-Host "This may take a moment to compile..." -ForegroundColor Yellow
Write-Host ""

# Start the development server
npm run tauri dev
