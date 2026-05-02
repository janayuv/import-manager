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
  queryDashboardActivityLog,
  type DashboardActivityRow,
} from '@/lib/dashboard-activity';
import { useCurrentUserId, useUser } from '@/lib/user-context';

export default function AdminActivityLogPage() {
  const { user } = useUser();
  const isAdmin = user?.role?.toLowerCase().includes('admin') ?? false;

  const [userId, setUserId] = useState('');
  const [actionType, setActionType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [pageIndex, setPageIndex] = useState(0);
  const callerUserId = useCurrentUserId();
  const [rows, setRows] = useState<DashboardActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = useCallback(
    async (pageIdx: number) => {
      setLoading(true);
      setError(null);
      try {
        const uid = callerUserId.trim();
        if (!uid) {
          setRows([]);
          return;
        }
        const data = await queryDashboardActivityLog(
          {
            userId: userId.trim() || undefined,
            actionType: actionType.trim() || undefined,
            dateFrom: dateFrom.trim() || undefined,
            dateTo: dateTo.trim() || undefined,
            search: search.trim() || undefined,
            limit: pageSize,
            offset: pageIdx * pageSize,
          },
          uid
        );
        setRows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [userId, actionType, dateFrom, dateTo, search, pageSize, callerUserId]
  );

  useEffect(() => {
    if (!isAdmin) return;
    void runQuery(pageIndex);
  }, [isAdmin, pageIndex, pageSize, runQuery]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-muted-foreground text-sm">
          Application and ERP-style events from{' '}
          <code className="text-xs">dashboard_activity_log</code> (paginated).
          Security-sensitive auth and operator actions are also listed under{' '}
          <strong>User activity</strong>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="al-user">User ID</Label>
            <Input
              id="al-user"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="Exact match"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="al-action">Action type</Label>
            <Input
              id="al-action"
              value={actionType}
              onChange={e => setActionType(e.target.value)}
              placeholder="e.g. dashboard_viewed"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="al-limit">Page size</Label>
            <Input
              id="al-limit"
              type="number"
              min={1}
              max={2000}
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value) || 100);
                setPageIndex(0);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="al-from">Date from</Label>
            <Input
              id="al-from"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="al-to">Date to</Label>
            <Input
              id="al-to"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label htmlFor="al-search">Search</Label>
            <Input
              id="al-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Matches details, module, record ref, navigation, context"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 lg:col-span-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPageIndex(i => Math.max(0, i - 1))}
              disabled={loading || pageIndex === 0}
            >
              Previous page
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPageIndex(i => i + 1)}
              disabled={loading || rows.length < pageSize}
            >
              Next page
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPageIndex(0);
                void runQuery(0);
              }}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Apply filters'}
            </Button>
            <Badge variant="secondary">
              Page {pageIndex + 1} · {rows.length} row(s)
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
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Record ref</TableHead>
                <TableHead>Navigation</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
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
                      {r.userId}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs">
                      {r.actionType}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">
                      {r.moduleName}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">
                      {r.recordReference}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs">
                      {r.navigationTarget}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">
                      {r.actionContext}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs">
                      {r.details}
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
