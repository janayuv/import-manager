import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  /** Align with Vite: module source references `import.meta.env.IMPORT_MANAGER_DEEPSEEK_ENV_OK` */
  define: {
    'import.meta.env.IMPORT_MANAGER_DEEPSEEK_ENV_OK': JSON.stringify('false'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.{test,vitest}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**',
      'e2e/**',
      'playwright/**',
    ],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.config.*',
        '**/types/**',
      ],
      // Global floor — enforces no regression. Raise each phase as tests are added.
      // Phase 2 (current): 38 / 36 / 34 / 38
      // v1.0 target:       60 / 50 / 55 / 60
      thresholds: {
        lines: 38,
        functions: 34,
        branches: 36,
        statements: 38,
      },
    },
  },
});
