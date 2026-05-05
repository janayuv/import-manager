import { convertFileSrc } from '@tauri-apps/api/core';
import { Trash2 } from 'lucide-react';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { deleteBugNote, updateBugNote } from '@/lib/bug-notes';
import { ipcErrorMessage } from '@/lib/ipc-error';
import { confirm, isTauriEnvironment } from '@/lib/tauri-bridge';
import type { BugContext, BugNote, BugStatus } from '@/types/bug-note';

function imgSrc(path: string | null): string | null {
  if (!path) return null;
  if (!isTauriEnvironment) return path;
  return convertFileSrc(path);
}

interface BugDetailViewProps {
  bug: BugNote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allBugs: BugNote[];
  onSaved: () => void;
  onDeleted: () => void;
}

export function BugDetailView({
  bug,
  open,
  onOpenChange,
  allBugs,
  onSaved,
  onDeleted,
}: BugDetailViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState<BugContext>({});
  const [status, setStatus] = useState<BugStatus>('OPEN');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bug) return;
    setTitle(bug.title);
    setDescription(bug.description ?? '');
    setContext(bug.context ?? {});
    setStatus(bug.status);
  }, [bug]);

  const options: ContextSelectorOptions = {
    module: buildFieldOptions('module', allBugs, context.module ?? ''),
    page: buildFieldOptions('page', allBugs, context.page ?? ''),
    component: buildFieldOptions('component', allBugs, context.component ?? ''),
    function: buildFieldOptions('function', allBugs, context.function ?? ''),
  };

  const handleSave = async () => {
    if (!bug) return;
    const t = title.trim();
    if (!t) {
      toast.error('Title is required.');
      return;
    }
    setSaving(true);
    try {
      await updateBugNote({
        id: bug.id,
        title: t,
        description: description.trim() || null,
        status,
        context: trimBugContext(context),
      });
      toast.success('Bug updated');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Could not update bug.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!bug) return;
    const ok = await confirm('Delete this bug permanently?', {
      title: 'Delete bug',
      kind: 'warning',
    });
    if (!ok) return;
    try {
      await deleteBugNote(bug.id);
      toast.success('Bug deleted');
      onDeleted();
      onOpenChange(false);
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Could not delete bug.'));
    }
  };

  if (!bug) return null;

  const shot = imgSrc(bug.screenshotPath);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit bug</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="bug-status" className="shrink-0">
                Solved
              </Label>
              <Switch
                id="bug-status"
                checked={status === 'SOLVED'}
                onCheckedChange={checked =>
                  setStatus(checked ? 'SOLVED' : 'OPEN')
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="detail-title">Title</Label>
              <Input
                id="detail-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="detail-desc">Description</Label>
              <Textarea
                id="detail-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid gap-2">
              <Label>Context</Label>
              <ContextSelector
                value={context}
                onChange={setContext}
                options={options}
              />
            </div>

            {shot ? (
              <div className="grid gap-2">
                <Label>Screenshot</Label>
                <button
                  type="button"
                  className="border-muted overflow-hidden rounded-md border p-1 text-left"
                  onClick={() => setPreviewOpen(true)}
                >
                  <img
                    src={shot}
                    alt="Screenshot"
                    className="max-h-48 w-full object-contain"
                  />
                </button>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
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
                disabled={saving}
                onClick={() => void handleSave()}
              >
                Update
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Screenshot</DialogTitle>
          </DialogHeader>
          {shot ? (
            <img
              src={shot}
              alt="Full screenshot"
              className="max-h-[80vh] w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
