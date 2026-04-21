import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import removeConsole from 'vite-plugin-remove-console';

const manualChunks = (id: string): string | undefined => {
  const norm = id.split('\\').join('/');
  if (!norm.includes('/node_modules/')) return;

  const groups: Record<string, readonly string[]> = {
    vendor: ['react-dom', 'react'],
    'ui-core': [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-popover',
    ],
    'ui-forms': [
      '@radix-ui/react-checkbox',
      '@radix-ui/react-switch',
      '@radix-ui/react-label',
    ],
    'ui-data': ['@tanstack/react-table', '@radix-ui/react-collapsible'],
    utils: ['date-fns', 'clsx', 'tailwind-merge', 'class-variance-authority'],
    charts: ['recharts'],
    'data-processing': ['papaparse', 'exceljs'],
    tauri: ['@tauri-apps/api'],
    icons: ['lucide-react'],
  };

  for (const [chunkName, packages] of Object.entries(groups)) {
    for (const pkg of packages) {
      if (norm.includes(`/node_modules/${pkg}/`)) {
        return chunkName;
      }
    }
  }
};

const usePlaywrightTauriStub = process.env.VITE_PLAYWRIGHT === '1';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.TAURI_DEBUG === '1' || process.env.TAURI_DEBUG === 'true'
      ? []
      : [removeConsole()]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...(usePlaywrightTauriStub
        ? {
            '@tauri-apps/api/core-real': path.resolve(
              __dirname,
              'node_modules/@tauri-apps/api/core.js'
            ),
            '@tauri-apps/api/core': path.resolve(
              __dirname,
              './src/lib/tauri-core-playwright-stub.ts'
            ),
          }
        : {}),
    },
  },
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: Number(process.env.VITE_DEV_SERVER_PORT) || 1421,
    strictPort: true,
  },
  // 3. to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.app/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // 4. Tauri uses Chromium on Windows - edgeDAMN WebView2
    // Windows + WebView2 (Chromium). When `TAURI_PLATFORM` is unset (plain `vite build`), still target Chromium.
    target:
      process.env.TAURI_PLATFORM === 'windows' || process.platform === 'win32'
        ? 'chrome105'
        : 'safari13',
    // 5. don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // 6. produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    // Performance optimizations
    rollupOptions: {
      output: {
        manualChunks,
        // Optimize chunk naming for better caching
        chunkFileNames: () => {
          return `js/[name]-[hash].js`;
        },
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: assetInfo => {
          const info = assetInfo.name?.split('.') || [];
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `images/[name]-[hash][extname]`;
          }
          if (/css/i.test(ext)) {
            return `css/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
    // Enable chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
  // Performance optimizations for development
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      'date-fns',
      'clsx',
      'tailwind-merge',
    ],
  },
  // CSS optimizations
  css: {
    devSourcemap: true,
  },
});
