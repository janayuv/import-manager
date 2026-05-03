import { memo, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  exportWorkflowJobRecoveryLogCsv,
  recoveryGuardOverrideReenable,
  resetJobScheduleAnchor,
  retryFailedJobExecution,
  retryLatestFailedJob,
  setWorkflowBackgroundJobEnabled,
  simulateBackgroundJobs,
  updateJobScheduleExpectations,
  type JobExecutionTimeline,
  type JobFailureInsights,
  type ManualOverrideLogRow,
  type WorkflowBackgroundJobRow,
  type WorkflowJobDependenciesTree,
  type WorkflowJobExecutionLogRow,
} from '@/lib/automation-console';

export interface AutomationGovernancePanelProps {
  callerRole: string;
  mutateOk: boolean;
  isAdminRole: boolean;
  loading: boolean;
  loadCore: () => void | Promise<void>;
  govRegistry: WorkflowBackgroundJobRow[];
  govPanelJobId: string;
  setGovPanelJobId: Dispatch<SetStateAction<string>>;
  govRetryExecId: string;
  setGovRetryExecId: Dispatch<SetStateAction<string>>;
  govOverrideReason: string;
  setGovOverrideReason: Dispatch<SetStateAction<string>>;
  govTuneGrace: string;
  setGovTuneGrace: Dispatch<SetStateAction<string>>;
  govTuneDelay: string;
  setGovTuneDelay: Dispatch<SetStateAction<string>>;
  govTuneMax: string;
  setGovTuneMax: Dispatch<SetStateAction<string>>;
  govOverrideLog: ManualOverrideLogRow[];
  govDependencies: WorkflowJobDependenciesTree | null;
  govFailureInsights: JobFailureInsights | null;
  govTimeline: JobExecutionTimeline | null;
  govExecLog: WorkflowJobExecutionLogRow[];
}

