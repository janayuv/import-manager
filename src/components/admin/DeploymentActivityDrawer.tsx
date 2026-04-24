import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Undo2,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  listRuleDeploymentImpactMetrics,
  listWorkflowEnvironmentDeploymentLog,
  listWorkflowRuleApprovals,
  validateRuleDeployment,
  type RuleDeploymentImpactRow,
  type WorkflowDecisionRuleRow,
  type WorkflowEnvironmentDeploymentLogRow,
  type WorkflowEnvironmentRow,
  type WorkflowRuleApprovalRow,
  type WorkflowTenantRow,
} from '@/lib/automation-console';
import { cn } from '@/lib/utils';

const Q = {
  open: 'deployActivity',
  tenant: 'deployLogTenant',
  env: 'deployLogEnvironment',
  rule: 'deployLogRule',
  from: 'deployLogFrom',
  to: 'deployLogTo',
  status: 'deployLogStatus',
} as const;

const FAIL_RED_THRESHOLD = 4;
const ROLLBACK_AMBER_THRESHOLD = 3;

type SortKey =
  | 'deploymentId'
  | 'environmentId'
  | 'tenantId'
  | 'ruleId'
  | 'versionId'
  | 'status'
  | 'timestamp'
  | 'rollbackFlag';

function parseDetailsJson(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function rollbackFlagForRow(row: WorkflowEnvironmentDeploymentLogRow): boolean {
  const st = row.status.trim().toUpperCase();
  if (st === 'ROLLBACK') return true;
  const d = parseDetailsJson(row.detailsJson);
  if (!d) return false;
  if (d.rollbackFlag === true) return true;
  if (String(d.type ?? '').toUpperCase() === 'ROLLBACK') return true;
  return false;
}

function parseRowTime(ts: string): number {
  const t = ts.trim();
  const isoTry = t.includes('T')
    ? Date.parse(t)
    : Date.parse(t.replace(' ', 'T'));
  if (!Number.isNaN(isoTry)) return isoTry;
  return Date.parse(t);
}

function isFailureStatus(status: string): boolean {
  const s = status.trim().toUpperCase();
  return s === 'REJECTED_VALIDATION' || s.includes('FAIL');
}

function isSuccessStatus(status: string): boolean {
  return status.trim().toUpperCase() === 'SUCCESS';
}

function statusBadge(status: string) {
  const s = status.trim().toUpperCase();
  if (s === 'SUCCESS') {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        SUCCESS
      </Badge>
    );
  }
  if (s === 'ROLLBACK') {
    return (
      <Badge className="bg-amber-600 text-white hover:bg-amber-600">
        ROLLED_BACK
      </Badge>
    );
  }
  if (s === 'REJECTED_VALIDATION' || s.includes('FAIL')) {
    return <Badge variant="destructive">FAILED</Badge>;
  }
  if (s === 'PENDING' || s === '') {
    return <Badge variant="secondary">PENDING</Badge>;
  }
  if (s === 'PROMOTED') {
    return <Badge variant="outline">PROMOTED</Badge>;
  }
  return <Badge variant="secondary">{status || 'UNKNOWN'}</Badge>;
}

function deploymentHealthTone(params: {
  failuresToday: number;
  rollbacksToday: number;
}): 'red' | 'amber' | 'green' {
  if (params.failuresToday > FAIL_RED_THRESHOLD) return 'red';
  if (params.rollbacksToday > ROLLBACK_AMBER_THRESHOLD) return 'amber';
  return 'green';
}

