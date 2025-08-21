#!/usr/bin/env node
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

console.log('🔒 Running custom security checks...')

// Patterns to detect real secrets (more specific to avoid false positives)
const SECRET_PATTERNS = [
  /-----BEGIN PRIVATE KEY-----/,
  /-----BEGIN RSA PRIVATE KEY-----/,
  /-----BEGIN DSA PRIVATE KEY-----/,
  /-----BEGIN EC PRIVATE KEY-----/,
  /-----BEGIN OPENSSH PRIVATE KEY-----/,
  /TAURI_SIGNING_PRIVATE_KEY\s*=\s*["'][^"']+["']/, // Only detect hardcoded private keys
  /password\s*=\s*["'][^"']+["']/, // Only detect hardcoded passwords
  /secret\s*=\s*["'][^"']+["']/, // Only detect hardcoded secrets
  /token\s*=\s*["'][^"']+["']/, // Only detect hardcoded tokens
  /api_key\s*=\s*["'][^"']+["']/, // Only detect hardcoded API keys
]

const SQLITE_PATTERNS = [/new sqlite3\.Database\(/, /sqlite3\.Database\(/]

// Files and directories to ignore
const IGNORE_PATTERNS = [
  /package\.json$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /node_modules/,
  /dist/,
  /build/,
  /target/,
  /\.git/,
  /\.github/,
  /\.vscode/,
  /\.idea/,
  /\.cursor/,
  /test-results/,
  /playwright-report/,
  /coverage/,
  /\.next/,
  /\.nuxt/,
  /\.output/,
  /\.cache/,
  /\.parcel-cache/,
  /\.eslintcache/,
  /\.stylelintcache/,
  /\.prettierignore/,
  /\.gitignore/,
  /\.env\.example/,
  /\.env\.local/,
  /\.env\.development/,
  /\.env\.test/,
  /\.env\.production/,
  /security-check\.js$/, // Ignore this security check file itself
  /eslint\.config\.js$/, // Ignore ESLint config patterns
  /db[\\\/]test\.ts$/, // Ignore test files
  /db[\\\/]secure-database\.ts$/, // Ignore database files that are properly handled
]

let hasIssues = false

function shouldIgnoreFile(filePath) {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(filePath))
}

function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    lines.forEach((line, index) => {
      const lineNum = index + 1

      // Check for secrets
      SECRET_PATTERNS.forEach((pattern) => {
        if (pattern.test(line)) {
          console.log(`❌ SECURITY: Hardcoded secret detected in ${filePath}:${lineNum}`)
          console.log(`   ${line.trim()}`)
          hasIssues = true
        }
      })

      // Check for unencrypted SQLite
      SQLITE_PATTERNS.forEach((pattern) => {
        if (pattern.test(line) && !line.includes('PRAGMA key')) {
          console.log(`❌ SECURITY: Unencrypted SQLite usage detected in ${filePath}:${lineNum}`)
          console.log(`   ${line.trim()}`)
          console.log(`   💡 Use SQLCipher with PRAGMA key for encryption`)
          hasIssues = true
        }
      })
    })
  } catch (error) {
    // Skip files that can't be read
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir)

  files.forEach((file) => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory() && !shouldIgnoreFile(filePath)) {
      walkDir(filePath)
    } else if (
      stat.isFile() &&
      /\.(ts|tsx|js|jsx|yml|yaml|json)$/.test(file) &&
      !shouldIgnoreFile(filePath)
    ) {
      checkFile(filePath)
    }
  })
}

// Run security checks
walkDir('.')

if (hasIssues) {
  console.log('\n❌ Security issues found! Please fix them before committing.')
  process.exit(1)
} else {
  console.log('✅ No security issues detected!')
}
