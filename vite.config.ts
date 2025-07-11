import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "path"


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),
  tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
    optimizeDeps: {
    include: [
      '@radix-ui/react-icons',
      'papaparse',
      'react-router-dom',
      'papaparse'
    ]
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000', // Forward /api to backend
    },
  },
  
})
