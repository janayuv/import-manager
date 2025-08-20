# Fix installer issues for SQLCipher and WebView2
Write-Host "Fixing installer issues..." -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan

# 1. Ensure DLLs are copied before building
Write-Host "Step 1: Copying SQLCipher DLLs..." -ForegroundColor Yellow
& "$PSScriptRoot\copy-sqlcipher-dlls.ps1"

# 2. Check if WebView2 runtime is installed
Write-Host "Step 2: Checking WebView2 runtime..." -ForegroundColor Yellow
$webview2Installed = $false

# Check for WebView2 runtime in common locations
$webview2Paths = @(
    "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application\msedgewebview2.exe",
    "${env:ProgramFiles}\Microsoft\EdgeWebView\Application\msedgewebview2.exe",
    "${env:LOCALAPPDATA}\Microsoft\EdgeWebView\Application\msedgewebview2.exe"
)

foreach ($path in $webview2Paths) {
    if (Test-Path $path) {
        Write-Host "OK - WebView2 runtime found at: $path" -ForegroundColor Green
        $webview2Installed = $true
        break
    }
}

if (-not $webview2Installed) {
    Write-Host "WARNING - WebView2 runtime not found" -ForegroundColor Yellow
    Write-Host "Download and install from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/" -ForegroundColor Gray
}

# 3. Create app data directory with proper permissions
Write-Host "Step 3: Setting up app data directory..." -ForegroundColor Yellow
$appDataDir = "$env:LOCALAPPDATA\com.jana.importmanager"
$webviewDataDir = "$appDataDir\EBWebView"

try {
    # Create directories if they don't exist
    if (-not (Test-Path $appDataDir)) {
        New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null
        Write-Host "OK - Created app data directory: $appDataDir" -ForegroundColor Green
    }
    
    if (-not (Test-Path $webviewDataDir)) {
        New-Item -ItemType Directory -Path $webviewDataDir -Force | Out-Null
        Write-Host "OK - Created WebView data directory: $webviewDataDir" -ForegroundColor Green
    }
    
    # Set proper permissions
    $acl = Get-Acl $appDataDir
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule("Users", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $appDataDir -AclObject $acl
    
    Write-Host "OK - Set proper permissions on app data directory" -ForegroundColor Green
    
} catch {
    Write-Host "WARNING - Could not set up app data directory: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 4. Verify DLLs are in the right place
Write-Host "Step 4: Verifying DLLs..." -ForegroundColor Yellow
$tauriDir = Join-Path (Get-Location) "src-tauri"
$required_dlls = @("sqlcipher.dll", "libcrypto-3-x64.dll", "libssl-3-x64.dll", "zlib1.dll")

$allDllsPresent = $true
foreach ($dll in $required_dlls) {
    $dllPath = Join-Path $tauriDir $dll
    if (Test-Path $dllPath) {
        Write-Host "OK - $dll found" -ForegroundColor Green
    } else {
        Write-Host "ERROR - $dll missing" -ForegroundColor Red
        $allDllsPresent = $false
    }
}

if (-not $allDllsPresent) {
    Write-Host "ERROR: Some DLLs are missing. Please run the copy script again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "SUCCESS - Installer issues fixed!" -ForegroundColor Green
Write-Host "Ready to build the application." -ForegroundColor Green
