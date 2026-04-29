$ErrorActionPreference = "Stop"

function Invoke-NpmCiWithRecovery {
  $maxAttempts = 3

  for ($i = 1; $i -le $maxAttempts; $i++) {
    Write-Host "npm ci attempt $i/$maxAttempts"

    npm ci

    if ($LASTEXITCODE -eq 0) {
      Write-Host "npm ci success"
      return
    }

    Write-Warning "npm ci failed - attempting recovery..."

    taskkill /F /IM node.exe 2>$null

    $oxidePath = "node_modules\@tailwindcss\oxide"

    if (Test-Path $oxidePath) {
      Write-Host "Removing locked oxide module..."
      Remove-Item `
        $oxidePath `
        -Recurse `
        -Force `
        -ErrorAction SilentlyContinue
    }

    if ($i -eq $maxAttempts) {
      Write-Warning "Final recovery: removing node_modules"

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

      Write-Host "Reinstalling dependencies..."

      npm install

      if ($LASTEXITCODE -eq 0) {
        Write-Host "npm install success"
        return
      }
    }

    Start-Sleep -Seconds 3
  }

  Write-Error "npm ci failed after full recovery"
  exit 1
}

Write-Host ""
Write-Host "=== PRE-BUILD VERIFICATION START ==="
Write-Host ""

$env:HUSKY = "0"
$env:CI = "true"
$env:LIBSQLITE3_SYS_BUNDLED = "1"
$env:SQLCIPHER_LIB_DIR = "C:\vcpkg\installed\x64-windows\lib"
$env:SQLCIPHER_INCLUDE_DIR = "C:\vcpkg\installed\x64-windows\include"

Write-Host "Environment variables set"

$nodeVersion = (node -v).Trim()
Write-Host "Node version: $nodeVersion"
if ($nodeVersion -notmatch "^v22") {
  Write-Error "Node.js 22.x required"
  exit 1
}

npm -v
if ($LASTEXITCODE -ne 0) {
  Write-Error "npm not installed"
  exit 1
}

rustc --version
if ($LASTEXITCODE -ne 0) {
  Write-Error "Rust not installed"
  exit 1
}

cargo --version
if ($LASTEXITCODE -ne 0) {
  Write-Error "Cargo not installed"
  exit 1
}

npx tauri -V
if ($LASTEXITCODE -ne 0) {
  Write-Error "Tauri CLI missing"
  exit 1
}

Write-Host ""
Write-Host "Running npm ci..."

Invoke-NpmCiWithRecovery

if (!(Test-Path "src-tauri\tauri.conf.json")) {
  Write-Error "tauri.conf.json missing"
  exit 1
}

$tauriConfig = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json

if (-not $tauriConfig.bundle.active) {
  Write-Error "Bundle is disabled in tauri.conf.json"
  exit 1
}

Write-Host "Bundle configuration OK"

$targets = $tauriConfig.bundle.targets

if ($targets -eq "all") {
  Write-Host "Bundle targets: all (valid)"
} else {
  if ($targets -notcontains "msi") {
    Write-Error "MSI target missing"
    exit 1
  }

  if ($targets -notcontains "nsis") {
    Write-Error "NSIS target missing"
    exit 1
  }

  Write-Host "Bundle targets OK"
}

Write-Host ""
Write-Host "=== PRE-BUILD VERIFICATION PASSED ==="
Write-Host ""

exit 0
