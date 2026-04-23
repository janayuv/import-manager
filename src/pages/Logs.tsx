import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isTauriEnvironment } from '@/lib/tauri-bridge';

const REFRESH_MS = 5000;

type LogFilter = 'all' | 'recycle_bin' | 'restore' | 'delete' | 'schema';

function lineMatchesFilter(line: string, filter: LogFilter): boolean {
  if (filter === 'all') return true;
  const lower = line;
  switch (filter) {
    case 'recycle_bin':
      return (
        lower.includes('recycle_bin') ||
        lower.includes('import_manager::recycle_bin')
      );
    case 'restore':
      return (
        lower.includes('import_manager::restore') || lower.includes('::restore')
      );
    case 'delete':
      return (
        lower.includes('import_manager::delete') || lower.includes('::delete::')
      );
    case 'schema':
      return lower.toLowerCase().includes('schema');
    default:
      return true;
  }
}

function LogsContent() {
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [cleared, setCleared] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLPreElement | null>(null);

  const loadLogs = useCallback(async () => {
    if (!isTauriEnvironment) {
      setRawLines([]);
      return;
    }
    setLoading(true);
    try {
      const lines = await invoke<string[]>('get_application_logs');
      setCleared(false);
      setRawLines(Array.isArray(lines) ? lines : []);
    } catch (e) {
      console.error(e);
      toast.error(`Failed to load logs: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!isTauriEnvironment) return undefined;
    const t = window.setInterval(() => {
      void loadLogs();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [loadLogs]);

  const displayLines = useMemo(
    () => (cleared ? [] : rawLines.filter(l => lineMatchesFilter(l, filter))),
    [cleared, rawLines, filter]
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [displayLines, filter, cleared]);

  return (
    <div className="container mx-auto max-w-5xl py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold text-blue-600">
            Application Logs
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadLogs()}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setCleared(true);
              toast.message('View cleared. Click Refresh to load logs again.');
            }}
          >
            Clear View
          </Button>
          <Select value={filter} onValueChange={v => setFilter(v as LogFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="recycle_bin">recycle_bin</SelectItem>
              <SelectItem value="restore">restore</SelectItem>
              <SelectItem value="delete">delete</SelectItem>
              <SelectItem value="schema">schema</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-muted-foreground mb-4 text-sm">
        Last 500 lines from <code className="text-xs">app.log</code> in the app
        log directory. Auto-refresh every {REFRESH_MS / 1000}s. Newest lines
        appear at the bottom.
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Log output</CardTitle>
        </CardHeader>
        <CardContent>
          <pre
            ref={scrollerRef}
            className="bg-muted/50 max-h-[min(70vh,32rem)] overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed"
          >
            {cleared
              ? 'View cleared. Click Refresh to load logs again.\n'
              : displayLines.length === 0
                ? (isTauriEnvironment
                    ? 'No log lines to display. If the file is new, use Refresh after taking actions in the app.'
                    : 'Logs are only available in the desktop app (Tauri).') +
                  '\n'
                : displayLines.join('\n') + '\n'}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LogsPage() {
  return (
    <ErrorBoundary componentName="Logs">
      <LogsContent />
    </ErrorBoundary>
  );
}
