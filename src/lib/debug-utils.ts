/**
 * Debug Utilities for Auto-Adjusting Debug & Setup Components
 *
 * This utility provides environment detection, auto-adjust behavior,
 * and consistent debug configuration across all modules.
 *
 * Features:
 * - Environment detection (dev/test/prod)
 * - Auto-adjust behavior for logs, db connections, feature toggles
 * - Error handling and fallbacks
 * - Consistent debug configuration
 */

// Environment detection utilities
export interface EnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
  debugMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  showDebugInfo: boolean;
  enableVerboseLogging: boolean;
  enablePerformanceMonitoring: boolean;
  enableErrorTracking: boolean;
}

/**
 * Get environment configuration with auto-adjust behavior
 * This function automatically detects the environment and adjusts settings accordingly
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  // Detect environment using multiple methods for reliability
  const isDevelopment = detectDevelopment();
  const isProduction = detectProduction();
  const isTest = detectTest();

  // Auto-adjust debug mode based on environment
  const debugMode = isDevelopment || isTest;

  // Auto-adjust log level based on environment
  const logLevel = isDevelopment ? 'debug' : isProduction ? 'warn' : 'info';

  // Auto-adjust feature toggles based on environment
  const showDebugInfo = debugMode;
  const enableVerboseLogging = debugMode;
  const enablePerformanceMonitoring = debugMode;
  const enableErrorTracking = true; // Always enabled for production monitoring

  return {
    isDevelopment,
    isProduction,
    isTest,
    debugMode,
    logLevel,
    showDebugInfo,
    enableVerboseLogging,
    enablePerformanceMonitoring,
    enableErrorTracking,
  };
}

/**
 * Detect if running in development environment
 * Uses multiple detection methods for reliability
 */
function detectDevelopment(): boolean {
  try {
    // Method 1: Check NODE_ENV (most reliable)
    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'development'
    ) {
      return true;
    }

    // Method 2: Check Vite environment variables
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV === true) {
      return true;
    }

    // Method 3: Check for development-specific environment variables
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_DEBUG_MODE === 'true'
    ) {
      return true;
    }

    // Method 4: Check for Tauri debug mode
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env?.TAURI_DEBUG === 'true'
    ) {
      return true;
    }

    // Method 5: Check hostname for localhost (fallback)
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('localhost'))
    ) {
      return true;
    }

    return false;
  } catch (error) {
    // Fallback: assume development if detection fails
    console.warn('Environment detection failed, assuming development:', error);
    return true;
  }
}

/**
 * Detect if running in production environment
 */
function detectProduction(): boolean {
  try {
    // Method 1: Check NODE_ENV
    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'production'
    ) {
      return true;
    }

    // Method 2: Check Vite environment variables
    if (typeof import.meta !== 'undefined' && import.meta.env?.PROD === true) {
      return true;
    }

    // Method 3: Check for production-specific indicators
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_DEBUG_MODE === 'false'
    ) {
      return true;
    }

    return false;
  } catch (error) {
    console.warn('Production detection failed:', error);
    return false;
  }
}

/**
 * Detect if running in test environment
 */
function detectTest(): boolean {
  try {
    // Method 1: Check NODE_ENV
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return true;
    }

    // Method 2: Check for test-specific environment variables
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_TEST_MODE === 'true'
    ) {
      return true;
    }

    // Method 3: Check for test runner indicators
    if (
      typeof window !== 'undefined' &&
      (window.location.href.includes('vitest') ||
        window.location.href.includes('jest') ||
        window.location.href.includes('test'))
    ) {
      return true;
    }

    return false;
  } catch (error) {
    console.warn('Test detection failed:', error);
    return false;
  }
}

/**
 * Debug logger with auto-adjusting log levels
 */
export class DebugLogger {
  private config: EnvironmentConfig;

  constructor(config?: Partial<EnvironmentConfig>) {
    this.config = { ...getEnvironmentConfig(), ...config };
  }

