import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config([
  globalIgnores([
    'dist',
    'src-tauri/target',
    'test-results',
    '.cursor',
    '.github',
    'playwright-report',
    'codeql',
    'codeql_data',
    'CICD',
    'node_modules',
    'scripts/**',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,
  {
    files: ['**/*.{ts,tsx}'],
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
      // React hooks exhaustive deps - set to warning instead of error for production
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler rules (eslint-plugin-react-hooks v7): off until the codebase is migrated.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
      'preserve-caught-error': 'off',
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
          selector:
            'CallExpression[callee.object.name="sqlite3"][callee.property.name="Database"]',
          message:
            'Use SQLCipher with PRAGMA key for encrypted SQLite databases',
        },
        {
          selector:
            'NewExpression[callee.object.name="sqlite3"][callee.property.name="Database"]',
          message:
            'Use SQLCipher with PRAGMA key for encrypted SQLite databases',
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
          selector: 'Literal[value*="' + '-----BEGIN' + ' PRIVATE KEY-----"]',
          message:
            'Do not hardcode private keys in YAML files. Use GitHub Secrets instead.',
        },
      ],
    },
  },
]);
