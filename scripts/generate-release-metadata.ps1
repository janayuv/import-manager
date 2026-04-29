$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Generating release metadata..."

$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$version = $packageJson.version

$commit = (git rev-parse HEAD).Trim()

$date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$nodeVersion = (node -v).Trim()
$npmVersion = (npm -v).Trim()
$rustVersion = (rustc --version).Trim()
$tauriVersion = (npx tauri -V).Trim()

$metadata = @"
RELEASE BUILD METADATA
========================================
Version: $version
Commit: $commit
Build Date: $date

Node: $nodeVersion
npm: $npmVersion
Rust: $rustVersion
Tauri: $tauriVersion

========================================
"@

$metadataPath = "release-metadata.txt"

$metadata | Out-File `
  $metadataPath `
  -Encoding utf8

Write-Host "Metadata saved to release-metadata.txt"