export const AutomationGovernancePanel = memo(
  function AutomationGovernancePanel({
    callerRole,
    mutateOk,
    isAdminRole,
    loading,
    loadCore,
    govRegistry,
    govPanelJobId,
    setGovPanelJobId,
    govRetryExecId,
    setGovRetryExecId,
    govOverrideReason,
    setGovOverrideReason,
    govTuneGrace,
    setGovTuneGrace,
    govTuneDelay,
    setGovTuneDelay,
    govTuneMax,
    setGovTuneMax,
    govOverrideLog,
    govDependencies,
    govFailureInsights,
    govTimeline,
    govExecLog,
  }: AutomationGovernancePanelProps) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job operations control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <p className="text-muted-foreground text-sm">
            Enable or disable registry jobs, retry failures, reset schedule
            anchors, tune recovery timing, inspect execution history, and export
            recovery audits. Recovery guard override is admin-only.
          </p>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Registry</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    {mutateOk && (
                      <TableHead className="text-right">Enabled</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {govRegistry.map(j => (
                    <TableRow key={j.jobId}>
                      <TableCell className="font-mono text-xs">
                        {j.jobId}
                      </TableCell>
                      <TableCell className="text-sm">{j.jobName}</TableCell>
                      <TableCell>
                        {j.isEnabled ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">
                            ACTIVE
                          </Badge>
                        ) : (
                          <Badge variant="secondary">DISABLED</Badge>
                        )}
                      </TableCell>
                      {mutateOk && (
                        <TableCell className="text-right">
                          <Switch
                            checked={j.isEnabled !== 0}
                            onCheckedChange={v => {
                              void (async () => {
                                try {
                                  await setWorkflowBackgroundJobEnabled(
                                    j.jobId,
                                    v,
                                    callerRole
                                  );
                                  toast.success(
                                    v ? 'Job enabled' : 'Job disabled'
                                  );
                                  await loadCore();
                                } catch (e) {
                                  toast.error(String(e));
                                }
                              })();
                            }}
                            disabled={loading}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3 border-t pt-6">
            <h3 className="text-sm font-medium">Manual retry</h3>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label className="text-xs">Execution ID</Label>
                <Input
                  value={govRetryExecId}
                  onChange={e => setGovRetryExecId(e.target.value)}
                  placeholder="uuid…"
                  disabled={!mutateOk}
                />
              </div>
              {mutateOk && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loading || !govRetryExecId.trim()}
                  onClick={() => {
                    void (async () => {
                      try {
                        const id = await retryFailedJobExecution(
                          govRetryExecId.trim(),
                          callerRole
                        );
                        toast.success(`Retry started: ${id}`);
                        setGovRetryExecId('');
                        await loadCore();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    })();
                  }}
                >
                  Retry job
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] space-y-1">
                <Label className="text-xs">Job (latest failed)</Label>
                <Select
                  value={govPanelJobId}
                  onValueChange={setGovPanelJobId}
                  disabled={!mutateOk}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {govRegistry.map(j => (
                      <SelectItem key={j.jobId} value={j.jobId}>
                        {j.jobId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mutateOk && (
                <Button
                  type="button"
                  size="sm"
                  disabled={loading}
                  onClick={() => {
                    void (async () => {
                      try {
                        const id = await retryLatestFailedJob(
                          govPanelJobId.trim(),
                          callerRole
                        );
                        toast.success(`Retry started: ${id}`);
                        await loadCore();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    })();
                  }}
                >
                  Retry latest failed
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t pt-6">
            <h3 className="text-sm font-medium">
              Schedule anchor and recovery tuning
            </h3>
            <div className="flex flex-wrap gap-2">
              {mutateOk && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => {
                    void (async () => {
                      try {
                        await resetJobScheduleAnchor(
                          govPanelJobId.trim(),
                          callerRole
                        );
                        toast.success(
                          'Schedule anchor reset; pending missed cleared'
                        );
                        await loadCore();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    })();
                  }}
                >
                  Reset schedule anchor
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Grace (minutes)</Label>
                <Input
                  value={govTuneGrace}
                  onChange={e => setGovTuneGrace(e.target.value)}
                  disabled={!mutateOk}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Recovery delay (sec)</Label>
                <Input
                  value={govTuneDelay}
                  onChange={e => setGovTuneDelay(e.target.value)}
                  disabled={!mutateOk}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max recovery attempts</Label>
                <Input
                  value={govTuneMax}
                  onChange={e => setGovTuneMax(e.target.value)}
                  disabled={!mutateOk}
                  inputMode="numeric"
                />
              </div>
            </div>
            {mutateOk && (
              <Button
                type="button"
                size="sm"
                disabled={loading}
                onClick={() => {
                  void (async () => {
                    try {
                      await updateJobScheduleExpectations(
                        govPanelJobId.trim(),
                        callerRole,
                        {
                          gracePeriodMinutes: govTuneGrace.trim()
                            ? Number(govTuneGrace)
                            : null,
                          recoveryDelaySec: govTuneDelay.trim()
                            ? Number(govTuneDelay)
                            : null,
                          maxRecoveryAttempts: govTuneMax.trim()
                            ? Number(govTuneMax)
                            : null,
                        }
                      );
                      toast.success('Schedule expectations updated');
                      await loadCore();
                    } catch (e) {
                      toast.error(String(e));
                    }
                  })();
                }}
              >
                Save recovery tuning
              </Button>
            )}
          </div>

          {isAdminRole && (
            <div className="space-y-2 border-t pt-6">
              <h3 className="text-sm font-medium">
                Recovery guard override (admin)
              </h3>
              <p className="text-muted-foreground text-xs">
                Re-enables a job disabled by the recovery guard. Logged as
                manual_override_event.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="max-w-md"
                  value={govOverrideReason}
                  onChange={e => setGovOverrideReason(e.target.value)}
                  placeholder="Reason for override (required)"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={loading || !govOverrideReason.trim()}
                  onClick={() => {
                    void (async () => {
                      try {
                        await recoveryGuardOverrideReenable(
                          govPanelJobId.trim(),
                          govOverrideReason.trim(),
                          callerRole
                        );
                        toast.success('Job re-enabled (override logged)');
                        setGovOverrideReason('');
                        await loadCore();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    })();
                  }}
                >
                  Override and re-enable job
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2 border-t pt-6">
            <h3 className="text-sm font-medium">Manual override log</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {govOverrideLog.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground text-sm"
                      >
                        No manual overrides yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    govOverrideLog.map(o => (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs">{o.createdAt}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {o.jobId}
                        </TableCell>
                        <TableCell className="text-xs">{o.action}</TableCell>
                        <TableCell className="text-xs">
                          {o.callerRole}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-2 border-t pt-6">
            <h3 className="text-sm font-medium">Job dependencies</h3>
            {govDependencies ? (
              <ul className="text-muted-foreground list-inside list-disc text-sm">
                {govDependencies.edges.map((e, i) => (
                  <li key={`${e.parentJobId}-${e.dependentJobId}-${i}`}>
                    <span className="font-mono">{e.parentJobId}</span> →{' '}
                    <span className="font-mono">{e.dependentJobId}</span>{' '}
                    <span className="text-xs">({e.dependencyType})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
            {govDependencies && (
              <p className="text-muted-foreground text-xs">
                Suggested daily order:{' '}
                {govDependencies.suggestedDailyOrder.join(' → ')}
              </p>
            )}
          </div>

          <div className="space-y-2 border-t pt-6">
            <h3 className="text-sm font-medium">
              Failure root-cause hints (7d)
            </h3>
            {govFailureInsights ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Errors</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {govFailureInsights.failureClusters7d
                        .slice(0, 20)
                        .map((c, i) => (
                          <TableRow key={`${c.jobId}-${i}`}>
                            <TableCell className="font-mono text-xs">
                              {c.jobId}
                            </TableCell>
                            <TableCell
                              className="max-w-[240px] truncate text-xs"
                              title={c.errorMessage}
                            >
                              {c.errorMessage || '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {c.count}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {govFailureInsights.countsByStatus7d
                        .slice(0, 30)
                        .map((c, i) => (
                          <TableRow key={`${c.jobId}-${c.status}-${i}`}>
                            <TableCell className="font-mono text-xs">
                              {c.jobId}
                            </TableCell>
                            <TableCell className="text-xs">
                              {c.status}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {c.count}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">Loading…</span>
            )}
            <p className="text-muted-foreground text-xs">
              {govFailureInsights?.notes}
            </p>
          </div>

          <div className="space-y-3 border-t pt-6">
            <h3 className="text-sm font-medium">
              Execution history and timeline ({govPanelJobId})
            </h3>
            {govTimeline && govTimeline.events.length > 0 ? (
              <div className="bg-muted/30 flex h-8 w-full items-end gap-px overflow-x-auto rounded border p-1">
                {govTimeline.events.map(ev => {
                  const w = Math.max(
                    2,
                    Math.min(24, (ev.executionTimeMs ?? 4000) / 2000)
                  );
                  const st = ev.status.toUpperCase();
                  const bg =
                    st === 'SUCCESS'
                      ? 'bg-emerald-500'
                      : st === 'FAILED'
                        ? 'bg-red-500'
                        : st === 'TIMEOUT'
                          ? 'bg-amber-500'
                          : st === 'MISSED'
                            ? 'bg-violet-500'
                            : st === 'RETRY'
                              ? 'bg-sky-500'
                              : 'bg-muted-foreground';
                  return (
                    <div
                      key={ev.executionId}
                      className={`${bg} shrink-0 rounded-sm opacity-90`}
                      style={{ width: `${w}px`, minHeight: '22px' }}
                      title={`${ev.status} @ ${ev.startedAt}`}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                No events in window.
              </p>
            )}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Execution</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Ms</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Retry</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {govExecLog.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-muted-foreground text-sm"
                      >
                        No rows (pick a job above).
                      </TableCell>
                    </TableRow>
                  ) : (
                    govExecLog.map(r => (
                      <TableRow key={r.executionId}>
                        <TableCell className="font-mono text-[10px]">
                          {r.executionId.slice(0, 8)}…
                        </TableCell>
                        <TableCell className="text-xs">{r.status}</TableCell>
                        <TableCell className="text-xs">{r.startedAt}</TableCell>
                        <TableCell className="text-xs">
                          {r.executionTimeMs ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.recordsProcessed}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.retryCount}
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate text-xs"
                          title={r.errorMessage ?? ''}
                        >
                          {r.errorMessage ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-6">
            {mutateOk && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => {
                  void (async () => {
                    try {
                      await simulateBackgroundJobs(callerRole);
                      toast.success('Simulation complete (read-only)');
                    } catch (e) {
                      toast.error(String(e));
                    }
                  })();
                }}
              >
                Simulate recovery (read-only)
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={loading}
              onClick={() => {
                void (async () => {
                  try {
                    const csv =
                      await exportWorkflowJobRecoveryLogCsv(callerRole);
                    const blob = new Blob([csv], {
                      type: 'text/csv;charset=utf-8',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `workflow_job_recovery_log_${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success('Recovery log exported');
                  } catch (e) {
                    toast.error(String(e));
                  }
                })();
              }}
            >
              Export recovery log CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
);
