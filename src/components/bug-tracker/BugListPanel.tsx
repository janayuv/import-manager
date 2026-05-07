import { convertFileSrc } from '@tauri-apps/api/core';
import { format } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatContextBreadcrumb } from '@/components/bug-tracker/utils';
import { cn } from '@/lib/utils';
import { isTauriEnvironment } from '@/lib/tauri-bridge';
import type { BugNote, BugStatus } from '@/types/bug-note';

function thumbSrc(path: string | null): string | null {
  if (!path) return null;
  if (!isTauriEnvironment) return path;
  return convertFileSrc(path);
}

export type StatusFilter = 'all' | BugStatus;

interface BugListPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bugs: BugNote[];
  isLoading: boolean;
  error: Error | null;
  filter: StatusFilter;
  onFilterChange: (f: StatusFilter) => void;
  onRowClick: (id: string) => void;
  onToggleStatus: (id: string, next: BugStatus) => void;
}

export function BugListPanel({
  open,
  onOpenChange,
  bugs,
  isLoading,
  error,
  filter,
  onFilterChange,
  onRowClick,
  onToggleStatus,
}: BugListPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Bugs</SheetTitle>
          <SheetDescription>
            Latest 200 bugs by update time. Open a bug and use "Copy for Cursor"
            to share it in chat.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-2">
          {(['all', 'OPEN', 'SOLVED'] as const).map(f => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => onFilterChange(f)}
            >
              {f === 'all' ? 'All' : f}
            </Button>
          ))}
        </div>

        <ScrollArea className="flex-1 pr-3">
          {error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : null}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : bugs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bugs yet.</p>
          ) : (
            <ul className="space-y-2">
              {bugs.map(b => {
                const crumb = formatContextBreadcrumb(b.context);
                const next: BugStatus = b.status === 'OPEN' ? 'SOLVED' : 'OPEN';
                const tsrc = thumbSrc(b.screenshotPath);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={cn(
                        'border-border hover:bg-muted/60 w-full rounded-lg border p-3 text-left transition-colors'
                      )}
                      onClick={() => onRowClick(b.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium leading-snug">
                            {b.title}
                          </div>
                          {crumb ? (
                            <div className="text-muted-foreground mt-1 truncate text-xs">
                              {crumb}
                            </div>
                          ) : null}
                          <div className="text-muted-foreground mt-1 text-xs">
                            Updated {format(b.updatedAt, 'MMM d, yyyy HH:mm')}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Badge
                            variant={
                              b.status === 'SOLVED' ? 'secondary' : 'default'
                            }
                            className="cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onClick={ev => {
                              ev.stopPropagation();
                              onToggleStatus(b.id, next);
                            }}
                            onKeyDown={ev => {
                              if (ev.key === 'Enter' || ev.key === ' ') {
                                ev.preventDefault();
                                ev.stopPropagation();
                                onToggleStatus(b.id, next);
                              }
                            }}
                          >
                            {b.status}
                          </Badge>
                          {tsrc ? (
                            <img
                              src={tsrc}
                              alt=""
                              className="h-12 w-12 rounded border object-cover"
                            />
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
