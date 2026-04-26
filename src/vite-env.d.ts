/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

declare module 'vite/client' {
  interface ImportMetaEnv {
    readonly VITE_APP_VERSION: string;
    readonly VITE_BUILD_TIME: string;
    readonly VITE_GIT_COMMIT: string;
    /**
     * Build-time "true" | "false" — see `vite.config.ts` (AI_API_KEY / VITE_DEEPSEEK flags).
     */
    readonly IMPORT_MANAGER_DEEPSEEK_ENV_OK: string;
    /**
     * Optional. Set to `true` in `.env` when the runtime host is configured
     * for DeepSeek to align the "API key" warning in the UI.
     */
    readonly VITE_DEEPSEEK_API_CONFIGURED?: string;
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
