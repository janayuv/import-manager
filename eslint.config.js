import js from '@eslint/js'
import prettier from 'eslint-plugin-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import security from 'eslint-plugin-security'
import { globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config([
  globalIgnores([
    'dist',
    'src-tauri/target',
    'test-results',
    '.cursor',
    '.github',
    'playwright-report',
    'node_modules',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      prettier,
      security,
    },
    rules: {
      'prettier/prettier': 'error',
      // React refresh rule - disabled to allow context files and utility exports
      'react-refresh/only-export-components': 'off',
      // Security rules (disabled for legitimate use cases)
      'security/detect-object-injection': 'off', // Too many false positives with TypeScript
      'security/detect-non-literal-regexp': 'error',
      'security/detect-unsafe-regex': 'off', // Needed for validation patterns
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      // Custom security rules
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.object.name="sqlite3"][callee.property.name="Database"]',
          message: 'Use SQLCipher with PRAGMA key for encrypted SQLite databases',
        },
        {
          selector: 'NewExpression[callee.object.name="sqlite3"][callee.property.name="Database"]',
          message: 'Use SQLCipher with PRAGMA key for encrypted SQLite databases',
        },
      ],
    },
  },
  {
    files: ['**/*.{yml,yaml}'],
    languageOptions: {
      ecmaVersion: 2020,
    },
    rules: {
      // YAML-specific security rules - removed hardcoded patterns to avoid false positives
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value*="-----BEGIN PRIVATE KEY-----"]',
          message: 'Do not hardcode private keys in YAML files. Use GitHub Secrets instead.',
        },
      ],
    },
  },
])
