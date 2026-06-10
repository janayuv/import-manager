'use client';

import { safeInvoke as invoke } from '@/lib/ipc-safe';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DeleteConfirmDialog } from '@/components/boe-entry/delete-confirm-dialog';
import { SavedBoeTable } from '@/components/saved-boe/table-saved-boe';
import { ViewBoeDialog } from '@/components/boe-entry/view-boe-dialog';
import type { BoeDetails } from '@/types/boe';
import type { SavedBoe } from '@/types/boe-entry';

export function savedBoeDetailPath(savedBoeId: string, mode: 'view' | 'edit') {
  return `/saved-boe/${encodeURIComponent(savedBoeId)}/${mode}`;
}

export const savedBoeListPath = '/saved-boe';

export default function SavedBoePage() {
  const navigate = useNavigate();
  const { savedBoeId: savedBoeIdParam, mode } = useParams<{
    savedBoeId: string;
    mode: string;
  }>();

  const [savedBoes, setSavedBoes] = useState<SavedBoe[]>([]);
  const [allBoes, setAllBoes] = useState<BoeDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTarget, setViewTarget] = useState<SavedBoe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedBoe | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [savedBoesData, allBoesData] = await Promise.all([
        invoke<SavedBoe[]>('get_boe_calculations', {}),
        invoke<BoeDetails[]>('get_boes', {}),
      ]);
      setSavedBoes(Array.isArray(savedBoesData) ? savedBoesData : []);
      setAllBoes(Array.isArray(allBoesData) ? allBoesData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (savedBoeIdParam && mode === 'view' && savedBoes.length > 0) {
      const found = savedBoes.find(b => b.id === savedBoeIdParam);
      if (found) setViewTarget(found);
    }
    if (savedBoeIdParam && mode === 'edit') {
      navigate(`/boe-entry/${encodeURIComponent(savedBoeIdParam)}/edit`, {
        replace: true,
      });
    }
  }, [savedBoeIdParam, mode, savedBoes, navigate]);

  const handleView = (id: string) => {
    const found = savedBoes.find(b => b.id === id);
    if (found) {
      setViewTarget(found);
      navigate(savedBoeDetailPath(id, 'view'), { replace: true });
    }
  };

  const handleEdit = (id: string) => {
    navigate(`/boe-entry/${encodeURIComponent(id)}/edit`);
  };

  const handleDelete = (id: string) => {
    const found = savedBoes.find(b => b.id === id);
    if (found) setDeleteTarget(found);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await invoke('delete_boe_calculation', { id: deleteTarget.id });
    setDeleteTarget(null);
    await loadData();
  };

  if (loading) {
    return (
      <div
        className="border-im-rule bg-im-panel text-im-muted flex min-h-[220px] flex-1 items-center justify-center border font-mono text-xs tracking-wide"
        role="status"
        aria-live="polite"
      >
        LOADING…
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SavedBoeTable
        savedBoes={savedBoes}
        allBoes={allBoes}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      {viewTarget && (
        <ViewBoeDialog
          boe={viewTarget}
          allBoes={allBoes}
          onClose={() => {
            setViewTarget(null);
            navigate(savedBoeListPath, { replace: true });
          }}
          onEdit={() => {
            handleEdit(viewTarget.id);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          boe={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
