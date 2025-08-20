# Set Environment Variables and Start Instructions
Write-Host "Setting SQLCipher environment variables..." -ForegroundColor Cyan

# Set environment variables
$env:SQLCIPHER_LIB_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\lib"
$env:SQLCIPHER_INCLUDE_DIR="C:\Users\Yogeswari\vcpkg\installed\x64-windows\include"
$env:LIBSQLITE3_SYS_BUNDLED="0"

# Add vcpkg bin directory to PATH for DLL dependencies
$env:PATH += ";C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin"

Write-Host "Environment variables set successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Now you can start the development server with:" -ForegroundColor Cyan
Write-Host "npm run tauri dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "Or use the automated script:" -ForegroundColor Cyan
Write-Host "powershell -ExecutionPolicy Bypass -File scripts\start-dev-with-sqlcipher.ps1" -ForegroundColor Yellow
