#!/bin/bash
set -e

# Generate Tauri signing keys
# This script generates a new keypair for signing Tauri releases
# Run this once and store the private key securely in CI secrets

echo "Generating Tauri signing keypair..."

# Generate private key (ED25519 for better performance and security)
openssl genpkey -algorithm ED25519 -out tauri_private.pem

# Extract public key
openssl pkey -in tauri_private.pem -pubout -out tauri_public.pem

# Convert to base64 for Tauri config
echo "Converting public key to base64 for tauri.conf.json..."
PUBLIC_KEY_B64=$(base64 -w 0 < tauri_public.pem)

echo "=== SECURITY WARNING ==="
echo "1. Store tauri_private.pem securely - NEVER commit to repository"
echo "2. Add tauri_public.pem to repository for verification"
echo "3. Add private key to GitHub Secrets as TAURI_SIGNING_PRIVATE_KEY"
echo ""
echo "Public key (base64) for tauri.conf.json:"
echo "$PUBLIC_KEY_B64"
echo ""
echo "Private key content (add to GitHub Secrets):"
cat tauri_private.pem

# Set proper permissions
chmod 600 tauri_private.pem
chmod 644 tauri_public.pem

echo ""
echo "Keys generated successfully!"
echo "Next steps:"
echo "1. Add tauri_public.pem to repository"
echo "2. Add private key content to GitHub Secrets"
echo "3. Update tauri.conf.json with public key"
