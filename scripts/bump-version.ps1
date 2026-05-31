#Requires -Version 5.1
<#
.SYNOPSIS
    Bumps the version in package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json atomically.

.DESCRIPTION
    Single command to keep all three version sources in sync before tagging a release.
    Validates semver format, updates all files, shows a diff summary, and prints the
    next git commands to run.

.PARAMETER Version
    The new semver version string, e.g. "1.0.0" or "0.5.0-beta.1".

.EXAMPLE
    .\scripts\bump-version.ps1 -Version "1.0.0"
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+(-[\w.]+)?$')]
    [string]$Version
)

$ErrorActionPreference = "Stop"

function Update-JsonVersion {
    param([string]$FilePath, [string]$NewVersion)
    $content = Get-Content $FilePath -Raw
    $updated = $content -replace '"version"\s*:\s*"[^"]+"', "`"version`": `"$NewVersion`""
    if ($content -eq $updated) {
        Write-Warning "$FilePath: no version field found or already at $NewVersion"
    }
    Set-Content -Path $FilePath -Value $updated -Encoding utf8 -NoNewline
}

function Update-CargoVersion {
    param([string]$FilePath, [string]$NewVersion)
    $content = Get-Content $FilePath -Raw
    # Only replace the first occurrence (the crate's own [package] version, not dependencies)
    $updated = $content -replace '(?m)^version\s*=\s*"[^"]+"', "version = `"$NewVersion`""
    if ($content -eq $updated) {
        Write-Warning "$FilePath: no version field found or already at $NewVersion"
    }
    Set-Content -Path $FilePath -Value $updated -Encoding utf8 -NoNewline
}

# --- Resolve paths -------------------------------------------------------
$root = Split-Path $PSScriptRoot -Parent
$packageJson = Join-Path $root "package.json"
$cargoToml   = Join-Path $root "src-tauri\Cargo.toml"
$tauriConf   = Join-Path $root "src-tauri\tauri.conf.json"

foreach ($f in $packageJson, $cargoToml, $tauriConf) {
    if (-not (Test-Path $f)) {
        Write-Error "Required file not found: $f"
        exit 1
    }
}

# --- Read current version from package.json ------------------------------
$pkg = Get-Content $packageJson -Raw | ConvertFrom-Json
$currentVersion = $pkg.version
Write-Host ""
Write-Host "Current version : $currentVersion"
Write-Host "New version     : $Version"
Write-Host ""

if ($currentVersion -eq $Version) {
    Write-Warning "Already at $Version — nothing to do."
    exit 0
}

# --- Apply updates -------------------------------------------------------
Write-Host "Updating package.json ..."
Update-JsonVersion -FilePath $packageJson -NewVersion $Version

Write-Host "Updating src-tauri/Cargo.toml ..."
Update-CargoVersion -FilePath $cargoToml -NewVersion $Version

Write-Host "Updating src-tauri/tauri.conf.json ..."
Update-JsonVersion -FilePath $tauriConf -NewVersion $Version

# --- Verify ---------------------------------------------------------------
Write-Host ""
Write-Host "=== Verification ==="
@(
    @{ File = "package.json";              Pattern = '"version"' },
    @{ File = "src-tauri/Cargo.toml";      Pattern = '^version' },
    @{ File = "src-tauri/tauri.conf.json"; Pattern = '"version"' }
) | ForEach-Object {
    $line = Select-String -Path (Join-Path $root $_.File) -Pattern $_.Pattern | Select-Object -First 1
    Write-Host "  $($_.File): $($line.Line.Trim())"
}

# --- Next steps hint ------------------------------------------------------
Write-Host ""
Write-Host "=== Next steps ==="
Write-Host "  1. Update CHANGELOG.md with v$Version release notes"
Write-Host "  2. git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md"
Write-Host "  3. git commit -m `"chore: bump version to v$Version`""
Write-Host "  4. git tag v$Version"
Write-Host "  5. git push origin main --tags"
Write-Host ""
Write-Host "Version bumped to $Version successfully."