  /**
   * Log debug message (only in development/test)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.config.enableVerboseLogging && this.config.logLevel === 'debug') {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    if (['debug', 'info'].includes(this.config.logLevel)) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (['debug', 'info', 'warn'].includes(this.config.logLevel)) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  /**
   * Log error message (always logged)
   */
  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }

  /**
   * Log performance metrics (only in development/test)
   */
  performance(operation: string, duration: number, ...args: unknown[]): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`[PERF] ${operation}: ${duration}ms`, ...args);
    }
  }
}

/**
 * Debug configuration for modules
 */
export interface ModuleDebugConfig {
  moduleName: string;
  enableDebugPanel: boolean;
  enableVerboseLogging: boolean;
  enablePerformanceMonitoring: boolean;
  enableErrorTracking: boolean;
  showEnvironmentInfo: boolean;
  showSystemInfo: boolean;
  showDatabaseInfo: boolean;
  customDebugActions?: DebugAction[];
}

export interface DebugAction {
  id: string;
  label: string;
  description: string;
  action: () => Promise<string>;
  variant?: 'default' | 'destructive' | 'outline';
  requiresConfirmation?: boolean;
}

/**
 * Create debug configuration for a module with auto-adjust behavior
 */
export function createModuleDebugConfig(
  moduleName: string,
  customActions?: DebugAction[]
): ModuleDebugConfig {
  const envConfig = getEnvironmentConfig();

  return {
    moduleName,
    enableDebugPanel: envConfig.showDebugInfo,
    enableVerboseLogging: envConfig.enableVerboseLogging,
    enablePerformanceMonitoring: envConfig.enablePerformanceMonitoring,
    enableErrorTracking: envConfig.enableErrorTracking,
    showEnvironmentInfo: envConfig.showDebugInfo,
    showSystemInfo: envConfig.showDebugInfo,
    showDatabaseInfo: envConfig.showDebugInfo,
    customDebugActions: customActions || [],
  };
}

/**
 * Get system information for debug display
 */
export function getSystemInfo(): Record<string, unknown> {
  const envConfig = getEnvironmentConfig();

  return {
    environment: {
      isDevelopment: envConfig.isDevelopment,
      isProduction: envConfig.isProduction,
      isTest: envConfig.isTest,
      debugMode: envConfig.debugMode,
      logLevel: envConfig.logLevel,
    },
    runtime: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'N/A',
      language: typeof navigator !== 'undefined' ? navigator.language : 'N/A',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    application: {
      version:
        typeof import.meta !== 'undefined'
          ? import.meta.env?.VITE_APP_VERSION || '1.0.0'
          : '1.0.0',
      buildTime:
        typeof import.meta !== 'undefined'
          ? import.meta.env?.VITE_BUILD_TIME || 'N/A'
          : 'N/A',
      mode:
        typeof import.meta !== 'undefined'
          ? import.meta.env?.MODE || 'N/A'
          : 'N/A',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format debug information for display
 */
export function formatDebugInfo(info: Record<string, unknown>): string {
  return JSON.stringify(info, null, 2);
}

/**
 * Default debug actions that can be used across modules
 */
export const defaultDebugActions: DebugAction[] = [
  {
    id: 'environment-info',
    label: 'Show Environment Info',
    description: 'Display current environment configuration',
    action: async () => {
      const info = getSystemInfo();
      return formatDebugInfo(info);
    },
    variant: 'default',
  },
  {
    id: 'clear-cache',
    label: 'Clear Application Cache',
    description: 'Clear all cached data and localStorage',
    action: async () => {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
      return 'Application cache cleared successfully';
    },
    variant: 'outline',
    requiresConfirmation: true,
  },
  {
    id: 'reload-page',
    label: 'Reload Page',
    description: 'Reload the current page',
    action: async () => {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return 'Page reload initiated';
    },
    variant: 'outline',
    requiresConfirmation: true,
  },
];

/**
 * Hook for using debug utilities in React components
 */
export function useDebugUtils(
  moduleName: string,
  customActions?: DebugAction[]
) {
  const config = createModuleDebugConfig(moduleName, customActions);
  const logger = new DebugLogger();

  return {
    config,
    logger,
    getSystemInfo,
    formatDebugInfo,
    defaultActions: defaultDebugActions,
  };
}
