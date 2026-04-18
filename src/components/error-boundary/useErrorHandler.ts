import { toast } from 'sonner';

import { useCallback, useRef } from 'react';

interface ErrorHandlerOptions {
  showToast?: boolean;
  logToConsole?: boolean;
  fallbackMessage?: string;
  onError?: (error: Error, context?: string) => void;
}

interface ErrorContext {
  componentName?: string;
  operation?: string;
  additionalData?: Record<string, unknown>;
}

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const {
    showToast = true,
    logToConsole = true,
    fallbackMessage = 'An unexpected error occurred',
    onError,
  } = options;

  const errorCountRef = useRef(0);
  const lastErrorTimeRef = useRef(0);

  const handleError = useCallback(
    (error: Error | string | unknown, context?: ErrorContext) => {
      const now = Date.now();
      const timeSinceLastError = now - lastErrorTimeRef.current;

      // Prevent error spam - only show toast if more than 2 seconds have passed
      // or if it's a different type of error
      const shouldShowToast =
        showToast && (timeSinceLastError > 2000 || errorCountRef.current === 0);

      // Convert error to Error object if it's a string
      const errorObj =
        error instanceof Error ? error : new Error(String(error));

      // Create error message
      const errorMessage = errorObj.message || fallbackMessage;
      const contextInfo =
        context?.componentName || context?.operation
          ? ` (${[context.componentName, context.operation].filter(Boolean).join(' - ')})`
          : '';

      // Log to console if enabled
      if (logToConsole) {
        console.error(`Error${contextInfo}:`, {
          message: errorObj.message,
          stack: errorObj.stack,
          context,
          timestamp: new Date().toISOString(),
          url: window.location.href,
        });
      }

      // Show toast if enabled and not spamming
      if (shouldShowToast) {
        toast.error(`${errorMessage}${contextInfo}`, {
          duration: 5000,
          description: context?.additionalData
            ? `Additional info: ${JSON.stringify(context.additionalData)}`
            : undefined,
        });
      }

      // Call custom error handler if provided
      if (onError) {
        onError(errorObj, context?.componentName);
      }

      // Update error tracking
      errorCountRef.current++;
      lastErrorTimeRef.current = now;

      return errorObj;
    },
    [showToast, logToConsole, fallbackMessage, onError]
  );

  const handleAsyncError = useCallback(
    async <T>(
      asyncFn: () => Promise<T>,
      context?: ErrorContext
    ): Promise<T | null> => {
      try {
        return await asyncFn();
      } catch (error) {
        handleError(error, context);
        return null;
      }
    },
    [handleError]
  );

  const wrapAsyncFunction = useCallback(
    <T extends unknown[], R>(
      asyncFn: (...args: T) => Promise<R>,
      context?: ErrorContext
    ) => {
      return async (...args: T): Promise<R | null> => {
        try {
          return await asyncFn(...args);
        } catch (error) {
          handleError(error, context);
          return null;
        }
      };
    },
    [handleError]
  );

  const resetErrorCount = useCallback(() => {
    errorCountRef.current = 0;
    lastErrorTimeRef.current = 0;
  }, []);

  return {
    handleError,
    handleAsyncError,
    wrapAsyncFunction,
    resetErrorCount,
    errorCount: errorCountRef.current,
  };
}

// Predefined error contexts for common operations
export const ErrorContexts = {
  dataFetch: (componentName: string) => ({
    componentName,
    operation: 'Data Fetch',
  }),
  dataSave: (componentName: string) => ({
    componentName,
    operation: 'Data Save',
  }),
  dataDelete: (componentName: string) => ({
    componentName,
    operation: 'Data Delete',
  }),
  formSubmit: (componentName: string) => ({
    componentName,
    operation: 'Form Submit',
  }),
  fileUpload: (componentName: string) => ({
    componentName,
    operation: 'File Upload',
  }),
  fileDownload: (componentName: string) => ({
    componentName,
    operation: 'File Download',
  }),
  navigation: (componentName: string) => ({
    componentName,
    operation: 'Navigation',
  }),
  validation: (componentName: string) => ({
    componentName,
    operation: 'Validation',
  }),
  authentication: (componentName: string) => ({
    componentName,
    operation: 'Authentication',
  }),
  authorization: (componentName: string) => ({
    componentName,
    operation: 'Authorization',
  }),
} as const;
