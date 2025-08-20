/// <reference types="vite/client" />

// Tauri window type declaration
declare global {
  interface Window {
    __TAURI__?: {
      window: {
        getCurrent: () => Promise<{
          setTheme: (theme: string) => void
        }>
      }
    }
  }
}

export {}
