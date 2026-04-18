import React from 'react';

import ReactDOM from 'react-dom/client';

import App from './App.tsx';
import './index.css';

async function bootstrap() {
  if (import.meta.env.VITE_PLAYWRIGHT === '1') {
    await import('@tauri-apps/api/core');
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
