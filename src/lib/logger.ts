import { captureErrorEvent } from '@/lib/error-memory';
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { isTauriEnvironment } from '@/lib/tauri-bridge';

const MAX = 2000;

function trimMessage(msg: string): string {
  return msg.length > MAX ? `${msg.slice(0, MAX)}…` : msg;
}

/** User-facing or operational info; forwarded to native log when in Tauri. */
export function logInfo(message: string, context?: string): void {
  const line = context ? `[${context}] ${message}` : message;
  console.info(line);
  if (isTauriEnvironment) {
    void invoke(
      'log_client_event',
      {
        level: 'info',
        message: trimMessage(line),
      },
      { skipErrorCapture: true }
    ).catch(() => {
      /* avoid unhandled rejection */
    });
  }
}

export function logWarn(message: string, context?: string): void {
  const line = context ? `[${context}] ${message}` : message;
  console.warn(line);
  if (isTauriEnvironment) {
    void invoke(
      'log_client_event',
      {
        level: 'warn',
        message: trimMessage(line),
      },
      { skipErrorCapture: true }
    ).catch(() => {
      /* ignore */
    });
  }
}

export function logError(message: string, context?: string): void {
  const line = context ? `[${context}] ${message}` : message;
  console.error(line);
  void captureErrorEvent({
    moduleName: 'frontend.logger',
    pageName:
      typeof window !== 'undefined' ? window.location.pathname : undefined,
    componentName: context,
    errorCode: 'FE_LOG_ERROR',
    errorCategory: 'ui_log',
    errorMessage: line,
    userAction: 'logError',
    severity: 'error',
    recoverable: true,
    retryable: true,
  });
  if (isTauriEnvironment) {
    void invoke(
      'log_client_event',
      {
        level: 'error',
        message: trimMessage(line),
      },
      { skipErrorCapture: true }
    ).catch(() => {
      /* ignore */
    });
  }
}
