import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import {
  exportErrorEventsCursorReport,
  getErrorMemoryMaintenanceStats,
  listErrorEvents,
  runErrorMemoryCleanup,
  updateErrorEventStatus,
  type ErrorMemoryCleanupResult,
  type ErrorMemoryFilter,
  type ErrorMemoryMaintenanceStats,
  type ErrorMemoryRow,
} from '@/lib/error-memory';
import { AppBar } from '@/components/shared/im';

const STATUSES = ['new', 'triaged', 'fixed', 'ignored', 'duplicate'] as const;
const SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;

export default function ErrorCenterPage() {
  const [rows, setRows] = useState<ErrorMemoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [moduleName, setModuleName] = useState('');
  const [commandName, setCommandName] = useState('');
  const [search, setSearch] = useState('');
  const [maintenance, setMaintenance] =
    useState<ErrorMemoryMaintenanceStats | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupPreview, setCleanupPreview] =
    useState<ErrorMemoryCleanupResult | null>(null);

  const loadMaintenance = async () => {
    try {
      const stats = await getErrorMemoryMaintenanceStats();
      setMaintenance(stats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const filter: ErrorMemoryFilter = {
        severity: severity === 'all' ? undefined : severity,
        status: status === 'all' ? undefined : status,
        moduleName: moduleName.trim() || undefined,
        commandName: commandName.trim() || undefined,
        limit: 300,
      };
      const r = await listErrorEvents(filter);
      setRows(r);
      await loadMaintenance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [
        r.errorMessage,
        r.errorCode,
        r.errorCategory,
        r.moduleName,
        r.commandName,
        r.pageName,
        r.componentName,
        r.fingerprint,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const selected =
    filtered.find(r => r.id === selectedId) ?? filtered[0] ?? null;

  const setStatusForSelected = async (next: (typeof STATUSES)[number]) => {
    if (!selected) return;
    try {
      await updateErrorEventStatus(selected.id, next);
      toast.success(`Marked as ${next}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onExport = async () => {
    if (!selected) return;
    try {
      const report = await exportErrorEventsCursorReport([selected.id]);
      await navigator.clipboard.writeText(report);
      toast.success('Cursor-ready report copied');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const downloadExport = async () => {
    const ids = filtered.slice(0, 50).map(r => r.id);
    try {
      const report = await exportErrorEventsCursorReport(ids);
      const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `error-center-export-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onPreviewCleanup = async () => {
    setCleanupBusy(true);
    try {
      const result = await runErrorMemoryCleanup({
        dryRun: true,
        deleteLimit: 300,
      });
      setCleanupPreview(result);
      toast.success(
        `Preview ready: ${result.wouldPruneCount} candidate records`
      );
      await loadMaintenance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCleanupBusy(false);
    }
  };

  const onRunCleanup = async () => {
    setCleanupBusy(true);
    try {
      const result = await runErrorMemoryCleanup({
        dryRun: false,
        deleteLimit: 300,
      });
      setCleanupPreview(result);
      toast.success(`Cleanup completed: pruned ${result.deletedCount} records`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCleanupBusy(false);
    }
  };

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Administration', 'Error Center']} />
      <div
        className="im-dashboard-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        <div
          style={{
            padding: '14px 24px 12px',
            borderBottom: '1px solid var(--color-im-rule)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-im-text)',
                fontFamily: 'var(--font-im-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
            >
              Error Center
            </h1>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: 11.5,
                color: 'var(--color-im-faint)',
              }}
            >
              Persistent error memory with dedupe, triage and Cursor export.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="im-btn im-btn--sm" onClick={() => void load()}>
              <RefreshCw
                style={{
                  display: 'inline',
                  width: 12,
                  height: 12,
                  marginRight: 4,
                }}
              />
              Refresh
            </button>
            <button
              className="im-btn im-btn--sm"
              onClick={() => void downloadExport()}
            >
              <Download
                style={{
                  display: 'inline',
                  width: 12,
                  height: 12,
                  marginRight: 4,
                }}
              />
              Export selected view
            </button>
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Filters</span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 12,
            }}
          >
            <div>
              <label className="im-field-label">Severity</label>
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={severity}
                  onChange={e => setSeverity(e.target.value)}
                >
                  <option value="all">All</option>
                  {SEVERITIES.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="im-field-label">Status</label>
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  <option value="all">All</option>
                  {STATUSES.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="im-field-label">Module</label>
              <input
                className="im-input"
                value={moduleName}
                onChange={e => setModuleName(e.target.value)}
              />
            </div>
            <div>
              <label className="im-field-label">Command</label>
              <input
                className="im-input"
                value={commandName}
                onChange={e => setCommandName(e.target.value)}
              />
            </div>
            <div>
              <label className="im-field-label">Search</label>
              <input
                className="im-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <button
                className="im-btn im-btn--primary im-btn--sm"
                onClick={() => void load()}
                disabled={loading}
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Error memory maintenance
            </span>
            <span className="im-section__sub">
              Retention and cleanup policy controls.
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                fontSize: 11.5,
                color: 'var(--color-im-muted)',
              }}
            >
              <div>
                <strong style={{ color: 'var(--color-im-text)' }}>
                  Total count:
                </strong>{' '}
                {maintenance?.totalCount ?? '-'}
              </div>
              <div>
                <strong style={{ color: 'var(--color-im-text)' }}>
                  Duplicate groups:
                </strong>{' '}
                {maintenance?.duplicateCount ?? '-'}
              </div>
              <div>
                <strong style={{ color: 'var(--color-im-text)' }}>
                  Old resolved:
                </strong>{' '}
                {maintenance?.oldResolvedCount ?? '-'}
              </div>
              <div>
                <strong style={{ color: 'var(--color-im-text)' }}>
                  Hard cap:
                </strong>{' '}
                {maintenance?.hardCap ?? '-'}
              </div>
              <div>
                <strong style={{ color: 'var(--color-im-text)' }}>
                  Last cleanup:
                </strong>{' '}
                {maintenance?.lastCleanupAt || '-'}
              </div>
              <div>
                <strong style={{ color: 'var(--color-im-text)' }}>
                  Last summary:
                </strong>{' '}
                {maintenance?.lastCleanupSummary || '-'}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                className="im-btn im-btn--sm"
                onClick={() => void downloadExport()}
                disabled={cleanupBusy}
              >
                Export current view (before cleanup)
              </button>
              <button
                className="im-btn im-btn--sm"
                onClick={() => void onPreviewCleanup()}
                disabled={cleanupBusy}
              >
                Dry-run cleanup
              </button>
              <button
                className="im-btn im-btn--primary im-btn--sm"
                onClick={() => void onRunCleanup()}
                disabled={cleanupBusy}
              >
                Run cleanup
              </button>
            </div>
            {cleanupPreview && (
              <div
                style={{
                  padding: 10,
                  border: '1px solid var(--color-im-rule)',
                  borderRadius: 2,
                  fontSize: 11.5,
                }}
              >
                <div>
                  <strong>Preview/run id:</strong> {cleanupPreview.runId}
                </div>
                <div>
                  <strong>Result:</strong>{' '}
                  {cleanupPreview.dryRun
                    ? `would prune ${cleanupPreview.wouldPruneCount}`
                    : `pruned ${cleanupPreview.deletedCount}`}{' '}
                  records (candidates {cleanupPreview.candidateCount}, protected{' '}
                  {cleanupPreview.protectedCount})
                </div>
                <div>
                  <strong>Executed:</strong> {cleanupPreview.executedAt}
                </div>
                {cleanupPreview.pruneReasons.length > 0 && (
                  <div
                    style={{
                      marginTop: 4,
                      maxHeight: 96,
                      overflowY: 'auto',
                      fontFamily: 'monospace',
                      fontSize: 11,
                    }}
                  >
                    {cleanupPreview.pruneReasons.slice(0, 8).join('\n')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
          }}
        >
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">
                // Captured errors ({filtered.length})
              </span>
              <span className="im-section__sub">
                Grouped by fingerprint with occurrence count.
              </span>
            </div>
            <div
              className="im-section__body"
              style={{ maxHeight: 560, overflowY: 'auto', padding: 0 }}
            >
              {filtered.map(r => (
                <button
                  key={r.id}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    background:
                      selected?.id === r.id
                        ? 'rgba(232,162,58,0.10)'
                        : 'transparent',
                    borderLeft:
                      selected?.id === r.id
                        ? '2px solid var(--color-im-accent)'
                        : '2px solid transparent',
                    borderBottom: '1px solid var(--color-im-rule)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                  }}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                    >
                      {r.errorCode || 'error'}: {r.errorMessage}
                    </div>
                    <span
                      className="im-badge is-neutral"
                      style={{ flexShrink: 0 }}
                    >
                      {r.occurrenceCount}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0 12px',
                      fontSize: 11,
                      color: 'var(--color-im-muted)',
                    }}
                  >
                    <span>{r.severity}</span>
                    <span>{r.status}</span>
                    <span>{r.moduleName || '-'}</span>
                    <span>{r.lastSeenAt}</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p
                  style={{
                    padding: 12,
                    margin: 0,
                    fontSize: 12.5,
                    color: 'var(--color-im-muted)',
                  }}
                >
                  No errors matched filters.
                </p>
              )}
            </div>
          </div>

          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">// Detail view</span>
            </div>
            <div
              className="im-section__body"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {!selected ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: 'var(--color-im-muted)',
                  }}
                >
                  Select an error row.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {STATUSES.map(s => (
                      <button
                        key={s}
                        className={`im-btn im-btn--sm${selected.status === s ? 'im-btn--primary' : ''}`}
                        onClick={() => void setStatusForSelected(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: 6,
                      fontSize: 11.5,
                      color: 'var(--color-im-muted)',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--color-im-text)' }}>
                        Fingerprint:
                      </strong>{' '}
                      {selected.fingerprint}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--color-im-text)' }}>
                        First/Last seen:
                      </strong>{' '}
                      {selected.firstSeenAt} / {selected.lastSeenAt}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--color-im-text)' }}>
                        Module/Command:
                      </strong>{' '}
                      {selected.moduleName || '-'} /{' '}
                      {selected.commandName || '-'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--color-im-text)' }}>
                        Page/Component:
                      </strong>{' '}
                      {selected.pageName || '-'} /{' '}
                      {selected.componentName || '-'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--color-im-text)' }}>
                        Category/Code:
                      </strong>{' '}
                      {selected.errorCategory || '-'} /{' '}
                      {selected.errorCode || '-'}
                    </div>
                  </div>
                  <div>
                    <label className="im-field-label">
                      Redacted payload preview
                    </label>
                    <textarea
                      readOnly
                      value={selected.redactedInputContext || ''}
                      className="im-textarea"
                      style={{
                        marginTop: 4,
                        minHeight: 80,
                        fontFamily: 'monospace',
                        fontSize: 11,
                      }}
                    />
                  </div>
                  <div>
                    <label className="im-field-label">Stack trace</label>
                    <textarea
                      readOnly
                      value={selected.stackTrace || ''}
                      className="im-textarea"
                      style={{
                        marginTop: 4,
                        minHeight: 140,
                        fontFamily: 'monospace',
                        fontSize: 11,
                      }}
                    />
                  </div>
                  <div>
                    <button
                      className="im-btn im-btn--sm"
                      onClick={() => void onExport()}
                    >
                      <Copy
                        style={{
                          display: 'inline',
                          width: 12,
                          height: 12,
                          marginRight: 4,
                        }}
                      />
                      Copy Cursor-ready report
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
