import { describe, expect, it } from 'vitest';

import { ipcErrorMessage, parseIpcError } from './ipc-error';

describe('parseIpcError', () => {
  it('parses structured JSON string from Rust IPC', () => {
    const json = JSON.stringify({
      code: 'not_found',
      message: 'Record not found',
    });
    const result = parseIpcError(json);
    expect(result).toEqual({ code: 'not_found', message: 'Record not found' });
  });

  it('parses structured JSON with optional details and correlationId', () => {
    const json = JSON.stringify({
      code: 'validation',
      message: 'Invalid input',
      details: 'Field x is required',
      correlationId: 'abc-123',
    });
    const result = parseIpcError(json);
    expect(result?.code).toBe('validation');
    expect(result?.details).toBe('Field x is required');
    expect(result?.correlationId).toBe('abc-123');
  });

  it('wraps plain string errors as internal code', () => {
    const result = parseIpcError('Some rust panic message');
    expect(result).toEqual({
      code: 'internal',
      message: 'Some rust panic message',
    });
  });

  it('wraps JSON string missing code/message fields as internal', () => {
    const json = JSON.stringify({ error: 'oops' });
    const result = parseIpcError(json);
    expect(result?.code).toBe('internal');
  });

  it('accepts already-parsed IpcErrorPayload objects', () => {
    const payload = { code: 'db_error', message: 'SQLite failed' };
    const result = parseIpcError(payload);
    expect(result).toEqual(payload);
  });

  it('wraps Error instances', () => {
    const err = new Error('network timeout');
    const result = parseIpcError(err);
    expect(result?.code).toBe('internal');
    expect(result?.message).toBe('network timeout');
  });

  it('returns null for unrecognised types', () => {
    expect(parseIpcError(42)).toBeNull();
    expect(parseIpcError(null)).toBeNull();
    expect(parseIpcError(undefined)).toBeNull();
  });

  it('does not include undefined optional fields', () => {
    const json = JSON.stringify({ code: 'err', message: 'oops' });
    const result = parseIpcError(json);
    expect(result).not.toHaveProperty('details');
    expect(result).not.toHaveProperty('correlationId');
  });
});

describe('ipcErrorMessage', () => {
  it('extracts message from structured JSON', () => {
    const json = JSON.stringify({ code: 'err', message: 'Oops' });
    expect(ipcErrorMessage(json)).toBe('Oops');
  });

  it('returns the string directly for plain string errors', () => {
    expect(ipcErrorMessage('Direct error string')).toBe('Direct error string');
  });

  it('returns default fallback for unrecognised payload', () => {
    expect(ipcErrorMessage(42)).toBe('Something went wrong.');
    expect(ipcErrorMessage(null)).toBe('Something went wrong.');
  });

  it('accepts custom fallback message', () => {
    expect(ipcErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });
});
