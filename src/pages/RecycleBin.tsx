import { useCallback, useEffect, useMemo, useState } from 'react';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppBar, PageHeader } from '@/components/shared/im';
import {
  confirm as confirmDestructive,
  isTauriEnvironment,
} from '@/lib/tauri-bridge';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { parseIpcError } from '@/lib/ipc-error';
import { useCurrentUserId } from '@/lib/user-context';

const PAGE_SIZE = 50;

interface DeletedRecordItem {
  table: string;
  record: Record<string, unknown>;
}

interface GetDeletedRecordsResponse {
  total: number;
  page: number;
  pageSize: number;
  items: DeletedRecordItem[];
}

function formatTableLabel(table: string): string {
  if (!table) return table;
  return table
    .split('_')
    .map(w => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Matches `MissingParentDetail` from `restore_deleted_records` error JSON. */
interface MissingParentDetailPayload {
  record_id: string;
  child_table: string;
  fk_column: string;
  parent_table: string;
  missing_parent_id: string;
  reason: string;
}

/**
 * Grouped "Missing Parent" + "Attempted Restore" copy for toasts and clipboard.
 */
function buildMissingParentErrorBody(
  childTable: string,
  recordIds: string[],
  details: MissingParentDetailPayload[],
  restoreAttemptId?: string
): { description: string; copyText: string } {
  const idSorted = [...new Set(recordIds)].sort((a, b) => a.localeCompare(b));
  const attempted = idSorted
    .map(id => `${formatTableLabel(childTable)} → ${id}`)
    .join('\n');
  const attemptedBlock = `Attempted Restore:\n\n${attempted}\n\n`;

  const missingParentKeyCount = new Set(
    details.map(d => `${d.parent_table}::${d.missing_parent_id}`)
  ).size;
  const affectedRecordCount = new Set(details.map(d => d.record_id)).size;
  const summaryBlock = `Missing Parents: ${missingParentKeyCount}\nAffected Records: ${affectedRecordCount}\n\n`;

  const byParent = new Map<string, MissingParentDetailPayload[]>();
  for (const d of details) {
    const list = byParent.get(d.parent_table) ?? [];
    list.push(d);
    byParent.set(d.parent_table, list);
  }
  const parentTables = [...byParent.keys()].sort((a, b) => a.localeCompare(b));

  const out: string[] = [];
  for (const p of parentTables) {
    const rows = byParent.get(p) ?? [];
    const ids = new Set<string>();
    for (const r of rows) ids.add(r.missing_parent_id);
    const sortedParentIds = [...ids].sort((a, b) => a.localeCompare(b));
    out.push(`${formatTableLabel(p)}:\n`);
    for (const id of sortedParentIds) {
      out.push(`→ ${id}\n`);
    }
    out.push('\n');
  }
  const missingBlock = out.join('').replace(/\n+$/, '\n');
  const description =
    `${attemptedBlock}${summaryBlock}${missingBlock}`.trimEnd();

  const headerLines: string[] = [`Timestamp: ${new Date().toISOString()}`];
  if (restoreAttemptId) {
    headerLines.push(`restore_attempt_id: ${restoreAttemptId}`);
  }
  const copyText = `${headerLines.join('\n')}\n\n${description}`.trimEnd();
  return { description, copyText };
}

function rowKey(table: string, id: string): string {
  return `${table}::${id}`;
}

function recordId(rec: Record<string, unknown>): string {
  for (const k of Object.keys(rec)) {
    if (k.toLowerCase() === 'id') {
      const v = rec[k];
      if (v == null) return '';
      return String(v);
    }
  }
  return '';
}

function recordDisplayName(rec: Record<string, unknown>): string {
  const id = recordId(rec);
  for (const k of Object.keys(rec)) {
    if (k.toLowerCase().includes('name') && k !== 'deleted_by') {
      const v = rec[k];
      if (v != null && String(v).length > 0) return String(v);
    }
  }
  for (const k of ['title', 'invoice_number', 'part_number', 'bl_awb_number']) {
    if (k in rec && rec[k] != null) return String(rec[k]);
  }
  return id || '—';
}

function deletedAt(rec: Record<string, unknown>): string {
  const v = rec['deleted_at'];
  return v != null ? String(v) : '—';
}

function groupIdsByTable(
  keys: string[],
  items: DeletedRecordItem[]
): Map<string, string[]> {
  const byKey = new Map<string, { table: string; id: string }>();
  for (const it of items) {
    const id = recordId(it.record);
    byKey.set(rowKey(it.table, id), { table: it.table, id });
  }
  const m = new Map<string, string[]>();
  for (const k of keys) {
    const e = byKey.get(k);
    if (!e) continue;
    const list = m.get(e.table) ?? [];
    list.push(e.id);
    m.set(e.table, list);
  }
  return m;
}

function RecycleBinContent() {
  const userId = useCurrentUserId();
  const [tables, setTables] = useState<string[]>([]);
  const [filterTable, setFilterTable] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<GetDeletedRecordsResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedSearch(search.trim().toLowerCase()),
      250
    );
    return () => clearTimeout(t);
  }, [search]);

  const loadTables = useCallback(async () => {
    try {
      const t = await invoke<string[]>('get_soft_delete_tables', { userId });
      setTables(Array.isArray(t) ? t : []);
    } catch (e) {
      logError(String(e), 'recycle-bin');
      setTables([]);
    }
  }, [userId]);

  const loadRecords = useCallback(async () => {
    if (!isTauriEnvironment) {
      setResponse({
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        items: [],
      });
      setLoading(false);
      return;
    }
    const args = {
      tableName: filterTable && filterTable !== 'all' ? filterTable : null,
      search: debouncedSearch || null,
      page,
      pageSize: PAGE_SIZE,
    };
    setLoading(true);
    try {
      let sidebarCount: number | null = null;
      try {
        sidebarCount = await invoke<number>('get_recycle_bin_deleted_count', {
          userId,
        });
      } catch (countErr) {
        logWarn(
          `get_recycle_bin_deleted_count failed: ${String(countErr)}`,
          'recycle-bin'
        );
      }

      const r = await invoke<GetDeletedRecordsResponse>('get_deleted_records', {
        ...args,
        userId,
      });

      if (sidebarCount != null && r?.total !== sidebarCount) {
        logWarn(
          `MISMATCH: sidebar count (${String(sidebarCount)}) vs get_deleted_records total (${String(r?.total)})`,
          'recycle-bin'
        );
      }
      setResponse(r);

      setSelected(new Set());
    } catch (e) {
      logError(String(e), 'recycle-bin');
      toast.error(`Failed to load recycle bin: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [filterTable, debouncedSearch, page, userId]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords, refreshToken]);

  const totalPages = useMemo(() => {
    if (!response) return 1;
    return Math.max(1, Math.ceil(response.total / PAGE_SIZE));
  }, [response]);

  const toggle = (k: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const toggleAllPage = () => {
    if (!response) return;
    const keys = response.items.map(it =>
      rowKey(it.table, recordId(it.record))
    );
    const allOn = keys.every(k => selected.has(k));
    setSelected(prev => {
      const n = new Set(prev);
      if (allOn) for (const k of keys) n.delete(k);
      else for (const k of keys) n.add(k);
      return n;
    });
  };

  const onRestore = async () => {
    if (!response || selected.size === 0) {
      toast.error('Select at least one record.');
      return;
    }
    const ok = await confirmDestructive('Restore selected records?');
    if (!ok) return;
    const map = groupIdsByTable([...selected], response.items);
    for (const [table, ids] of map) {
      if (ids.length === 0) continue;
      try {
        await invoke<string>('restore_deleted_records', {
          tableName: table,
          recordIds: ids,
          userId,
        });
      } catch (e) {
        const parsedIpc = parseIpcError(e);
        if (parsedIpc?.code === 'missing_parent') {
          let parsedDetails: {
            type?: string;
            details?: unknown;
            restore_attempt_id?: string;
          } | null = null;
          if (typeof parsedIpc.details === 'string') {
            try {
              parsedDetails = JSON.parse(parsedIpc.details) as {
                type?: string;
                details?: unknown;
                restore_attempt_id?: string;
              };
            } catch {
              // Keep generic branch below.
            }
          }
          const details = Array.isArray(parsedDetails?.details)
            ? (parsedDetails?.details as MissingParentDetailPayload[])
            : [];
          const attemptId =
            parsedIpc.correlationId ?? parsedDetails?.restore_attempt_id;
          if (details.length > 0) {
            const { description, copyText } = buildMissingParentErrorBody(
              table,
              ids,
              details,
              attemptId
            );
            logWarn(
              attemptId
                ? `Missing parent [restore_attempt_id=${attemptId}]: ${details
                    .map(
                      d =>
                        `${d.child_table}[${d.record_id}].${d.fk_column} -> ${d.parent_table}(${d.missing_parent_id}, ${d.reason})`
                    )
                    .join(' | ')}`
                : `Missing parent: ${details
                    .map(
                      d =>
                        `${d.child_table}[${d.record_id}].${d.fk_column} -> ${d.parent_table}(${d.missing_parent_id}, ${d.reason})`
                    )
                    .join(' | ')}`,
              'restore'
            );
            toast.error('Cannot restore record.', {
              description: (
                <div className="max-h-64 overflow-y-auto whitespace-pre-line pr-1 text-left text-sm">
                  {description}
                </div>
              ),
              duration: 30_000,
              action: {
                label: 'Copy Details',
                onClick: () => {
                  void navigator.clipboard.writeText(copyText);
                  logInfo(
                    'Missing parent details copied to clipboard',
                    'restore'
                  );
                },
              },
            });
          } else {
            logWarn(
              attemptId
                ? `Missing parent: empty details from restore validation [restore_attempt_id=${attemptId}]`
                : 'Missing parent: empty details from restore validation',
              'restore'
            );
            toast.error(
              'Cannot restore record — required parent data is missing.'
            );
          }
          return;
        }
        const raw =
          parsedIpc?.message ??
          (e instanceof Error
            ? e.message
            : typeof e === 'string'
              ? e
              : String(e));
        logError(raw, 'restore');
        toast.error(`Restore failed: ${raw}`);
        return;
      }
    }
    logInfo('Restored records from recycle bin', 'restore');
    toast.success('Records restored successfully');
    window.dispatchEvent(new Event('recycle-bin-changed'));
    setRefreshToken(x => x + 1);
    setSelected(new Set());
  };

  const onPermanent = async () => {
    if (!response || selected.size === 0) {
      toast.error('Select at least one record.');
      return;
    }
    const ok = await confirmDestructive(
      'This action permanently deletes records. Continue?'
    );
    if (!ok) return;
    const map = groupIdsByTable([...selected], response.items);
    try {
      for (const [table, ids] of map) {
        if (ids.length === 0) continue;
        await invoke<string>('permanently_delete_records', {
          tableName: table,
          recordIds: ids,
          userId,
        });
      }
      toast.success('Selected records were permanently deleted');
      window.dispatchEvent(new Event('recycle-bin-changed'));
      setRefreshToken(x => x + 1);
      setSelected(new Set());
    } catch (e) {
      const raw = String(e);
      logError(raw, 'recycle-bin');
      if (
        raw.includes('DEPENDENCY') ||
        raw.toLowerCase().includes('referenced')
      ) {
        toast.error(
          'Cannot delete — record is still referenced in other modules.'
        );
      } else {
        toast.error(`Delete failed: ${raw}`);
      }
    }
  };

  const empty = !loading && response && response.total === 0;
  const items = response?.items ?? [];

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Recycle Bin']} />
      <PageHeader
        title="Recycle Bin"
        subtitle="View and restore soft-deleted records, or permanently remove them."
        actions={
          <button
            type="button"
            className="im-btn im-btn--sm"
            onClick={() => setRefreshToken(x => x + 1)}
          >
            <RefreshCw style={{ width: 13, height: 13, marginRight: 6 }} />
            Refresh
          </button>
        }
      />
      <div className="im-dashboard-body flex flex-col gap-4">
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Filters</span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'flex-end',
            }}
          >
            <div>
              <label className="im-field-label">Table</label>
              <div className="im-select-wrap" style={{ width: 180 }}>
                <select
                  className="im-select"
                  value={filterTable || 'all'}
                  onChange={e => {
                    setFilterTable(
                      e.target.value === 'all' ? '' : e.target.value
                    );
                    setPage(1);
                  }}
                >
                  <option value="all">All tables</option>
                  {tables.map(t => (
                    <option key={t} value={t}>
                      {formatTableLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="im-field-label">Search</label>
              <input
                className="im-input"
                style={{ width: 260 }}
                placeholder="Name, id, or table"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <button
              className="im-btn im-btn--sm"
              onClick={() => void loadRecords()}
            >
              <RefreshCw style={{ width: 13, height: 13, marginRight: 6 }} />
              Refresh
            </button>
          </div>
        </div>

        <div className="im-section" style={{ flex: 1 }}>
          <div
            className="im-section__header"
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <span className="im-section__label">// Deleted records</span>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button
                className="im-btn im-btn--sm im-btn--primary"
                onClick={onRestore}
                disabled={selected.size === 0}
              >
                Restore selected
              </button>
              <button
                className="im-btn im-btn--sm im-btn--danger"
                onClick={onPermanent}
                disabled={selected.size === 0}
              >
                <Trash2 style={{ width: 13, height: 13, marginRight: 6 }} />
                Delete permanently
              </button>
              {response && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--color-im-faint)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {response.total} total · Page {response.page} of {totalPages}
                </span>
              )}
            </div>
          </div>
          <div className="im-table-scroll">
            {loading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 32,
                  color: 'var(--color-im-faint)',
                  fontSize: 13,
                }}
              >
                <RefreshCw
                  style={{ width: 16, height: 16 }}
                  className="animate-spin"
                />
                Loading…
              </div>
            ) : empty ? (
              <p
                style={{
                  padding: 40,
                  textAlign: 'center',
                  color: 'var(--color-im-faint)',
                  fontSize: 13,
                }}
              >
                No deleted records found.
              </p>
            ) : (
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th" style={{ width: 44 }}>
                      <input
                        type="checkbox"
                        checked={
                          items.length > 0 &&
                          items.every(it =>
                            selected.has(rowKey(it.table, recordId(it.record)))
                          )
                        }
                        onChange={toggleAllPage}
                        aria-label="Select all on page"
                      />
                    </th>
                    <th className="im-th">Table</th>
                    <th className="im-th">Record</th>
                    <th className="im-th">Id</th>
                    <th className="im-th">Deleted</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const id = recordId(it.record);
                    const k = rowKey(it.table, id);
                    return (
                      <tr
                        key={k}
                        className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                      >
                        <td className="im-td">
                          <input
                            type="checkbox"
                            checked={selected.has(k)}
                            onChange={() => toggle(k)}
                          />
                        </td>
                        <td className="im-td" style={{ fontWeight: 500 }}>
                          {formatTableLabel(it.table)}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={recordDisplayName(it.record)}
                        >
                          {recordDisplayName(it.record)}
                        </td>
                        <td className="im-td is-mono" title={id}>
                          {id || '—'}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            color: 'var(--color-im-muted)',
                            fontSize: 12,
                          }}
                        >
                          {deletedAt(it.record)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {response && response.total > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderTop: '1px solid var(--color-im-border)',
              }}
            >
              <button
                className="im-btn im-btn--sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span style={{ fontSize: 12, color: 'var(--color-im-faint)' }}>
                {response.total > 0
                  ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, response.total)} of ${response.total}`
                  : '0'}
              </span>
              <button
                className="im-btn im-btn--sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecycleBin() {
  return (
    <ErrorBoundary componentName="RecycleBin">
      <RecycleBinContent />
    </ErrorBoundary>
  );
}
