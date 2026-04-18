# Copy SQLCipher and OpenSSL DLLs for bundling
Write-Host "Copying SQLCipher DLLs for bundling" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Set vcpkg path
$vcpkg_bin_dir = "C:\Users\Yogeswari\vcpkg\installed\x64-windows\bin"
$project_dir = Get-Location
$tauri_dir = Join-Path $project_dir "src-tauri"

# List of required DLLs for SQLCipher
$required_dlls = @(
    "sqlcipher.dll",
    "libcrypto-3-x64.dll", 
    "libssl-3-x64.dll",
    "zlib1.dll"
)

Write-Host "Copying DLLs from: $vcpkg_bin_dir" -ForegroundColor Gray
Write-Host "To: $tauri_dir" -ForegroundColor Gray
Write-Host ""

$copied_count = 0
$missing_count = 0

foreach ($dll in $required_dlls) {
    $source_path = Join-Path $vcpkg_bin_dir $dll
    $target_path = Join-Path $tauri_dir $dll
    
    if (Test-Path $source_path) {
        Copy-Item -Path $source_path -Destination $target_path -Force -ErrorAction SilentlyContinue
        if ($?) {
            Write-Host "OK - Copied $dll" -ForegroundColor Green
            $copied_count++
        } else {
            Write-Host "ERROR - Failed to copy $dll" -ForegroundColor Red
            $missing_count++
        }
    } else {
        Write-Host "ERROR - $dll not found in vcpkg" -ForegroundColor Red
        $missing_count++
    }
}

Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Copied: $copied_count DLLs" -ForegroundColor Green

if ($missing_count -gt 0) {
    Write-Host "  Missing: $missing_count DLLs" -ForegroundColor Red
    Write-Host ""
    Write-Host "WARNING - Some DLLs are missing. Please ensure SQLCipher is properly installed:" -ForegroundColor Yellow
    Write-Host "  C:\Users\Yogeswari\vcpkg\vcpkg.exe install sqlcipher" -ForegroundColor Gray
    exit 1
} else {
    Write-Host "  Missing: $missing_count DLLs" -ForegroundColor Green
    Write-Host ""
    Write-Host "SUCCESS - All DLLs copied successfully! Ready for building." -ForegroundColor Green
}
