# Generate Tauri Signing Keys (PowerShell)
# This script generates ED25519 keypair for Tauri application signing

param(
    [string]$OutputDir = "keys",
    [switch]$Force
)

# Function to write colored output
function Write-Status {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

Write-Host "🔑 Generating Tauri Signing Keys" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Check if OpenSSL is available
try {
    $opensslVersion = openssl version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "OpenSSL found: $opensslVersion"
    } else {
        Write-Error "OpenSSL not found. Please install OpenSSL first."
        Write-Host "Windows: choco install openssl" -ForegroundColor Yellow
        Write-Host "Or download from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Error "OpenSSL not found. Please install OpenSSL first."
    Write-Host "Windows: choco install openssl" -ForegroundColor Yellow
    Write-Host "Or download from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
    exit 1
}

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    Write-Status "Created output directory: $OutputDir"
} else {
    Write-Warning "Output directory already exists: $OutputDir"
    if (-not $Force) {
        $response = Read-Host "Do you want to overwrite existing keys? (y/N)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Host "Operation cancelled." -ForegroundColor Yellow
            exit 0
        }
    }
}

# Generate private key
$privateKeyPath = Join-Path $OutputDir "tauri_private.pem"
Write-Status "Generating ED25519 private key..."
openssl genpkey -algorithm ED25519 -out $privateKeyPath

if ($LASTEXITCODE -eq 0) {
    Write-Status "Private key generated: $privateKeyPath"
} else {
    Write-Error "Failed to generate private key"
    exit 1
}

# Generate public key
$publicKeyPath = Join-Path $OutputDir "tauri_public.pem"
Write-Status "Extracting public key..."
openssl pkey -in $privateKeyPath -pubout -out $publicKeyPath

if ($LASTEXITCODE -eq 0) {
    Write-Status "Public key extracted: $publicKeyPath"
} else {
    Write-Error "Failed to extract public key"
    exit 1
}

# Convert private key to base64 for GitHub Secrets
Write-Status "Converting private key to base64 for GitHub Secrets..."
$privateKeyContent = Get-Content $privateKeyPath -Raw
$privateKeyBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($privateKeyContent))
$base64Path = Join-Path $OutputDir "tauri_private_base64.txt"
$privateKeyBase64 | Out-File -FilePath $base64Path -Encoding UTF8

Write-Status "Base64 private key saved: $base64Path"

# Display public key content for tauri.conf.json
Write-Host ""
Write-Host "📋 PUBLIC KEY FOR tauri.conf.json:" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
$publicKeyContent = Get-Content $publicKeyPath -Raw
$publicKeyBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($publicKeyContent))
Write-Host $publicKeyBase64 -ForegroundColor Green

Write-Host ""
Write-Host "🔐 PRIVATE KEY FOR GITHUB SECRETS:" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Secret Name: TAURI_SIGNING_PRIVATE_KEY" -ForegroundColor Yellow
Write-Host "Secret Value: (see $base64Path)" -ForegroundColor Yellow

Write-Host ""
Write-Host "📝 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "=============" -ForegroundColor Cyan
Write-Status "1. Add the private key to GitHub Secrets:"
Write-Host "   - Go to your GitHub repository"
Write-Host "   - Settings → Secrets and variables → Actions"
Write-Host "   - Add new repository secret: TAURI_SIGNING_PRIVATE_KEY"
Write-Host "   - Use the content from: $base64Path" -ForegroundColor Gray

Write-Status "2. Update tauri.conf.json:"
Write-Host "   - Replace the placeholder in src-tauri/tauri.conf.json"
Write-Host "   - Use the public key shown above" -ForegroundColor Gray

Write-Status "3. Test the signing:"
Write-Host "   - Create a test release to verify signing works" -ForegroundColor Gray

Write-Host ""
Write-Host "⚠️  SECURITY NOTES:" -ForegroundColor Yellow
Write-Host "==================" -ForegroundColor Yellow
Write-Host "• Keep the private key secure and never commit it to the repository"
Write-Host "• The private key is stored in: $privateKeyPath"
Write-Host "• Backup the private key securely - you'll need it for future releases"
Write-Host "• If the private key is lost, you'll need to generate new keys and update users"

Write-Host ""
Write-Status "Key generation completed successfully!"
