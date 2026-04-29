$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "===================================="
Write-Host " POST-BUILD VERIFICATION START"
Write-Host "===================================="
Write-Host ""

$bundlePath = "src-tauri\target\release\bundle"

if (!(Test-Path $bundlePath)) {
  Write-Error "Bundle folder missing"
  exit 1
}

Write-Host "Bundle folder found"

$msiFiles = Get-ChildItem `
  "$bundlePath\msi" `
  -Recurse `
  -Filter *.msi `
  -ErrorAction SilentlyContinue

if (!$msiFiles) {
  Write-Error "MSI installer missing"
  exit 1
}

Write-Host "MSI found:"
$msiFiles | ForEach-Object {
  Write-Host $_.FullName
}

$nsisFiles = Get-ChildItem `
  "$bundlePath\nsis" `
  -Recurse `
  -Filter *.exe `
  -ErrorAction SilentlyContinue

if (!$nsisFiles) {
  Write-Error "NSIS installer missing"
  exit 1
}

Write-Host "NSIS installer found:"
$nsisFiles | ForEach-Object {
  Write-Host $_.FullName
}

Write-Host ""
Write-Host "===================================="
Write-Host " POST-BUILD VERIFICATION PASSED"
Write-Host "===================================="
Write-Host ""

exit 0