function csvEscape(cell: string): string {
  const s = cell.replace(/"/g, '""');
  return `"${s}"`;
}

type DeploymentActivityDrawerProps = {
  callerRole: string;
  rules: WorkflowDecisionRuleRow[];
  environments: WorkflowEnvironmentRow[];
  tenants: WorkflowTenantRow[];
};

export function DeploymentActivityDrawer({
  callerRole,
  rules,
  environments,
  tenants,
}: DeploymentActivityDrawerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const open = searchParams.get(Q.open) === '1';

  const tenantFilter = searchParams.get(Q.tenant) ?? '';
  const environmentFilter = searchParams.get(Q.env) ?? '';
  const ruleFilter = searchParams.get(Q.rule) ?? '';
  const dateFrom = searchParams.get(Q.from) ?? '';
  const dateTo = searchParams.get(Q.to) ?? '';
  const statusFilter = searchParams.get(Q.status) ?? 'ALL';

  const patchQuery = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      setSearchParams(
        prev => {
          const n = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v === null || v === undefined || v === '') {
              n.delete(k);
            } else {
              n.set(k, v);
            }
          }
          return n;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [rawRows, setRawRows] = useState<WorkflowEnvironmentDeploymentLogRow[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] =
    useState<WorkflowEnvironmentDeploymentLogRow | null>(null);
  const [detailApprovals, setDetailApprovals] = useState<
    WorkflowRuleApprovalRow[]
  >([]);
  const [detailImpact, setDetailImpact] = useState<RuleDeploymentImpactRow[]>(
    []
  );
  const [detailValidation, setDetailValidation] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadLog = useCallback(async () => {
    setLoading(true);
    try {
      const tid = tenantFilter.trim() || null;
      const eid = environmentFilter.trim() || null;
      const rows = await listWorkflowEnvironmentDeploymentLog(
        callerRole,
        eid,
        tid,
        500
      );
      setRawRows(rows);
    } catch (e) {
      toast.error(String(e));
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  }, [callerRole, tenantFilter, environmentFilter]);

  useEffect(() => {
    if (!open) return;
    void loadLog();
  }, [open, loadLog]);

  const filteredRows = useMemo(() => {
    return rawRows.filter(row => {
      if (ruleFilter.trim() && row.ruleId !== ruleFilter.trim()) return false;
      if (statusFilter !== 'ALL') {
        const want = statusFilter.trim().toUpperCase();
        const got = row.status.trim().toUpperCase();
        if (want === 'ROLLED_BACK') {
          if (!rollbackFlagForRow(row)) return false;
        } else if (got !== want) {
          return false;
        }
      }
      const t = parseRowTime(row.timestamp);
      if (Number.isNaN(t)) return true;
      if (dateFrom.trim()) {
        const fromT = parseRowTime(`${dateFrom.trim()}T00:00:00`);
        if (!Number.isNaN(fromT) && t < fromT) return false;
      }
      if (dateTo.trim()) {
        const toT = parseRowTime(`${dateTo.trim()}T23:59:59`);
        if (!Number.isNaN(toT) && t > toT) return false;
      }
      return true;
    });
  }, [rawRows, ruleFilter, statusFilter, dateFrom, dateTo]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const rb = (r: WorkflowEnvironmentDeploymentLogRow) =>
      rollbackFlagForRow(r) ? 1 : 0;
    return [...filteredRows].sort((a, b) => {
      let cmp: number;
      switch (sortKey) {
        case 'rollbackFlag':
          cmp = rb(a) - rb(b);
          break;
        case 'timestamp':
          cmp = parseRowTime(a.timestamp) - parseRowTime(b.timestamp);
          break;
        default: {
          const av = String(
            a[sortKey as keyof WorkflowEnvironmentDeploymentLogRow] ?? ''
          );
          const bv = String(
            b[sortKey as keyof WorkflowEnvironmentDeploymentLogRow] ?? ''
          );
          cmp = av.localeCompare(bv);
        }
      }
      if (cmp !== 0) return cmp * dir;
      return parseRowTime(a.timestamp) - parseRowTime(b.timestamp);
    });
  }, [filteredRows, sortKey, sortDir]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const summary = useMemo(() => {
    let deploymentsToday = 0;
    let successToday = 0;
    let failedToday = 0;
    let rollbacksToday = 0;
    for (const row of filteredRows) {
      const d = row.timestamp.slice(0, 10);
      if (d !== todayStr) continue;
      deploymentsToday += 1;
      if (isSuccessStatus(row.status)) successToday += 1;
      if (isFailureStatus(row.status)) failedToday += 1;
      if (rollbackFlagForRow(row)) rollbacksToday += 1;
    }
    return { deploymentsToday, successToday, failedToday, rollbacksToday };
  }, [filteredRows, todayStr]);

  const healthTone = useMemo(
    () =>
      deploymentHealthTone({
        failuresToday: summary.failedToday,
        rollbacksToday: summary.rollbacksToday,
      }),
    [summary.failedToday, summary.rollbacksToday]
  );

  const timelineRows = useMemo(() => {
    const sorted = [...filteredRows].sort(
      (a, b) => parseRowTime(b.timestamp) - parseRowTime(a.timestamp)
    );
    return sorted.slice(0, 10);
  }, [filteredRows]);

  const insights = useMemo(() => {
    const total = filteredRows.length;
    const successes = filteredRows.filter(r =>
      isSuccessStatus(r.status)
    ).length;
    const rollbacks = filteredRows.filter(r => rollbackFlagForRow(r)).length;
    const failures = filteredRows.filter(r => isFailureStatus(r.status)).length;
    const successRate = total > 0 ? successes / total : 0;
    const rollbackFreq = total > 0 ? rollbacks / total : 0;

    const now = new Date();
    const last7 = subDays(now, 7);
    const prev7 = subDays(now, 14);
    let failLast7 = 0;
    let failPrev7 = 0;
    for (const r of filteredRows) {
      const t = parseRowTime(r.timestamp);
      if (Number.isNaN(t)) continue;
      if (!isFailureStatus(r.status)) continue;
      if (t >= last7.getTime()) failLast7 += 1;
      else if (t >= prev7.getTime() && t < last7.getTime()) failPrev7 += 1;
    }
    const trend =
      failPrev7 === 0
        ? failLast7 > 0
          ? 'up'
          : 'flat'
        : failLast7 > failPrev7
          ? 'up'
          : failLast7 < failPrev7
            ? 'down'
            : 'flat';

    const byKey = new Map<string, number[]>();
    for (const r of filteredRows) {
      if (!isSuccessStatus(r.status)) continue;
      const k = `${r.ruleId}|${r.environmentId}`;
      const t = parseRowTime(r.timestamp);
      if (Number.isNaN(t)) continue;
      const arr = byKey.get(k) ?? [];
      arr.push(t);
      byKey.set(k, arr);
    }
    let sumMs = 0;
    let countIntervals = 0;
    for (const arr of byKey.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a - b);
      for (let i = 1; i < arr.length; i++) {
        sumMs += arr[i]! - arr[i - 1]!;
        countIntervals += 1;
      }
    }
    const avgIntervalMin =
      countIntervals > 0 ? sumMs / countIntervals / 60000 : null;

    return {
      total,
      successes,
      rollbacks,
      failures,
      successRate,
      rollbackFreq,
      failLast7,
      failPrev7,
      trend,
      avgIntervalMin,
    };
  }, [filteredRows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'timestamp' ? 'desc' : 'asc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  const exportCsv = () => {
    const headers = [
      'deployment_id',
      'environment_id',
      'tenant_id',
      'rule_id',
      'version_id',
      'deployment_status',
      'timestamp',
      'rollback_flag',
      'details_json',
    ];
    const lines = [headers.join(',')];
    for (const r of sortedRows) {
      const rb = rollbackFlagForRow(r);
      lines.push(
        [
          csvEscape(r.deploymentId),
          csvEscape(r.environmentId),
          csvEscape(r.tenantId),
          csvEscape(r.ruleId),
          csvEscape(r.versionId),
          csvEscape(r.status),
          csvEscape(r.timestamp),
          csvEscape(rb ? 'true' : 'false'),
          csvEscape(r.detailsJson),
        ].join(',')
      );
    }
    const blob = new Blob([`\ufeff${lines.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `environment-deployment-log-${format(new Date(), 'yyyyMMdd-HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.message('CSV export started');
  };

  const openDetail = async (row: WorkflowEnvironmentDeploymentLogRow) => {
    setSelected(row);
    setDetailLoading(true);
    setDetailApprovals([]);
    setDetailImpact([]);
    setDetailValidation(null);
    try {
      const [appr, impact] = await Promise.all([
        listWorkflowRuleApprovals(callerRole, row.ruleId),
        listRuleDeploymentImpactMetrics(callerRole, row.ruleId, 30),
      ]);
      setDetailApprovals(appr);
      setDetailImpact(impact);
      try {
        const vr = await validateRuleDeployment(
          row.ruleId,
          row.versionId,
          callerRole
        );
        setDetailValidation(vr);
      } catch {
        setDetailValidation(null);
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={next => {
          if (!next) {
            patchQuery({ [Q.open]: null });
          }
        }}
        direction="right"
        shouldScaleBackground={false}
      >
        <DrawerContent className="data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-[min(96vw,1200px)] data-[vaul-drawer-direction=right]:sm:max-w-none">
          <DrawerHeader className="border-b text-left">
            <DrawerTitle>Deployment activity</DrawerTitle>
            <DrawerDescription>
              Read-only environment deployment history, rollbacks, and health
              signals.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  healthTone === 'red' &&
                    'border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40',
                  healthTone === 'amber' &&
                    'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40',
                  healthTone === 'green' &&
                    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40'
                )}
              >
                Environment health:{' '}
                {healthTone === 'red'
                  ? 'Elevated risk'
                  : healthTone === 'amber'
                    ? 'Watch rollbacks'
                    : 'Nominal'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void loadLog()}
              >
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sortedRows.length === 0}
                onClick={exportCsv}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            <div className="bg-muted/40 grid gap-3 rounded-md border p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-muted-foreground">Deployments today</div>
                <div className="text-lg font-semibold tabular-nums">
                  {summary.deploymentsToday}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Successful today</div>
                <div className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {summary.successToday}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Failed today</div>
                <div className="text-lg font-semibold tabular-nums text-red-700 dark:text-red-400">
                  {summary.failedToday}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Rollbacks today</div>
                <div className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {summary.rollbacksToday}
                </div>
              </div>
            </div>

            <div className="bg-muted/30 grid gap-3 rounded-md border p-3 text-xs lg:grid-cols-4">
              <div>
                <div className="text-muted-foreground">
                  Success rate (filtered)
                </div>
                <div className="font-semibold tabular-nums">
                  {(insights.successRate * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Rollback frequency</div>
                <div className="font-semibold tabular-nums">
                  {(insights.rollbackFreq * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  Failure trend (7d vs prior)
                </div>
                <div className="font-semibold">
                  {insights.failLast7} vs {insights.failPrev7}{' '}
                  <span className="text-muted-foreground">
                    ({insights.trend})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  Avg. interval (success, same rule+env)
                </div>
                <div className="font-semibold tabular-nums">
                  {insights.avgIntervalMin != null
                    ? `${insights.avgIntervalMin.toFixed(1)} min`
                    : '—'}
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <p className="mb-1 text-xs font-medium">Recent deployments</p>
                <ul className="text-muted-foreground border-muted max-h-28 space-y-1.5 overflow-auto border-l-2 pl-3 text-[11px]">
                  {timelineRows.length === 0 ? (
                    <li>No events in current filter.</li>
                  ) : (
                    timelineRows.map(r => (
                      <li key={r.deploymentId} className="relative">
                        <span className="text-foreground font-mono">
                          {r.versionId}
                        </span>{' '}
                        <span className="text-foreground/80">
                          {r.environmentId}
                        </span>{' '}
                        · {r.timestamp} · {statusBadge(r.status)}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="space-y-1">
                <Label className="text-xs">Tenant</Label>
                <Select
                  value={tenantFilter || '__all__'}
                  onValueChange={v =>
                    patchQuery({ [Q.tenant]: v === '__all__' ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All tenants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All tenants</SelectItem>
                    {tenants.map(t => (
                      <SelectItem key={t.tenantId} value={t.tenantId}>
                        {t.tenantName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Environment</Label>
                <Select
                  value={environmentFilter || '__all__'}
                  onValueChange={v =>
                    patchQuery({ [Q.env]: v === '__all__' ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All environments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All environments</SelectItem>
                    {environments.map(e => (
                      <SelectItem key={e.environmentId} value={e.environmentId}>
                        {e.environmentName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rule</Label>
                <Select
                  value={ruleFilter || '__all__'}
                  onValueChange={v =>
                    patchQuery({ [Q.rule]: v === '__all__' ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All rules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All rules</SelectItem>
                    {rules.map(r => (
                      <SelectItem key={r.ruleId} value={r.ruleId}>
                        {r.ruleName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e =>
                    patchQuery({ [Q.from]: e.target.value || null })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => patchQuery({ [Q.to]: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={v =>
                    patchQuery({ [Q.status]: v === 'ALL' ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="SUCCESS">SUCCESS</SelectItem>
                    <SelectItem value="ROLLBACK">ROLLBACK</SelectItem>
                    <SelectItem value="REJECTED_VALIDATION">
                      REJECTED_VALIDATION
                    </SelectItem>
                    <SelectItem value="PROMOTED">PROMOTED</SelectItem>
                    <SelectItem value="ROLLED_BACK">
                      Rollback flag (any)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="min-h-[200px] flex-1 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleSort('deploymentId')}
                    >
                      <span className="inline-flex items-center gap-1">
                        deployment_id {sortIcon('deploymentId')}
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleSort('environmentId')}
                    >
                      <span className="inline-flex items-center gap-1">
                        environment_id {sortIcon('environmentId')}
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleSort('tenantId')}
                    >
                      <span className="inline-flex items-center gap-1">
                        tenant_id {sortIcon('tenantId')}
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleSort('ruleId')}
                    >
                      <span className="inline-flex items-center gap-1">
                        rule_id {sortIcon('ruleId')}
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleSort('versionId')}
                    >
                      <span className="inline-flex items-center gap-1">
                        version_id {sortIcon('versionId')}
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleSort('status')}
                    >
                      <span className="inline-flex items-center gap-1">
                        deployment_status {sortIcon('status')}
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleSort('timestamp')}
                    >
                      <span className="inline-flex items-center gap-1">
                        timestamp {sortIcon('timestamp')}
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleSort('rollbackFlag')}
                    >
                      <span className="inline-flex items-center gap-1">
                        rollback_flag {sortIcon('rollbackFlag')}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-muted-foreground text-xs"
                      >
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : sortedRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-muted-foreground text-xs"
                      >
                        No rows. Adjust filters or refresh after deployments.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedRows.map(row => {
                      const rb = rollbackFlagForRow(row);
                      return (
                        <TableRow
                          key={row.deploymentId}
                          className={cn(
                            'cursor-pointer',
                            rb && 'bg-amber-50/80 dark:bg-amber-950/25'
                          )}
                          onClick={() => void openDetail(row)}
                        >
                          <TableCell className="text-xs">
                            {rb ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                <Undo2 className="h-3.5 w-3.5" />
                                <Badge
                                  variant="outline"
                                  className="border-amber-600 text-[10px] text-amber-800"
                                >
                                  Rollback
                                </Badge>
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="max-w-[100px] truncate font-mono text-[10px]">
                            {row.deploymentId}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.environmentId}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.tenantId}
                          </TableCell>
                          <TableCell className="max-w-[120px] truncate text-xs">
                            {row.ruleId}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate font-mono text-[10px]">
                            {row.versionId}
                          </TableCell>
                          <TableCell>{statusBadge(row.status)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {row.timestamp}
                          </TableCell>
                          <TableCell className="text-xs">
                            {rb ? 'true' : 'false'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          <DrawerFooter className="border-t">
            <DrawerClose asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Sheet
        open={selected != null}
        onOpenChange={o => {
          if (!o) setSelected(null);
        }}
      >
        <SheetContent className="z-100 max-w-lg overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Deployment detail</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4 text-sm">
              {rollbackFlagForRow(selected) ? (
                <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Rollback event — review live rule impact for this environment.
                </div>
              ) : null}
              <div className="grid gap-1 text-xs">
                <div>
                  <span className="text-muted-foreground">deployment_id:</span>{' '}
                  <code className="bg-muted rounded px-1">
                    {selected.deploymentId}
                  </code>
                </div>
                <div>
                  <span className="text-muted-foreground">rule / version:</span>{' '}
                  {selected.ruleId} / {selected.versionId}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    environment / tenant:
                  </span>{' '}
                  {selected.environmentId} / {selected.tenantId}
                </div>
                <div>
                  <span className="text-muted-foreground">timestamp:</span>{' '}
                  {selected.timestamp}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">details_json</p>
                <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-[10px]">
                  {JSON.stringify(
                    parseDetailsJson(selected.detailsJson) ??
                      selected.detailsJson,
                    null,
                    2
                  )}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">
                  Validation (read-only, current rules)
                </p>
                {detailLoading ? (
                  <p className="text-muted-foreground text-xs">Loading…</p>
                ) : detailValidation ? (
                  <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-[10px]">
                    {JSON.stringify(detailValidation, null, 2)}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Not available.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">
                  Approvals (rule scope)
                </p>
                {detailLoading ? (
                  <p className="text-muted-foreground text-xs">Loading…</p>
                ) : (
                  <pre className="bg-muted max-h-32 overflow-auto rounded-md p-2 text-[10px]">
                    {JSON.stringify(detailApprovals, null, 2)}
                  </pre>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">
                  Impact metrics (rule scope)
                </p>
                {detailLoading ? (
                  <p className="text-muted-foreground text-xs">Loading…</p>
                ) : (
                  <pre className="bg-muted max-h-32 overflow-auto rounded-md p-2 text-[10px]">
                    {JSON.stringify(detailImpact, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

export function openDeploymentActivitySearchParams(): Record<string, string> {
  return { [Q.open]: '1' };
}
