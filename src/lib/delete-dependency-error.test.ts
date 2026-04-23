import { describe, it, expect } from 'vitest';

/** Mirrors client handling of server JSON / SQLite errors for hard delete. */
function friendlyHardDeleteMessage(msg: string): string {
  try {
    const o = JSON.parse(msg) as { type?: string };
    if (o?.type === 'DEPENDENCY_EXISTS') {
      return 'Cannot hard delete — record is referenced in other modules.';
    }
  } catch {
    /* not JSON */
  }
  if (msg.toLowerCase().includes('foreign key')) {
    return 'Cannot hard delete — record is referenced in other modules.';
  }
  return msg;
}

describe('delete dependency error mapping', () => {
  it('maps DEPENDENCY_EXISTS JSON', () => {
    const err = JSON.stringify({
      type: 'DEPENDENCY_EXISTS',
      details: [{ table: 'shipments', total_references: 2 }],
    });
    expect(friendlyHardDeleteMessage(err)).toBe(
      'Cannot hard delete — record is referenced in other modules.'
    );
  });

  it('maps raw FOREIGN KEY SQLite text', () => {
    expect(
      friendlyHardDeleteMessage('FOREIGN KEY constraint failed')
    ).toContain('Cannot hard delete');
  });

  it('passes through unrelated errors', () => {
    expect(friendlyHardDeleteMessage('Invalid table name')).toBe(
      'Invalid table name'
    );
  });
});
