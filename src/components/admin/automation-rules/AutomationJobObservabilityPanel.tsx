import { memo } from 'react';
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
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Background Job Health</span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <p style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
              Scheduled workflow jobs (retention, observability, automation,
              cost rollups, safety signals). Data comes from execution logs and
              reliability scores.
            </p>
            {!jobHealth ? (
              <span style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
                Loading…
              </span>
            ) : jobHealth.jobs.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
                No registered jobs yet.
              </span>
            ) : (
              <div className="im-table-scroll">
                <table className="im-table">
                  <thead>
                    <tr>
                      <th className="im-th">Job</th>
                      <th className="im-th">Last status</th>
                      <th className="im-th" style={{ textAlign: 'right' }}>
                        Failures (7d)
                      </th>
                      <th className="im-th" style={{ textAlign: 'right' }}>
                        Avg ms (7d)
                      </th>
                      <th className="im-th" style={{ textAlign: 'right' }}>
                        Retry rows
                      </th>
                      <th className="im-th" style={{ textAlign: 'right' }}>
                        Reliability
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobHealth.jobs.map(j => (
                      <tr className="im-tr" key={j.jobId}>
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'var(--font-im-mono)',
                            fontSize: 11,
                          }}
                        >
                          {j.jobId}
                        </td>
                        <td className="im-td" style={{ fontSize: 12 }}>
                          {j.lastExecution ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                flexDirection: 'column',
                                gap: 2,
                              }}
                            >
                              <span>{j.lastExecution.status}</span>
                              {j.lastExecution.completedAt && (
                                <span
                                  style={{
                                    color: 'var(--color-im-muted)',
                                    fontSize: 11,
                                  }}
                                >
                                  {j.lastExecution.completedAt}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-im-muted)' }}>
                              —
                            </span>
                          )}
                        </td>
                        <td
                          className="im-td"
                          style={{ textAlign: 'right', fontSize: 12 }}
                        >
                          {j.failures7d}
                        </td>
                        <td
                          className="im-td"
                          style={{ textAlign: 'right', fontSize: 12 }}
                        >
                          {Math.round(j.avgExecutionMs7d)}
                        </td>
                        <td
                          className="im-td"
                          style={{ textAlign: 'right', fontSize: 12 }}
                        >
                          {j.retryRows}
                        </td>
                        <td
                          className="im-td"
                          style={{ textAlign: 'right', fontSize: 12 }}
                        >
                          {j.reliability != null
                            ? j.reliability.score.toFixed(2)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="im-section">
          <div
            className="im-section__header"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span className="im-section__label">
              // Missed Schedule and Recovery
            </span>
            {mutateOk && (
              <button
                type="button"
                className="im-btn im-btn--sm"
                onClick={() => void onScanMissedRuns()}
                disabled={loading}
              >
                Scan for missed runs
              </button>
            )}
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <p style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
              Tracks jobs that passed their expected interval without a
              successful run, auto-recovery after the daily pipeline, and
              recovery scores. Use Recover for a pending alert when you need an
              immediate retry.
            </p>
            {!missedSchedule ? (
              <span style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
                Loading…
              </span>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4,1fr)',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--color-im-muted)',
                  }}
                >
                  <div>
                    Pending missed:{' '}
                    <span
                      style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                    >
                      {missedSchedule.pendingMissed}
                    </span>
                  </div>
                  <div>
                    Recovered (7d):{' '}
                    <span
                      style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                    >
                      {missedSchedule.recovered7d}
                    </span>
                  </div>
                  <div>
                    Missed exec rows (7d):{' '}
                    <span
                      style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                    >
                      {missedSchedule.missedExecutions7d}
                    </span>
                  </div>
                  <div>
                    Recovery success (30d):{' '}
                    <span
                      style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                    >
                      {(missedSchedule.recoverySuccessRate30d * 100).toFixed(0)}
                      %
                    </span>
                  </div>
                </div>
                {missedSchedule.todayMetrics && (
                  <div
                    style={{
                      borderTop: '1px solid var(--color-im-rule)',
                      paddingTop: 12,
                      fontSize: 11,
                      color: 'var(--color-im-muted)',
                    }}
                  >
                    Today: missed {missedSchedule.todayMetrics.missedRuns},
                    recovery ok {missedSchedule.todayMetrics.recoverySuccess},
                    failures {missedSchedule.todayMetrics.recoveryFailures},
                    drift warnings {missedSchedule.todayMetrics.driftWarnings}
                  </div>
                )}
                {missedSchedule.recoveryScores.length > 0 && (
                  <div
                    style={{
                      borderTop: '1px solid var(--color-im-rule)',
                      paddingTop: 12,
                      fontSize: 11,
                      color: 'var(--color-im-muted)',
                    }}
                  >
                    Recovery scores (30d):{' '}
                    {missedSchedule.recoveryScores
                      .map(
                        r =>
                          `${r.jobId}=${(r.score * 100).toFixed(0)}% (missed ${r.missedJobs}, recovered ${r.recoveredJobs})`
                      )
                      .join(' · ')}
                  </div>
                )}
                <div className="im-table-scroll">
                  <table className="im-table">
                    <thead>
                      <tr>
                        <th className="im-th">Job</th>
                        <th className="im-th">Expected</th>
                        <th className="im-th">Detected</th>
                        <th className="im-th">Status</th>
                        {mutateOk && (
                          <th
                            className="im-th"
                            style={{ textAlign: 'right' }}
                          />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {missedSchedule.recentMissedAlerts.length === 0 ? (
                        <tr className="im-tr">
                          <td
                            colSpan={mutateOk ? 5 : 4}
                            className="im-td"
                            style={{
                              color: 'var(--color-im-muted)',
                              fontSize: 12,
                            }}
                          >
                            No recent missed alerts.
                          </td>
                        </tr>
                      ) : (
                        missedSchedule.recentMissedAlerts.map(row => (
                          <tr className="im-tr" key={row.alertId}>
                            <td
                              className="im-td"
                              style={{
                                fontFamily: 'var(--font-im-mono)',
                                fontSize: 11,
                              }}
                            >
                              {row.jobId}
                            </td>
                            <td className="im-td" style={{ fontSize: 11 }}>
                              {row.expectedTime}
                            </td>
                            <td className="im-td" style={{ fontSize: 11 }}>
                              {row.detectedTime}
                            </td>
                            <td className="im-td" style={{ fontSize: 11 }}>
                              {row.status}
                            </td>
                            {mutateOk && (
                              <td
                                className="im-td"
                                style={{ textAlign: 'right' }}
                              >
                                {row.status === 'PENDING' ? (
                                  <button
                                    type="button"
                                    className="im-btn im-btn--sm"
                                    onClick={() =>
                                      void onRecoverMissedJob(
                                        row.jobId,
                                        row.alertId
                                      )
                                    }
                                    disabled={loading}
                                  >
                                    Recover missed job
                                  </button>
                                ) : null}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    );
  }
);
