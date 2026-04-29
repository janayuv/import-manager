$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Running pre-build verification..."

powershell -ExecutionPolicy Bypass -File scripts/prebuild-check.ps1

if ($LASTEXITCODE -ne 0) {
  Write-Error "Pre-build verification failed"
  exit 1
}

Write-Host ""
Write-Host "Running Tauri build..."

npm run tauri build

if ($LASTEXITCODE -ne 0) {
  Write-Error "Build failed"
  exit 1
}

Write-Host ""
Write-Host "Running post-build verification..."

powershell -ExecutionPolicy Bypass `
  -File scripts/postbuild-check.ps1

if ($LASTEXITCODE -ne 0) {
  Write-Error "Post-build verification failed"
  exit 1
}

Write-Host ""
Write-Host "Generating release metadata..."

powershell -ExecutionPolicy Bypass `
  -File scripts/generate-release-metadata.ps1

if ($LASTEXITCODE -ne 0) {
  Write-Error "Release metadata generation failed"
  exit 1
}

Write-Host ""
Write-Host "=== BUILD SUCCESS ==="
