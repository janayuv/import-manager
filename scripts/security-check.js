#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

console.log('🔒 Running custom security checks...')

// Patterns to detect
const SECRET_PATTERNS = [
  /-----BEGIN PRIVATE KEY-----/,
  /-----BEGIN RSA PRIVATE KEY-----/,
  /-----BEGIN DSA PRIVATE KEY-----/,
  /-----BEGIN EC PRIVATE KEY-----/,
  /Bearer [a-zA-Z0-9._-]+/,
  /TAURI_SIGNING_PRIVATE_KEY.*["'][^"']+["']/,
  /password.*["'][^"']+["']/,
  /secret.*["'][^"']+["']/,
  /token.*["'][^"']+["']/,
  /key.*["'][^"']+["']/,
]

const SQLITE_PATTERNS = [/new sqlite3\.Database\(/, /sqlite3\.Database\(/]

let hasIssues = false

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

    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      walkDir(filePath)
    } else if (stat.isFile() && /\.(ts|tsx|js|jsx|yml|yaml|json)$/.test(file)) {
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
