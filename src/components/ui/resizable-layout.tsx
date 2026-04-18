import { Fragment, useMemo, useState } from 'react';

import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type Layout,
} from 'react-resizable-panels';

import { cn } from '@/lib/utils';

interface ResizableLayoutProps extends Omit<
  GroupProps,
  'children' | 'onLayoutChange'
> {
  children: React.ReactNode[];
  storageKey?: string;
  defaultSizes?: number[];
  minSizes?: number[];
  maxSizes?: number[];
  className?: string;
  /** Fired with panel size percentages in panel order (not the Group `Layout` map). */
  onLayoutChange?: (sizes: number[]) => void;
  /** @deprecated Prefer `orientation` on `Group`. */
  direction?: 'horizontal' | 'vertical';
}

function parseStoredLayout(
  raw: string,
  panelIds: string[],
  defaultSizes: number[]
): Layout {
  const parsed: unknown = JSON.parse(raw);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Layout;
  }
  if (Array.isArray(parsed) && parsed.length === panelIds.length) {
    return Object.fromEntries(
      panelIds.map((id, i) => [id, Number(parsed[i]) || defaultSizes[i] || 50])
    );
  }
  return Object.fromEntries(
    panelIds.map((id, i) => [id, defaultSizes[i] ?? 50])
  );
}

export function ResizableLayout({
  children,
  storageKey = 'resizable-layout',
  defaultSizes = [50, 50],
  minSizes = [20, 20],
  maxSizes = [80, 80],
  className,
  onLayoutChange,
  direction,
  orientation: orientationProp,
  ...groupProps
}: ResizableLayoutProps) {
  const orientation: GroupProps['orientation'] =
    orientationProp ?? (direction === 'vertical' ? 'vertical' : 'horizontal');
  const panelIds = useMemo(
    () =>
      Array.from(
        { length: children.length },
        (_, i) => `${storageKey}-panel-${i}`
      ),
    [children.length, storageKey]
  );

  const defaultLayout = useMemo((): Layout => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return parseStoredLayout(stored, panelIds, defaultSizes);
      }
    } catch (e) {
      console.warn('Failed to load saved layout:', e);
    }
    return Object.fromEntries(
      panelIds.map((id, i) => [id, defaultSizes[i] ?? 50])
    );
  }, [defaultSizes, panelIds, storageKey]);

  const handleLayoutChanged = (layout: Layout) => {
    const sizes = panelIds.map(id => layout[id] ?? 0);
    onLayoutChange?.(sizes);
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch (e) {
      console.warn('Failed to save layout:', e);
    }
  };

  return (
    <div className={cn('h-full w-full', className)}>
      <Group
        {...groupProps}
        orientation={orientation}
        defaultLayout={defaultLayout}
        onLayoutChanged={handleLayoutChanged}
      >
        {children.map((child, index) => (
          <Fragment key={panelIds[index]}>
            <Panel
              id={panelIds[index]}
              defaultSize={
                defaultLayout[panelIds[index]] ?? defaultSizes[index] ?? 50
              }
              minSize={minSizes[index] ?? 20}
              maxSize={maxSizes[index] ?? 80}
            >
              <div className="h-full w-full overflow-auto">{child}</div>
            </Panel>
            {index < children.length - 1 ? (
              <Separator className="bg-border hover:bg-primary/50 w-1 transition-colors duration-200" />
            ) : null}
          </Fragment>
        ))}
      </Group>
    </div>
  );
}

// Vertical layout variant
export function ResizableVerticalLayout({
  children,
  storageKey = 'resizable-vertical-layout',
  defaultSizes = [60, 40],
  minSizes = [30, 20],
  maxSizes = [80, 70],
  className,
  onLayoutChange,
  ...props
}: ResizableLayoutProps) {
  return (
    <ResizableLayout
      storageKey={storageKey}
      defaultSizes={defaultSizes}
      minSizes={minSizes}
      maxSizes={maxSizes}
      className={className}
      onLayoutChange={onLayoutChange}
      orientation="vertical"
      {...props}
    >
      {children}
    </ResizableLayout>
  );
}

// Layout controls component
interface LayoutControlsProps {
  onReset: () => void;
  onToggleDirection?: () => void;
  direction?: 'horizontal' | 'vertical';
  className?: string;
}

export function LayoutControls({
  onReset,
  onToggleDirection,
  direction = 'horizontal',
  className,
}: LayoutControlsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {onToggleDirection && (
        <button
          onClick={onToggleDirection}
          className="hover:bg-muted rounded-md p-2 text-sm transition-colors"
          title={`Switch to ${direction === 'horizontal' ? 'vertical' : 'horizontal'} layout`}
        >
          {direction === 'horizontal' ? '↔' : '↕'}
        </button>
      )}

      <button
        onClick={onReset}
        className="hover:bg-muted rounded-md p-2 text-sm transition-colors"
        title="Reset layout"
      >
        ↺
      </button>
    </div>
  );
}

// Hook for managing layout preferences
export function useLayoutPreferences(storageKey: string) {
  const [preferences, setPreferences] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const savePreferences = (newPreferences: Record<string, unknown>) => {
    const updated = { ...preferences, ...newPreferences };
    setPreferences(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save layout preferences:', e);
    }
  };

  return { preferences, savePreferences };
}
