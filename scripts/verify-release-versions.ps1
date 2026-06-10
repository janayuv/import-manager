#Requires -Version 5.1
<#
.SYNOPSIS
    Verifies all version fields are in sync before a release.
    Blocks if package.json / Cargo.toml / tauri.conf.json disagree.
    Called by the pre-push Husky hook and can be run manually.
.EXAMPLE
    .\scripts\verify-release-versions.ps1
    .\scripts\verify-release-versions.ps1 -Strict   # also checks git tag exists
#>
param(
    [switch]$Strict   # additionally require a matching git tag on HEAD
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

function Get-JsonVersion([string]$path) {
    $j = Get-Content $path -Raw | ConvertFrom-Json
    return $j.version
}

function Get-CargoVersion([string]$path) {
    $line = Select-String -Path $path -Pattern '^version\s*=' | Select-Object -First 1
    if (-not $line) { throw "No version field in $path" }
    return ($line.Line -replace '^version\s*=\s*"([^"]+)".*', '$1').Trim()
}

$packageJson = Join-Path $root "package.json"
$cargoToml   = Join-Path $root "src-tauri\Cargo.toml"
$tauriConf   = Join-Path $root "src-tauri\tauri.conf.json"

$vPkg   = Get-JsonVersion $packageJson
$vCargo = Get-CargoVersion $cargoToml
$vTauri = Get-JsonVersion $tauriConf

Write-Host ""
Write-Host "=== Release version check ==="
Write-Host "  package.json          : $vPkg"
Write-Host "  src-tauri/Cargo.toml  : $vCargo"
Write-Host "  tauri.conf.json       : $vTauri"
Write-Host ""

$mismatch = $false

if ($vPkg -ne $vCargo) {
    Write-Host "ERROR: package.json ($vPkg) != Cargo.toml ($vCargo)" -ForegroundColor Red
    $mismatch = $true
}
if ($vPkg -ne $vTauri) {
    Write-Host "ERROR: package.json ($vPkg) != tauri.conf.json ($vTauri)" -ForegroundColor Red
    $mismatch = $true
}

if ($mismatch) {
    Write-Host ""
    Write-Host "Fix: run  .\scripts\bump-version.ps1 -Version $vPkg" -ForegroundColor Yellow
    Write-Host "     then  git add src-tauri/Cargo.toml src-tauri/tauri.conf.json package.json" -ForegroundColor Yellow
    exit 1
}

Write-Host "All version files agree: v$vPkg" -ForegroundColor Green

if ($Strict) {
    $tag = "v$vPkg"
    $tagExists = git tag --list $tag
    if (-not $tagExists) {
        Write-Host ""
        Write-Host "WARN: git tag $tag not found on this repo." -ForegroundColor Yellow
        Write-Host "      To release, run: git tag $tag && git push origin main --tags" -ForegroundColor Yellow
        Write-Host "      Do NOT use 'gh release create' manually -- CI builds latest.json." -ForegroundColor Yellow
    } else {
        Write-Host "Git tag $tag exists." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Correct release flow ===" -ForegroundColor Cyan
Write-Host "  1. .\scripts\bump-version.ps1 -Version X.Y.Z"
Write-Host "  2. git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json"
Write-Host "  3. git commit -m 'chore: bump version to vX.Y.Z'"
Write-Host "  4. git push origin main"
Write-Host "  5. git tag vX.Y.Z && git push origin vX.Y.Z"
Write-Host "     ^ This triggers CI which builds MSI + latest.json"
Write-Host "  DO NOT use 'gh release create' -- it skips the CI build." -ForegroundColor Red
Write-Host ""
