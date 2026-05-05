import { invoke } from '@tauri-apps/api/core';

import type { BugContext, BugMeta, BugNote, BugStatus } from '@/types/bug-note';

export type BugNoteRow = BugNote;

function parseBugNote(raw: Record<string, unknown>): BugNote {
  let context: BugContext | null = null;
  const ctxRaw = raw.context;
  if (typeof ctxRaw === 'string' && ctxRaw.trim()) {
    try {
      context = JSON.parse(ctxRaw) as BugContext;
    } catch {
      context = null;
    }
  }

  let meta: BugMeta | null = null;
  const metaRaw = raw.meta;
  if (typeof metaRaw === 'string' && metaRaw.trim()) {
    try {
      meta = JSON.parse(metaRaw) as BugMeta;
    } catch {
      meta = null;
    }
  }

  const status = String(raw.status ?? 'OPEN');
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    description:
      raw.description === undefined || raw.description === null
        ? null
        : String(raw.description),
    status: status === 'SOLVED' ? 'SOLVED' : 'OPEN',
    screenshotPath:
      raw.screenshotPath === undefined || raw.screenshotPath === null
        ? null
        : String(raw.screenshotPath),
    context,
    meta,
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? 0),
  };
}

export async function createBugNote(input: {
  id?: string;
  title: string;
  description?: string | null;
  status?: BugStatus;
  screenshotPath?: string | null;
  context?: BugContext | null;
  meta?: BugMeta | null;
}): Promise<BugNote> {
  const raw = await invoke<Record<string, unknown>>('create_bug_note', {
    payload: {
      id: input.id,
      title: input.title,
      description: input.description ?? undefined,
      status: input.status,
      screenshotPath: input.screenshotPath ?? undefined,
      context:
        input.context != null ? JSON.stringify(input.context) : undefined,
      meta: input.meta != null ? JSON.stringify(input.meta) : undefined,
    },
  });
  return parseBugNote(raw);
}

export async function getBugNotes(options?: {
  status?: BugStatus;
  limit?: number;
}): Promise<BugNote[]> {
  const rows = await invoke<Record<string, unknown>[]>('get_bug_notes', {
    status: options?.status ?? null,
    limit: options?.limit ?? null,
  });
  return rows.map(parseBugNote);
}

export async function updateBugNote(input: {
  id: string;
  title?: string;
  description?: string | null;
  status?: BugStatus;
  context?: BugContext | null;
  meta?: BugMeta | null;
}): Promise<BugNote> {
  const payload: Record<string, unknown> = { id: input.id };
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.status !== undefined) payload.status = input.status;
  if (input.context !== undefined) {
    payload.context =
      input.context === null ? '' : JSON.stringify(input.context);
  }
  if (input.meta !== undefined) {
    payload.meta = input.meta === null ? '' : JSON.stringify(input.meta);
  }
  const raw = await invoke<Record<string, unknown>>('update_bug_note', {
    payload,
  });
  return parseBugNote(raw);
}

export async function deleteBugNote(id: string): Promise<void> {
  await invoke('delete_bug_note', { id });
}

export async function saveBugScreenshot(input: {
  bugId: string;
  base64: string;
  mimeType?: string | null;
}): Promise<string> {
  return invoke<string>('save_bug_screenshot', {
    payload: {
      bugId: input.bugId,
      base64: input.base64,
      mimeType: input.mimeType ?? null,
    },
  });
}
