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
import { useUser } from '@/lib/user-context';

export default function AdminActivityLogPage() {
  const { user } = useUser();
  const isAdmin = user?.role?.toLowerCase().includes('admin') ?? false;

  const [userId, setUserId] = useState('');
  const [actionType, setActionType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(500);
  const [rows, setRows] = useState<DashboardActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await queryDashboardActivityLog({
        userId: userId.trim() || undefined,
        actionType: actionType.trim() || undefined,
        dateFrom: dateFrom.trim() || undefined,
        dateTo: dateTo.trim() || undefined,
        search: search.trim() || undefined,
        limit,
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, actionType, dateFrom, dateTo, search, limit]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    // Intentionally mount-only; filters refresh via "Apply filters".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dashboard activity log
        </h1>
        <p className="text-muted-foreground text-sm">
          Audit trail from{' '}
          <code className="text-xs">dashboard_activity_log</code>— filter by
          user, action, date range, or free-text search.
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
            <Label htmlFor="al-limit">Row limit</Label>
            <Input
              id="al-limit"
              type="number"
              min={1}
              max={2000}
              value={limit}
              onChange={e => setLimit(Number(e.target.value) || 500)}
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
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-3">
            <Button
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Apply filters'}
            </Button>
            <Badge variant="secondary">{rows.length} row(s)</Badge>
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
