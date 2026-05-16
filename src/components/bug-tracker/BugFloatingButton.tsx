import { Bug, List, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const FAB_POS_KEY = 'import-manager.bug-fab-pos.v1';
const DRAG_THRESHOLD_SQ = 64;
const DEFAULT_RB = 24;

function loadSavedPosition(): { right: number; bottom: number } {
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return { right: DEFAULT_RB, bottom: DEFAULT_RB };
    const p = JSON.parse(raw) as { right?: unknown; bottom?: unknown };
    if (typeof p.right === 'number' && typeof p.bottom === 'number') {
      if (!Number.isFinite(p.right) || !Number.isFinite(p.bottom)) {
        return { right: DEFAULT_RB, bottom: DEFAULT_RB };
      }
      return { right: p.right, bottom: p.bottom };
    }
  } catch {
    /* ignore */
  }
  return { right: DEFAULT_RB, bottom: DEFAULT_RB };
}

function clampFab(
  right: number,
  bottom: number,
  el: HTMLDivElement
): { right: number; bottom: number } {
  const rect = el.getBoundingClientRect();
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxR = Math.max(margin, vw - rect.width - margin);
  const maxB = Math.max(margin, vh - rect.height - margin);
  return {
    right: Math.min(Math.max(right, margin), maxR),
    bottom: Math.min(Math.max(bottom, margin), maxB),
  };
}

interface BugFloatingButtonProps {
  onQuickCapture: (ev: React.MouseEvent) => void;
  onCompose: () => void;
  onOpenList: () => void;
}

export function BugFloatingButton({
  onQuickCapture,
  onCompose,
  onOpenList,
}: BugFloatingButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [fabPos, setFabPos] = useState(loadSavedPosition);
  const clusterRef = useRef<HTMLDivElement>(null);
  const fabPosRef = useRef(fabPos);
  fabPosRef.current = fabPos;

  const suppressClickRef = useRef(false);
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  } | null>(null);
  const dragActiveRef = useRef(false);
  const removeWindowListenersRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number>(0);

  const persistPosition = useCallback((right: number, bottom: number) => {
    try {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({ right, bottom }));
    } catch {
      /* ignore */
    }
  }, []);

  const endDragSession = useCallback(() => {
    dragSessionRef.current = null;
    dragActiveRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      removeWindowListenersRef.current?.();
      removeWindowListenersRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = clusterRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setExpanded(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  useEffect(() => {
    const el = clusterRef.current;
    if (!el) return;
    const onResize = () => {
      setFabPos(prev => {
        const next = clampFab(prev.right, prev.bottom, el);
        if (next.right !== prev.right || next.bottom !== prev.bottom) {
          persistPosition(next.right, next.bottom);
        }
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [persistPosition]);

  const handleClusterPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const el = clusterRef.current;
      if (!el) return;

      removeWindowListenersRef.current?.();
      removeWindowListenersRef.current = null;

      const { right, bottom } = fabPosRef.current;
      dragSessionRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startRight: right,
        startBottom: bottom,
      };
      dragActiveRef.current = false;

      const onMove = (ev: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || ev.pointerId !== session.pointerId) return;
        const dx = ev.clientX - session.startX;
        const dy = ev.clientY - session.startY;
        if (!dragActiveRef.current) {
          if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
          dragActiveRef.current = true;
          try {
            el.setPointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
        }
        const rawRight = session.startRight + dx;
        const rawBottom = session.startBottom - dy;
        const next = clampFab(rawRight, rawBottom, el);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          setFabPos(next);
        });
      };

      const onUp = (ev: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || ev.pointerId !== session.pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        removeWindowListenersRef.current = null;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }

        if (dragActiveRef.current) {
          try {
            el.releasePointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
          const dx = ev.clientX - session.startX;
          const dy = ev.clientY - session.startY;
          const clamped = clampFab(
            session.startRight + dx,
            session.startBottom - dy,
            el
          );
          setFabPos(clamped);
          persistPosition(clamped.right, clamped.bottom);
          suppressClickRef.current = true;
        }
        endDragSession();
      };

      const remove = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      removeWindowListenersRef.current = remove;

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [endDragSession, persistPosition]
  );

  const consumeSuppressClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  const handlePrimaryClick = (e: React.MouseEvent) => {
    if (consumeSuppressClick()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!expanded) {
      if (e.shiftKey) {
        void onQuickCapture(e);
        return;
      }
      setExpanded(true);
      return;
    }
    void onQuickCapture(e);
  };

  const guardSecondary = useCallback(
    (fn: () => void) => (e: React.MouseEvent) => {
      if (consumeSuppressClick()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      fn();
    },
    [consumeSuppressClick]
  );

  return (
    <div
      ref={clusterRef}
      className="fixed z-50 flex touch-none flex-col-reverse items-end gap-2"
      style={{ right: fabPos.right, bottom: fabPos.bottom }}
      onPointerDownCapture={handleClusterPointerDownCapture}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-14 w-14 rounded-full shadow-lg"
            aria-label="Quick capture bug"
            aria-expanded={expanded}
            onClick={handlePrimaryClick}
          >
            <Bug className="h-7 w-7" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {expanded
            ? 'Quick capture (Shift+click to compose)'
            : 'Show bug actions (Shift+click to compose)'}
        </TooltipContent>
      </Tooltip>

      {expanded ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-10 w-10 rounded-full shadow-md"
                aria-label="Compose bug"
                onClick={guardSecondary(onCompose)}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Compose bug</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-10 w-10 rounded-full shadow-md"
                aria-label="Bug list"
                onClick={guardSecondary(onOpenList)}
              >
                <List className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Bug list</TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
}
