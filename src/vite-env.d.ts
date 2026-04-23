/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

declare module 'vite/client' {
  interface ImportMetaEnv {
    readonly VITE_APP_VERSION: string;
    readonly VITE_BUILD_TIME: string;
    readonly VITE_GIT_COMMIT: string;
  }
}

// Tauri window type declaration
declare global {
  interface Window {
    __TAURI__?: {
      window: {
        getCurrent: () => Promise<{
          setTheme: (theme: string) => void;
        }>;
      };
    };
  }
}

export {};
