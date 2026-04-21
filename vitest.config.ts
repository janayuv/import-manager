import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
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
    },
  },
});
