import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { RefreshCw, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppBar, PageHeader } from '@/components/shared/im';
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
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Logs']} />
      <PageHeader
        title="Application Logs"
        subtitle="Last 500 lines from app.log — auto-refresh every 5s; newest at bottom."
        actions={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="im-btn im-btn--sm"
              onClick={() => void loadLogs()}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
            <button
              type="button"
              className="im-btn im-btn--sm"
              onClick={() => {
                setCleared(true);
                toast.message(
                  'View cleared. Click Refresh to load logs again.'
                );
              }}
            >
              Clear View
            </button>
            <div className="im-select-wrap" style={{ width: 160 }}>
              <select
                className="im-select"
                value={filter}
                onChange={e => setFilter(e.target.value as LogFilter)}
              >
                <option value="all">All</option>
                <option value="recycle_bin">recycle_bin</option>
                <option value="restore">restore</option>
                <option value="delete">delete</option>
                <option value="schema">schema</option>
              </select>
            </div>
          </div>
        }
      />
      <div className="im-dashboard-body flex flex-col gap-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ScrollText className="text-im-muted h-6 w-6" aria-hidden />
          <span className="text-im-faint font-im-mono text-xs">
            Raw log stream
          </span>
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--color-im-faint)' }}>
          Last 500 lines from <code className="text-xs">app.log</code> in the
          app log directory. Auto-refresh every {REFRESH_MS / 1000}s. Newest
          lines appear at the bottom.
        </p>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Log output</span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            <pre
              ref={scrollerRef}
              style={{
                fontFamily: 'var(--font-im-mono)',
                fontSize: 11,
                lineHeight: 1.6,
                maxHeight: 'min(70vh, 32rem)',
                overflow: 'auto',
                padding: 12,
                margin: 0,
                color: 'var(--color-im-muted)',
                background: 'var(--color-im-bg)',
              }}
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
          </div>
        </div>
      </div>
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
