import { invoke as tauriInvoke } from '@tauri-apps/api/core';

import { captureErrorEvent } from '@/lib/error-memory';

type InvokeArgs = Record<string, unknown> | undefined;
type SafeInvokeOptions = {
  skipErrorCapture?: boolean;
};

function safeArgsPreview(args: InvokeArgs): string | undefined {
  if (!args) return undefined;
  try {
    const raw = JSON.stringify(args);
    if (!raw) return undefined;
    return raw.length > 1000 ? `${raw.slice(0, 1000)}…` : raw;
  } catch {
    return undefined;
  }
}

export async function safeInvoke<T>(
  command: string,
  args?: InvokeArgs,
  options?: SafeInvokeOptions
): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (err) {
    if (options?.skipErrorCapture) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    void captureErrorEvent({
      moduleName: 'frontend.ipc',
      commandName: command,
      errorCode: 'FE_IPC_COMMAND_FAILED',
      errorCategory: 'ipc',
      errorMessage: message || `IPC command failed: ${command}`,
      stackTrace: stack,
      userAction: command,
      redactedInputContext: safeArgsPreview(args),
      severity: 'error',
      recoverable: false,
      retryable: true,
    });
    throw err;
  }
}
