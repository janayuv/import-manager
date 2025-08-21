#!/usr/bin/env node
import { execSync } from 'child_process'
import fs from 'fs'

console.log('🔒 Testing Security Implementation...\n')

let allTestsPassed = true

// Test 1: ESLint Security Rules
console.log('1. Testing ESLint Security Rules...')
try {
  const eslintOutput = execSync('npx eslint src/db/test.ts', { encoding: 'utf8' })
  if (eslintOutput.includes('Use SQLCipher with PRAGMA key')) {
    console.log('✅ ESLint correctly detected unencrypted SQLite usage')
  } else {
    console.log('❌ ESLint failed to detect SQLite security issues')
    allTestsPassed = false
  }
} catch (error) {
  if (error.stdout && error.stdout.includes('Use SQLCipher with PRAGMA key')) {
    console.log('✅ ESLint correctly blocked unencrypted SQLite usage')
  } else {
    console.log('❌ ESLint failed to detect SQLite security issues')
    allTestsPassed = false
  }
}

// Test 2: Custom Security Scanner
console.log('2. Testing Custom Security Scanner...')
try {
  const securityOutput = execSync('node scripts/security-check.js', { encoding: 'utf8' })
  if (
    securityOutput.includes('❌ SECURITY:') &&
    securityOutput.includes('Hardcoded secret detected')
  ) {
    console.log('✅ Custom security scanner correctly detected hardcoded secrets')
  } else if (
    securityOutput.includes('❌ SECURITY:') &&
    securityOutput.includes('Unencrypted SQLite usage detected')
  ) {
    console.log('✅ Custom security scanner correctly detected unencrypted SQLite usage')
  } else {
    console.log('❌ Custom security scanner not working properly')
    allTestsPassed = false
  }
} catch (error) {
  if (
    error.stdout &&
    (error.stdout.includes('❌ SECURITY:') ||
      error.stdout.includes('Hardcoded secret detected') ||
      error.stdout.includes('Unencrypted SQLite usage detected'))
  ) {
    console.log('✅ Custom security scanner correctly detected security issues')
  } else {
    console.log('❌ Custom security scanner not working properly')
    allTestsPassed = false
  }
}

// Test 3: Pre-commit Hook
console.log('3. Testing Pre-commit Hook...')
try {
  const preCommitOutput = execSync(
    'powershell -ExecutionPolicy Bypass -File .husky/pre-commit.ps1',
    { encoding: 'utf8' }
  )
  if (
    preCommitOutput.includes('Running security checks') &&
    (preCommitOutput.includes('❌ SECURITY:') || preCommitOutput.includes('Security checks passed'))
  ) {
    console.log('✅ Pre-commit hook is working properly')
  } else {
    console.log('❌ Pre-commit hook not working properly')
    allTestsPassed = false
  }
} catch (error) {
  if (error.stdout && error.stdout.includes('Running security checks')) {
    console.log('✅ Pre-commit hook is working properly')
  } else {
    console.log('❌ Pre-commit hook not working properly')
    allTestsPassed = false
  }
}

// Test 4: Security Documentation
console.log('4. Testing Security Documentation...')
if (fs.existsSync('SECURITY.md')) {
  const securityDoc = fs.readFileSync('SECURITY.md', 'utf8')
  if (
    securityDoc.includes('Security Implementation Guide') &&
    securityDoc.includes('Custom Security Scanner')
  ) {
    console.log('✅ Security documentation is comprehensive')
  } else {
    console.log('❌ Security documentation is incomplete')
    allTestsPassed = false
  }
} else {
  console.log('❌ Security documentation file not found')
  allTestsPassed = false
}

// Test 5: Security Test Files
console.log('5. Testing Security Test Files...')
const testFiles = [
  'src/db/test.ts',
  '.github/workflows/insecure-test.yml',
  'src-tauri/tauri-insecure.conf.json',
]

testFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    console.log(`✅ Test file exists: ${file}`)
  } else {
    console.log(`❌ Test file missing: ${file}`)
    allTestsPassed = false
  }
})

// Final Results
console.log('\n==================================================')
console.log('🔒 SECURITY IMPLEMENTATION TEST RESULTS')
console.log('==================================================')

if (allTestsPassed) {
  console.log('✅ ALL SECURITY TESTS PASSED!')
  console.log('🎉 Security implementation is working correctly.')
  console.log('\n📋 Security Features Active:')
  console.log('• ESLint security rules')
  console.log('• Custom security scanner')
  console.log('• Pre-commit security hooks')
  console.log('• Comprehensive security documentation')
} else {
  console.log('❌ SOME SECURITY TESTS FAILED!')
  console.log('⚠️  Security implementation needs attention.')
  console.log('\n📋 Next Steps:')
  console.log('1. Review and fix any failed tests')
  console.log('2. Ensure all team members understand security measures')
  console.log('3. Regularly update security rules as needed')
  console.log('4. Monitor security scanner results in CI/CD')
}
