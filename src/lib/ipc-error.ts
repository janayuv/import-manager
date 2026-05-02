/**
 * Structured IPC errors from Rust commands that return `IpcError` (camelCase JSON).
 * Plain string errors from other commands are returned as `{ code: 'internal', message }`.
 */
export type IpcErrorPayload = {
  code: string;
  message: string;
  details?: string;
  correlationId?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Best-effort parse of `invoke` rejection payloads (Tauri may stringify JSON). */
export function parseIpcError(error: unknown): IpcErrorPayload | null {
  if (typeof error === 'string') {
    try {
      const parsed: unknown = JSON.parse(error);
      if (
        isRecord(parsed) &&
        typeof parsed.message === 'string' &&
        typeof parsed.code === 'string'
      ) {
        const details =
          typeof parsed.details === 'string' ? parsed.details : undefined;
        const correlationId =
          typeof parsed.correlationId === 'string'
            ? parsed.correlationId
            : undefined;
        return {
          code: parsed.code,
          message: parsed.message,
          ...(details !== undefined ? { details } : {}),
          ...(correlationId !== undefined ? { correlationId } : {}),
        };
      }
    } catch {
      return { code: 'internal', message: error };
    }
    return { code: 'internal', message: error };
  }
  if (
    isRecord(error) &&
    typeof error.message === 'string' &&
    typeof (error as IpcErrorPayload).code === 'string'
  ) {
    const e = error as IpcErrorPayload;
    return {
      code: e.code,
      message: e.message,
      ...(e.details !== undefined ? { details: e.details } : {}),
      ...(e.correlationId !== undefined
        ? { correlationId: e.correlationId }
        : {}),
    };
  }
  if (error instanceof Error) {
    return { code: 'internal', message: error.message };
  }
  return null;
}

export function ipcErrorMessage(
  error: unknown,
  fallback = 'Something went wrong.'
): string {
  return parseIpcError(error)?.message ?? fallback;
}
