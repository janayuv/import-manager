$ErrorActionPreference = "Stop"

function Write-BuildFailureLogs {
  Write-Host "Build failed. Dumping diagnostic paths..."

  $pathsToDump = @(
    "src-tauri/target/debug/build",
    "src-tauri/target/release/build",
    "src-tauri/target/release/*.log"
  )

  foreach ($path in $pathsToDump) {
    Write-Host ""
    Write-Host "=== $path ==="
    $items = Get-ChildItem -Path $path -Recurse -Force -ErrorAction SilentlyContinue
    if ($null -eq $items -or $items.Count -eq 0) {
      Write-Host "(no files found)"
      continue
    }

    foreach ($item in $items) {
      Write-Host $item.FullName
    }
  }
}

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Invoke-NpmCiWithRetry {
  $maxAttempts = 3
  $lastExitCode = 0

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Write-Host "npm ci attempt $attempt/$maxAttempts"

    npm ci
    $lastExitCode = $LASTEXITCODE
    if ($lastExitCode -eq 0) {
      return
    }

    # Windows can transiently lock native .node binaries (EPERM / -4048).
    if ($lastExitCode -eq -4048 -and $attempt -lt $maxAttempts) {
      Write-Warning "npm ci hit EPERM file-lock (exit -4048). Retrying in 3 seconds..."
      Start-Sleep -Seconds 3
      continue
    }

    break
  }

  throw "Install dependencies failed with exit code $lastExitCode"
}

function Assert-Installers {
  $bundleRoot = "src-tauri/target/release/bundle"

  Write-Host ""
  Write-Host "Bundle contents:"
  if (Test-Path -Path $bundleRoot) {
    Get-ChildItem -Path $bundleRoot -Recurse
  } else {
    Write-Host "(bundle directory missing)"
  }

  $msiFiles = Get-ChildItem -Path "$bundleRoot/**/*.msi" -File -ErrorAction SilentlyContinue
  if ($null -eq $msiFiles -or $msiFiles.Count -eq 0) {
    Write-Error "MSI installer missing"
    exit 1
  }

  $nsisExeFiles = Get-ChildItem -Path "$bundleRoot/**/nsis/**/*.exe" -File -ErrorAction SilentlyContinue
  if ($null -eq $nsisExeFiles -or $nsisExeFiles.Count -eq 0) {
    Write-Error "NSIS installer missing"
    exit 1
  }

  $exeDirs = Get-ChildItem -Path $bundleRoot -Directory -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "exe" }
  if ($exeDirs.Count -gt 0) {
    $standaloneExeFiles = Get-ChildItem -Path "$bundleRoot/**/exe/**/*.exe" -File -ErrorAction SilentlyContinue
    if ($null -eq $standaloneExeFiles -or $standaloneExeFiles.Count -eq 0) {
      Write-Error "Standalone EXE missing"
      exit 1
    }
  }
}

# Match release workflow environment for local validation.
$env:HUSKY = "0"
$env:CI = "true"
$env:LIBSQLITE3_SYS_BUNDLED = "1"
$env:SQLCIPHER_LIB_DIR = "C:\vcpkg\installed\x64-windows\lib"
$env:SQLCIPHER_INCLUDE_DIR = "C:\vcpkg\installed\x64-windows\include"

Invoke-Step -Name "Validate Node.js version" -Action {
  $nodeVersion = (node -v).Trim()
  Write-Host $nodeVersion
  if ($nodeVersion -notmatch "^v22\.") {
    Write-Error "Node.js 22.x required"
    exit 1
  }
}

Invoke-Step -Name "Validate Rust toolchain" -Action {
  rustc --version
}

Invoke-Step -Name "Install dependencies" -Action {
  Invoke-NpmCiWithRetry
}

try {
  Invoke-Step -Name "Build Tauri application" -Action {
    npm run tauri build
  }
} catch {
  Write-BuildFailureLogs
  throw
}

Assert-Installers

$commitSha = (git rev-parse HEAD).Trim()
$utcDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$metadataContent = @"
Tag: local-test
Commit: $commitSha
Date: $utcDate
"@
$metadataPath = "release-metadata.txt"
Set-Content -Path $metadataPath -Value $metadataContent -Encoding ascii
Write-Host ""
Write-Host "Wrote $metadataPath"

Invoke-Step -Name "Generate schema drift report" -Action {
  npm run generate:drift-report
}

Write-Host ""
Write-Host "LOCAL RELEASE CHECK PASSED"
Write-Host "Installers generated successfully"
Write-Host "Safe to create GitHub tag"
