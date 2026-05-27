import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import ReactDOM from 'react-dom/client';

import { appQueryClient } from './lib/query-client';
import { applyCustomAccentFromLocalStorage } from './lib/theme-hydration';
import { ThemeProvider } from './components/ThemeProvider';
import App from './App.tsx';
import './index.css';
applyCustomAccentFromLocalStorage();

async function bootstrap() {
  if (import.meta.env.VITE_PLAYWRIGHT === '1') {
    await import('@tauri-apps/api/core');
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={appQueryClient}>
          <App />
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}

void bootstrap();
