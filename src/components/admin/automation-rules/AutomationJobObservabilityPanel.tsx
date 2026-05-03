import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  BackgroundJobHealthDashboard,
  MissedScheduleDashboard,
} from '@/lib/automation-console';

export interface AutomationJobObservabilityPanelProps {
  jobHealth: BackgroundJobHealthDashboard | null;
  missedSchedule: MissedScheduleDashboard | null;
  loading: boolean;
  mutateOk: boolean;
  onScanMissedRuns: () => void | Promise<void>;
  onRecoverMissedJob: (jobId: string, alertId: string) => void | Promise<void>;
}

export const AutomationJobObservabilityPanel = memo(
  function AutomationJobObservabilityPanel({
    jobHealth,
    missedSchedule,
    loading,
    mutateOk,
    onScanMissedRuns,
    onRecoverMissedJob,
  }: AutomationJobObservabilityPanelProps) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Background job health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Scheduled workflow jobs (retention, observability, automation,
              cost rollups, safety signals). Data comes from execution logs and
              reliability scores.
            </p>
            {!jobHealth ? (
              <span className="text-muted-foreground text-sm">Loading…</span>
            ) : jobHealth.jobs.length === 0 ? (
              <span className="text-muted-foreground text-sm">
                No registered jobs yet.
              </span>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Last status</TableHead>
                      <TableHead className="text-right">
                        Failures (7d)
                      </TableHead>
                      <TableHead className="text-right">Avg ms (7d)</TableHead>
                      <TableHead className="text-right">Retry rows</TableHead>
                      <TableHead className="text-right">Reliability</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobHealth.jobs.map(j => (
                      <TableRow key={j.jobId}>
                        <TableCell className="font-mono text-xs">
                          {j.jobId}
                        </TableCell>
                        <TableCell className="text-sm">
                          {j.lastExecution ? (
                            <span className="inline-flex flex-col gap-0.5">
                              <span>{j.lastExecution.status}</span>
                              {j.lastExecution.completedAt && (
                                <span className="text-muted-foreground text-xs">
                                  {j.lastExecution.completedAt}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {j.failures7d}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {Math.round(j.avgExecutionMs7d)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {j.retryRows}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {j.reliability != null
                            ? j.reliability.score.toFixed(2)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              Missed schedule and recovery
            </CardTitle>
            {mutateOk && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void onScanMissedRuns()}
                disabled={loading}
              >
                Scan for missed runs
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Tracks jobs that passed their expected interval without a
              successful run, auto-recovery after the daily pipeline, and
              recovery scores. Use Recover for a pending alert when you need an
              immediate retry.
            </p>
            {!missedSchedule ? (
              <span className="text-muted-foreground text-sm">Loading…</span>
            ) : (
              <>
                <div className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    Pending missed:{' '}
                    <span className="text-foreground font-medium">
                      {missedSchedule.pendingMissed}
                    </span>
                  </div>
                  <div>
                    Recovered (7d):{' '}
                    <span className="text-foreground font-medium">
                      {missedSchedule.recovered7d}
                    </span>
                  </div>
                  <div>
                    Missed exec rows (7d):{' '}
                    <span className="text-foreground font-medium">
                      {missedSchedule.missedExecutions7d}
                    </span>
                  </div>
                  <div>
                    Recovery success (30d):{' '}
                    <span className="text-foreground font-medium">
                      {(missedSchedule.recoverySuccessRate30d * 100).toFixed(0)}
                      %
                    </span>
                  </div>
                </div>
                {missedSchedule.todayMetrics && (
                  <div className="text-muted-foreground border-t pt-3 text-xs">
                    Today: missed {missedSchedule.todayMetrics.missedRuns},
                    recovery ok {missedSchedule.todayMetrics.recoverySuccess},
                    failures {missedSchedule.todayMetrics.recoveryFailures},
                    drift warnings {missedSchedule.todayMetrics.driftWarnings}
                  </div>
                )}
                {missedSchedule.recoveryScores.length > 0 && (
                  <div className="text-muted-foreground border-t pt-3 text-xs">
                    Recovery scores (30d):{' '}
                    {missedSchedule.recoveryScores
                      .map(
                        r =>
                          `${r.jobId}=${(r.score * 100).toFixed(0)}% (missed ${r.missedJobs}, recovered ${r.recoveredJobs})`
                      )
                      .join(' · ')}
                  </div>
                )}
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Detected</TableHead>
                        <TableHead>Status</TableHead>
                        {mutateOk && <TableHead className="text-right" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missedSchedule.recentMissedAlerts.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={mutateOk ? 5 : 4}
                            className="text-muted-foreground text-sm"
                          >
                            No recent missed alerts.
                          </TableCell>
                        </TableRow>
                      ) : (
                        missedSchedule.recentMissedAlerts.map(row => (
                          <TableRow key={row.alertId}>
                            <TableCell className="font-mono text-xs">
                              {row.jobId}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.expectedTime}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.detectedTime}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.status}
                            </TableCell>
                            {mutateOk && (
                              <TableCell className="text-right">
                                {row.status === 'PENDING' ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      void onRecoverMissedJob(
                                        row.jobId,
                                        row.alertId
                                      )
                                    }
                                    disabled={loading}
                                  >
                                    Recover missed job
                                  </Button>
                                ) : null}
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </>
    );
  }
);
