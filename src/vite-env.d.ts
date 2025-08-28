/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

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
