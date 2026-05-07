import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
    <div className="container mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Error Center</h1>
          <p className="text-muted-foreground text-sm">
            Persistent error memory with dedupe, triage and Cursor export.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 size-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void downloadExport()}
          >
            <Download className="mr-1 size-4" />
            Export selected view
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {SEVERITIES.map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUSES.map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Module</Label>
            <Input
              value={moduleName}
              onChange={e => setModuleName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Command</Label>
            <Input
              value={commandName}
              onChange={e => setCommandName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Search</Label>
            <Input value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="md:col-span-5">
            <Button size="sm" onClick={() => void load()} disabled={loading}>
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Error memory maintenance</CardTitle>
          <CardDescription>
            Retention and cleanup policy controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-xs md:grid-cols-3">
            <div>
              <strong>Total count:</strong> {maintenance?.totalCount ?? '-'}
            </div>
            <div>
              <strong>Duplicate groups:</strong>{' '}
              {maintenance?.duplicateCount ?? '-'}
            </div>
            <div>
              <strong>Old resolved:</strong>{' '}
              {maintenance?.oldResolvedCount ?? '-'}
            </div>
            <div>
              <strong>Hard cap:</strong> {maintenance?.hardCap ?? '-'}
            </div>
            <div>
              <strong>Last cleanup:</strong> {maintenance?.lastCleanupAt || '-'}
            </div>
            <div>
              <strong>Last summary:</strong>{' '}
              {maintenance?.lastCleanupSummary || '-'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void downloadExport()}
              disabled={cleanupBusy}
            >
              Export current view (before cleanup)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onPreviewCleanup()}
              disabled={cleanupBusy}
            >
              Dry-run cleanup
            </Button>
            <Button
              size="sm"
              onClick={() => void onRunCleanup()}
              disabled={cleanupBusy}
            >
              Run cleanup
            </Button>
          </div>
          {cleanupPreview && (
            <div className="rounded border p-2 text-xs">
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
                <div className="mt-1 max-h-24 overflow-auto font-mono">
                  {cleanupPreview.pruneReasons.slice(0, 8).join('\n')}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Captured errors ({filtered.length})
            </CardTitle>
            <CardDescription>
              Grouped by fingerprint with occurrence count.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[560px] space-y-2 overflow-auto">
            {filtered.map(r => (
              <button
                key={r.id}
                className={`w-full rounded border p-2 text-left ${selected?.id === r.id ? 'bg-muted' : ''}`}
                onClick={() => setSelectedId(r.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">
                    {r.errorCode || 'error'}: {r.errorMessage}
                  </div>
                  <Badge variant="outline">{r.occurrenceCount}</Badge>
                </div>
                <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
                  <span>{r.severity}</span>
                  <span>{r.status}</span>
                  <span>{r.moduleName || '-'}</span>
                  <span>{r.lastSeenAt}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No errors matched filters.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detail view</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected ? (
              <p className="text-muted-foreground text-sm">
                Select an error row.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(s => (
                    <Button
                      key={s}
                      size="sm"
                      variant={selected.status === s ? 'default' : 'outline'}
                      onClick={() => void setStatusForSelected(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-2 text-xs">
                  <div>
                    <strong>Fingerprint:</strong> {selected.fingerprint}
                  </div>
                  <div>
                    <strong>First/Last seen:</strong> {selected.firstSeenAt} /{' '}
                    {selected.lastSeenAt}
                  </div>
                  <div>
                    <strong>Module/Command:</strong>{' '}
                    {selected.moduleName || '-'} / {selected.commandName || '-'}
                  </div>
                  <div>
                    <strong>Page/Component:</strong> {selected.pageName || '-'}{' '}
                    / {selected.componentName || '-'}
                  </div>
                  <div>
                    <strong>Category/Code:</strong>{' '}
                    {selected.errorCategory || '-'} /{' '}
                    {selected.errorCode || '-'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Redacted payload preview</Label>
                  <Textarea
                    readOnly
                    value={selected.redactedInputContext || ''}
                    className="mt-1 min-h-[80px] font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Stack trace</Label>
                  <Textarea
                    readOnly
                    value={selected.stackTrace || ''}
                    className="mt-1 min-h-[140px] font-mono text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onExport()}
                  >
                    <Copy className="mr-1 size-4" />
                    Copy Cursor-ready report
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
