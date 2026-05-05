import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { BugDetailView } from '@/components/bug-tracker/BugDetailView';
import { BugFloatingButton } from '@/components/bug-tracker/BugFloatingButton';
import {
  BugListPanel,
  type StatusFilter,
} from '@/components/bug-tracker/BugListPanel';
import { BugQuickAddModal } from '@/components/bug-tracker/BugQuickAddModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createBugNote, getBugNotes, updateBugNote } from '@/lib/bug-notes';
import { ipcErrorMessage } from '@/lib/ipc-error';
import type { BugNote, BugStatus } from '@/types/bug-note';

export function BugTrackerRoot() {
  const qc = useQueryClient();
  const [quickOpen, setQuickOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [detailBugId, setDetailBugId] = useState<string | null>(null);
  const [detailFallback, setDetailFallback] = useState<BugNote | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const {
    data: bugs = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['bug-notes', filter],
    queryFn: () =>
      getBugNotes({
        status: filter === 'all' ? undefined : filter,
        limit: 200,
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: BugStatus }) =>
      updateBugNote({ id, status: next }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bug-notes'] });
    },
    onError: err => {
      toast.error(ipcErrorMessage(err, 'Could not update status.'));
    },
  });

  const resolvedDetailBug = useMemo(() => {
    if (!detailBugId) return null;
    return bugs.find(b => b.id === detailBugId) ?? detailFallback;
  }, [bugs, detailBugId, detailFallback]);

  useEffect(() => {
    if (detailBugId && detailFallback && bugs.some(b => b.id === detailBugId)) {
      setDetailFallback(null);
    }
  }, [detailBugId, detailFallback, bugs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      if (e.key !== 'b' && e.key !== 'B') return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setQuickOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const quickCapture = async (ev: React.MouseEvent) => {
    if (ev.shiftKey) {
      setQuickOpen(true);
      return;
    }
    try {
      const created = await createBugNote({
        title: 'Untitled bug',
        status: 'OPEN',
        context: { page: window.location.pathname },
      });
      toast.success('Bug added', {
        action: {
          label: 'Edit',
          onClick: () => {
            setDetailFallback(created);
            setDetailBugId(created.id);
          },
        },
      });
      void qc.invalidateQueries({ queryKey: ['bug-notes'] });
    } catch (err) {
      toast.error(ipcErrorMessage(err, 'Could not create bug.'));
    }
  };

  const openDetailFromRow = (id: string) => {
    setDetailFallback(null);
    setDetailBugId(id);
  };

  const listError =
    error instanceof Error ? error : error ? new Error(String(error)) : null;

  return (
    <TooltipProvider delayDuration={300}>
      <BugFloatingButton
        onQuickCapture={e => {
          void quickCapture(e);
        }}
        onCompose={() => setQuickOpen(true)}
        onOpenList={() => setListOpen(true)}
      />

      <BugQuickAddModal
        open={quickOpen}
        onOpenChange={setQuickOpen}
        bugs={bugs}
        onCreated={() => void qc.invalidateQueries({ queryKey: ['bug-notes'] })}
      />

      <BugListPanel
        open={listOpen}
        onOpenChange={setListOpen}
        bugs={bugs}
        isLoading={isLoading}
        error={listError}
        filter={filter}
        onFilterChange={setFilter}
        onRowClick={openDetailFromRow}
        onToggleStatus={(id, next) => toggleMutation.mutate({ id, next })}
      />

      <BugDetailView
        bug={resolvedDetailBug}
        open={detailBugId !== null && resolvedDetailBug !== null}
        onOpenChange={open => {
          if (!open) {
            setDetailBugId(null);
            setDetailFallback(null);
          }
        }}
        allBugs={bugs}
        onSaved={() => void refetch()}
        onDeleted={() => void refetch()}
      />
    </TooltipProvider>
  );
}
