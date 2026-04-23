import { useCallback, useEffect, useMemo, useState } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  confirm as confirmDestructive,
  isTauriEnvironment,
} from '@/lib/tauri-bridge';
import { logInfo, logWarn } from '@/lib/logger';

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
      const t = await invoke<string[]>('get_soft_delete_tables');
      setTables(Array.isArray(t) ? t : []);
    } catch (e) {
      console.error(e);
      setTables([]);
    }
  }, []);

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
        sidebarCount = await invoke<number>('get_recycle_bin_deleted_count');
      } catch (countErr) {
        console.warn(
          '[RecycleBin] get_recycle_bin_deleted_count failed:',
          countErr
        );
      }

      const r = await invoke<GetDeletedRecordsResponse>(
        'get_deleted_records',
        args
      );

      if (sidebarCount != null && r?.total !== sidebarCount) {
        console.warn(
          '[RecycleBin] MISMATCH: sidebar count vs get_deleted_records total',
          { sidebarCount, listTotal: r?.total, args }
        );
      }
      setResponse(r);

      setSelected(new Set());
    } catch (e) {
      console.error(e);
      toast.error(`Failed to load recycle bin: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [filterTable, debouncedSearch, page]);

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
        });
      } catch (e) {
        const raw =
          e instanceof Error
            ? e.message
            : typeof e === 'string'
              ? e
              : String(e);
        let parsed: {
          type?: string;
          details?: unknown;
          restore_attempt_id?: string;
        } | null = null;
        try {
          parsed = JSON.parse(raw) as {
            type?: string;
            details?: unknown;
            restore_attempt_id?: string;
          };
        } catch {
          // not JSON
        }
        if (
          parsed?.type === 'MISSING_PARENT' &&
          Array.isArray(parsed.details)
        ) {
          const details = parsed.details as MissingParentDetailPayload[];
          const attemptId = parsed.restore_attempt_id;
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
        console.error(e);
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
        });
      }
      toast.success('Selected records were permanently deleted');
      window.dispatchEvent(new Event('recycle-bin-changed'));
      setRefreshToken(x => x + 1);
      setSelected(new Set());
    } catch (e) {
      const raw = String(e);
      console.error(e);
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
    <div className="container mx-auto max-w-6xl py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-blue-600">Recycle Bin</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View and restore soft-deleted records, or permanently remove them.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRefreshToken(x => x + 1)}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="text-muted-foreground mb-1 block text-sm">
                Table
              </label>
              <Select
                value={filterTable || 'all'}
                onValueChange={v => {
                  setFilterTable(v === 'all' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All tables" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tables</SelectItem>
                  {tables.map(t => (
                    <SelectItem key={t} value={t}>
                      {formatTableLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 flex-1">
              <label className="text-muted-foreground mb-1 block text-sm">
                Search
              </label>
              <div className="relative">
                <Search className="text-muted-foreground absolute left-2 top-2.5 h-4 w-4" />
                <Input
                  className="pl-8"
                  placeholder="Name, id, or table"
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <Button
              size="sm"
              onClick={onRestore}
              disabled={selected.size === 0}
            >
              Restore selected
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onPermanent}
              disabled={selected.size === 0}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete permanently
            </Button>
            {response && (
              <span className="text-muted-foreground text-sm">
                {response.total} total · Page {response.page} of {totalPages}
              </span>
            )}
          </div>
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 p-8 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : empty ? (
            <p className="text-muted-foreground p-10 text-center text-sm">
              No deleted records found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        items.length > 0 &&
                        items.every(it =>
                          selected.has(rowKey(it.table, recordId(it.record)))
                        )
                      }
                      onCheckedChange={toggleAllPage}
                      aria-label="Select all on page"
                    />
                  </TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Id</TableHead>
                  <TableHead>Deleted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(it => {
                  const id = recordId(it.record);
                  const k = rowKey(it.table, id);
                  return (
                    <TableRow key={k}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(k)}
                          onCheckedChange={() => toggle(k)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatTableLabel(it.table)}
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate"
                        title={recordDisplayName(it.record)}
                      >
                        {recordDisplayName(it.record)}
                      </TableCell>
                      <TableCell className="font-mono text-sm" title={id}>
                        {id || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {deletedAt(it.record)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {response && response.total > 0 && (
            <div className="flex items-center justify-between border-t p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm">
                {response.total > 0
                  ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, response.total)} of ${response.total}`
                  : '0'}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
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
