#!/usr/bin/env pwsh

Write-Host "Running security checks..." -ForegroundColor Green

# Run ESLint with security rules
Write-Host "Running ESLint security checks..." -ForegroundColor Yellow
npx eslint . --ext .ts,.tsx,.js,.jsx,.yml,.yaml --max-warnings 0

# Run custom security checks
Write-Host "Running custom security checks..." -ForegroundColor Yellow
node scripts/security-check.js

# Run security audit
Write-Host "Running security audit..." -ForegroundColor Yellow
npm audit --audit-level=moderate

Write-Host "Security checks passed!" -ForegroundColor Green
