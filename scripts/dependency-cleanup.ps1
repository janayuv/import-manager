$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "===================================="
Write-Host " DEPENDENCY CLEANUP START"
Write-Host "===================================="
Write-Host ""

Write-Host "Checking outdated packages..."
npm outdated

Write-Host ""
Write-Host "Running npm audit..."
npm audit

Write-Host ""
Write-Host "Applying safe fixes..."
npm audit fix

Write-Host ""
Write-Host "Updating dependencies..."
npm update

Write-Host ""
Write-Host "Refreshing dependency tree..."

if (Test-Path "node_modules") {
  Remove-Item `
    "node_modules" `
    -Recurse `
    -Force `
    -ErrorAction SilentlyContinue
}

if (Test-Path "package-lock.json") {
  Remove-Item `
    "package-lock.json" `
    -Force `
    -ErrorAction SilentlyContinue
}

npm install

Write-Host ""
Write-Host "Scanning deprecated dependencies..."

npm ls inflight
npm ls lodash.isequal
npm ls rimraf
npm ls glob
npm ls prebuild-install
npm ls fstream

Write-Host ""
Write-Host "===================================="
Write-Host " DEPENDENCY CLEANUP COMPLETE"
Write-Host "===================================="
Write-Host ""

exit 0
