import { convertFileSrc } from '@tauri-apps/api/core';
import { ImagePlus } from 'lucide-react';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import {
  ContextSelector,
  type ContextSelectorOptions,
} from '@/components/bug-tracker/ContextSelector';
import { buildFieldOptions } from '@/components/bug-tracker/context-suggestions';
import { trimBugContext } from '@/components/bug-tracker/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createBugNote, saveBugScreenshot } from '@/lib/bug-notes';
import { ipcErrorMessage } from '@/lib/ipc-error';
import { isTauriEnvironment } from '@/lib/tauri-bridge';
import type { BugContext } from '@/types/bug-note';
import type { BugNote } from '@/types/bug-note';

const DRAFT_KEY = 'import-manager.bug-draft.v1';
const MAX_BYTES = 5 * 1024 * 1024;

type DraftV1 = {
  version: 1;
  bugId: string;
  title: string;
  description: string;
  context: BugContext;
  screenshotPath: string | null;
};

function loadDraft(): DraftV1 | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftV1;
    if (d.version !== 1 || !d.bugId) return null;
    return d;
  } catch {
    return null;
  }
}

function saveDraftToStorage(d: DraftV1): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* quota */
  }
}

function clearDraftStorage(): void {
  localStorage.removeItem(DRAFT_KEY);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === 'string') resolve(r.result);
      else reject(new Error('read failed'));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function previewUrlForPath(path: string | null): string | null {
  if (!path) return null;
  if (!isTauriEnvironment) return path;
  return convertFileSrc(path);
}

interface BugQuickAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bugs: BugNote[];
  onCreated?: () => void;
}

export function BugQuickAddModal({
  open,
  onOpenChange,
  bugs,
  onCreated,
}: BugQuickAddModalProps) {
  const [bugId, setBugId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState<BugContext>({});
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  /** Optimistic data URL or persisted asset URL for preview */
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);

  const contextOptions: ContextSelectorOptions = {
    module: buildFieldOptions('module', bugs, context.module ?? ''),
    page: buildFieldOptions('page', bugs, context.page ?? ''),
    component: buildFieldOptions('component', bugs, context.component ?? ''),
    function: buildFieldOptions('function', bugs, context.function ?? ''),
  };

  useLayoutEffect(() => {
    if (!open) return;

    const draft = loadDraft();
    if (draft) {
      setBugId(draft.bugId);
      setTitle(draft.title);
      setDescription(draft.description);
      setContext(draft.context);
      setScreenshotPath(draft.screenshotPath);
      setPreviewSrc(previewUrlForPath(draft.screenshotPath));
      setRestoredDraft(true);
    } else {
      const id = uuidv4();
      setBugId(id);
      setTitle('');
      setDescription('');
      setContext({ page: window.location.pathname });
      setScreenshotPath(null);
      setPreviewSrc(null);
      setRestoredDraft(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      saveDraftToStorage({
        version: 1,
        bugId,
        title,
        description,
        context,
        screenshotPath,
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [open, bugId, title, description, context, screenshotPath]);

  const handleImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !file.type.startsWith('image/')) return;
      if (file.size > MAX_BYTES) {
        toast.error('Screenshot too large (max 5 MB)');
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        setPreviewSrc(dataUrl);
        const path = await saveBugScreenshot({
          bugId,
          base64: dataUrl,
          mimeType: file.type,
        });
        setScreenshotPath(path);
        setPreviewSrc(previewUrlForPath(path));
      } catch (e) {
        toast.error(ipcErrorMessage(e, 'Could not save screenshot.'));
        setPreviewSrc(null);
      }
    },
    [bugId]
  );

  useEffect(() => {
    if (!open) return;

    const onPaste = (ev: ClipboardEvent) => {
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) void handleImageFile(f);
          ev.preventDefault();
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, handleImageFile]);

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    const f = ev.dataTransfer.files?.[0];
    void handleImageFile(f);
  };

  const onDragOver = (ev: React.DragEvent) => {
    ev.preventDefault();
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      toast.error('Title is required.');
      return;
    }
    setSubmitting(true);
    try {
      await createBugNote({
        id: bugId,
        title: t,
        description: description.trim() || null,
        status: 'OPEN',
        screenshotPath,
        context: trimBugContext(context),
      });
      clearDraftStorage();
      onCreated?.();
      toast.success('Bug saved');
      onOpenChange(false);
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Could not save bug.'));
    } finally {
      setSubmitting(false);
    }
  };

  const discardDraft = () => {
    clearDraftStorage();
    const id = uuidv4();
    setBugId(id);
    setTitle('');
    setDescription('');
    setContext({ page: window.location.pathname });
    setScreenshotPath(null);
    setPreviewSrc(null);
    setRestoredDraft(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick add bug</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="bug-title">Title</Label>
            <Input
              id="bug-title"
              name="bug-title"
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Short summary"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bug-desc">Description (optional)</Label>
            <Textarea
              id="bug-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Steps, expected, actual…"
              rows={3}
            />
          </div>

          <div className="grid gap-2">
            <Label>Context (optional)</Label>
            <ContextSelector
              value={context}
              onChange={setContext}
              options={contextOptions}
            />
          </div>

          <div className="grid gap-2">
            <Label>Screenshot (optional)</Label>
            <div
              role="button"
              tabIndex={0}
              className="border-muted-foreground/25 hover:bg-muted/50 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = () => {
                  const f = input.files?.[0];
                  void handleImageFile(f);
                };
                input.click();
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  (e.target as HTMLElement).click();
                }
              }}
            >
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Screenshot preview"
                  className="max-h-48 max-w-full rounded-md object-contain"
                />
              ) : (
                <>
                  <ImagePlus className="text-muted-foreground mb-2 h-8 w-8" />
                  <span>Paste, drag-drop, or click to add an image</span>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {restoredDraft ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={discardDraft}
              >
                Discard draft
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
