import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchUserActivityLogs,
  type UserActivityAuditLog,
} from '@/lib/user-activity-audit';
import { useUser } from '@/lib/user-context';

function UserActivityDetailsCell({ raw }: { raw: string | null }) {
  if (!raw) return <>—</>;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const cid =
      typeof o.correlationId === 'string' ? o.correlationId : undefined;
    const sid = typeof o.sessionId === 'string' ? o.sessionId : undefined;
    if (cid || sid) {
      return (
        <span className="font-mono text-[11px]" title={raw}>
          {[cid ? `cid:${cid}` : null, sid ? `sess:${sid.slice(0, 8)}…` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      );
    }
  } catch {
    /* fall through */
  }
  return <span title={raw}>{raw}</span>;
}

export default function AdminUserActivityPage() {
  const { user } = useUser();
  const isAdmin = user?.role?.toLowerCase().includes('admin') ?? false;

  const [pageSize, setPageSize] = useState(50);
  const [pageIndex, setPageIndex] = useState(0);
  const [rows, setRows] = useState<UserActivityAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = pageIndex * pageSize;
      const uid = user?.id?.trim();
      if (!uid) {
        setRows([]);
        return;
      }
      const data = await fetchUserActivityLogs(pageSize, offset, uid);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [pageIndex, pageSize, user?.id]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          User Activity Audit Log
        </h1>
        <p className="text-muted-foreground text-sm">
          Audit trail from{' '}
          <code className="text-xs">user_activity_audit_logs</code>— tracks
          important user and system actions. Paged by newest first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagination</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="al-page-size">Page size</Label>
            <Input
              id="al-page-size"
              type="number"
              min={1}
              max={2000}
              value={pageSize}
              onChange={e => {
                setPageSize(
                  Math.min(2000, Math.max(1, Number(e.target.value) || 50))
                );
                setPageIndex(0);
              }}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 lg:col-span-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPageIndex(i => Math.max(0, i - 1))}
              disabled={loading || pageIndex === 0}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPageIndex(i => i + 1)}
              disabled={loading || rows.length < pageSize}
            >
              Next
            </Button>
            <Button
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh page'}
            </Button>
            <Badge variant="secondary">
              Page {pageIndex + 1} · {rows.length} row(s) this page
            </Badge>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log entries</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Timestamp</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Details / correlation</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground text-center"
                  >
                    No rows. Adjust filters and apply.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.timestamp}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">
                      {r.userId || 'System'}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs">
                      {r.actionName}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">
                      {r.entityType || '-'}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">
                      {r.entityId || '-'}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs">
                      <UserActivityDetailsCell raw={r.detailsJson} />
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">
                      {r.status}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
