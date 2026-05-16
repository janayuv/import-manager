import { memo, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
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
      <div className="im-section">
        <div className="im-section__header">
          <span className="im-section__label">// Job Operations Control</span>
        </div>
        <div
          className="im-section__body"
          style={{ display: 'flex', flexDirection: 'column', gap: 32 }}
        >
          <p style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
            Enable or disable registry jobs, retry failures, reset schedule
            anchors, tune recovery timing, inspect execution history, and export
            recovery audits. Recovery guard override is admin-only.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ fontSize: 12, fontWeight: 500 }}>Registry</h3>
            <div className="im-table-scroll">
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th">Job</th>
                    <th className="im-th">Name</th>
                    <th className="im-th">Status</th>
                    {mutateOk && (
                      <th className="im-th" style={{ textAlign: 'right' }}>
                        Enabled
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {govRegistry.map(j => (
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
                        {j.jobName}
                      </td>
                      <td className="im-td">
                        {j.isEnabled ? (
                          <span className="im-status-pill is-active">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="im-status-pill is-neutral">
                            DISABLED
                          </span>
                        )}
                      </td>
                      {mutateOk && (
                        <td className="im-td" style={{ textAlign: 'right' }}>
                          <input
                            type="checkbox"
                            checked={j.isEnabled !== 0}
                            onChange={e => {
                              const v = e.target.checked;
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
                                } catch (err) {
                                  toast.error(String(err));
                                }
                              })();
                            }}
                            disabled={loading}
                            style={{
                              width: 16,
                              height: 16,
                              accentColor: 'var(--color-im-accent)',
                            }}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 24,
            }}
          >
            <h3 style={{ fontSize: 12, fontWeight: 500 }}>Manual retry</h3>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 8,
              }}
            >
              <div
                style={{
                  minWidth: 200,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Execution ID
                </p>
                <input
                  className="im-input"
                  value={govRetryExecId}
                  onChange={e => setGovRetryExecId(e.target.value)}
                  placeholder="uuid…"
                  disabled={!mutateOk}
                />
              </div>
              {mutateOk && (
                <button
                  type="button"
                  className="im-btn im-btn--sm"
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    })();
                  }}
                >
                  Retry job
                </button>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 8,
              }}
            >
              <div
                style={{
                  minWidth: 220,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Job (latest failed)
                </p>
                <div className="im-select-wrap">
                  <select
                    className="im-select"
                    value={govPanelJobId}
                    onChange={e => setGovPanelJobId(e.target.value)}
                    disabled={!mutateOk}
                  >
                    {govRegistry.map(j => (
                      <option key={j.jobId} value={j.jobId}>
                        {j.jobId}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {mutateOk && (
                <button
                  type="button"
                  className="im-btn im-btn--sm im-btn--primary"
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    })();
                  }}
                >
                  Retry latest failed
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 24,
            }}
          >
            <h3 style={{ fontSize: 12, fontWeight: 500 }}>
              Schedule anchor and recovery tuning
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {mutateOk && (
                <button
                  type="button"
                  className="im-btn im-btn--sm"
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    })();
                  }}
                >
                  Reset schedule anchor
                </button>
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Grace (minutes)
                </p>
                <input
                  className="im-input"
                  value={govTuneGrace}
                  onChange={e => setGovTuneGrace(e.target.value)}
                  disabled={!mutateOk}
                  inputMode="numeric"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Recovery delay (sec)
                </p>
                <input
                  className="im-input"
                  value={govTuneDelay}
                  onChange={e => setGovTuneDelay(e.target.value)}
                  disabled={!mutateOk}
                  inputMode="numeric"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Max recovery attempts
                </p>
                <input
                  className="im-input"
                  value={govTuneMax}
                  onChange={e => setGovTuneMax(e.target.value)}
                  disabled={!mutateOk}
                  inputMode="numeric"
                />
              </div>
            </div>
            {mutateOk && (
              <button
                type="button"
                className="im-btn im-btn--sm im-btn--primary"
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
                    } catch (err) {
                      toast.error(String(err));
                    }
                  })();
                }}
              >
                Save recovery tuning
              </button>
            )}
          </div>

          {isAdminRole && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                borderTop: '1px solid var(--color-im-rule)',
                paddingTop: 24,
              }}
            >
              <h3 style={{ fontSize: 12, fontWeight: 500 }}>
                Recovery guard override (admin)
              </h3>
              <p style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
                Re-enables a job disabled by the recovery guard. Logged as
                manual_override_event.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <input
                  className="im-input"
                  style={{ maxWidth: 448 }}
                  value={govOverrideReason}
                  onChange={e => setGovOverrideReason(e.target.value)}
                  placeholder="Reason for override (required)"
                />
                <button
                  type="button"
                  className="im-btn im-btn--sm im-btn--danger"
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    })();
                  }}
                >
                  Override and re-enable job
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 24,
            }}
          >
            <h3 style={{ fontSize: 12, fontWeight: 500 }}>
              Manual override log
            </h3>
            <div className="im-table-scroll">
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th">Time</th>
                    <th className="im-th">Job</th>
                    <th className="im-th">Action</th>
                    <th className="im-th">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {govOverrideLog.length === 0 ? (
                    <tr className="im-tr">
                      <td
                        colSpan={4}
                        className="im-td"
                        style={{ color: 'var(--color-im-muted)', fontSize: 12 }}
                      >
                        No manual overrides yet.
                      </td>
                    </tr>
                  ) : (
                    govOverrideLog.map(o => (
                      <tr className="im-tr" key={o.id}>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {o.createdAt}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'var(--font-im-mono)',
                            fontSize: 11,
                          }}
                        >
                          {o.jobId}
                        </td>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {o.action}
                        </td>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {o.callerRole}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 24,
            }}
          >
            <h3 style={{ fontSize: 12, fontWeight: 500 }}>Job dependencies</h3>
            {govDependencies ? (
              <ul
                style={{
                  color: 'var(--color-im-muted)',
                  fontSize: 12,
                  listStylePosition: 'inside',
                  listStyleType: 'disc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {govDependencies.edges.map((e, i) => (
                  <li key={`${e.parentJobId}-${e.dependentJobId}-${i}`}>
                    <span style={{ fontFamily: 'var(--font-im-mono)' }}>
                      {e.parentJobId}
                    </span>{' '}
                    →{' '}
                    <span style={{ fontFamily: 'var(--font-im-mono)' }}>
                      {e.dependentJobId}
                    </span>{' '}
                    <span style={{ fontSize: 11 }}>({e.dependencyType})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
                —
              </span>
            )}
            {govDependencies && (
              <p style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
                Suggested daily order:{' '}
                {govDependencies.suggestedDailyOrder.join(' → ')}
              </p>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 24,
            }}
          >
            <h3 style={{ fontSize: 12, fontWeight: 500 }}>
              Failure root-cause hints (7d)
            </h3>
            {govFailureInsights ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2,1fr)',
                  gap: 16,
                }}
              >
                <div className="im-table-scroll">
                  <table className="im-table">
                    <thead>
                      <tr>
                        <th className="im-th">Job</th>
                        <th className="im-th">Errors</th>
                        <th className="im-th" style={{ textAlign: 'right' }}>
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {govFailureInsights.failureClusters7d
                        .slice(0, 20)
                        .map((c, i) => (
                          <tr className="im-tr" key={`${c.jobId}-${i}`}>
                            <td
                              className="im-td"
                              style={{
                                fontFamily: 'var(--font-im-mono)',
                                fontSize: 11,
                              }}
                            >
                              {c.jobId}
                            </td>
                            <td
                              className="im-td"
                              style={{
                                maxWidth: 240,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontSize: 11,
                              }}
                              title={c.errorMessage}
                            >
                              {c.errorMessage || '—'}
                            </td>
                            <td
                              className="im-td"
                              style={{ textAlign: 'right', fontSize: 11 }}
                            >
                              {c.count}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="im-table-scroll">
                  <table className="im-table">
                    <thead>
                      <tr>
                        <th className="im-th">Job</th>
                        <th className="im-th">Status</th>
                        <th className="im-th" style={{ textAlign: 'right' }}>
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {govFailureInsights.countsByStatus7d
                        .slice(0, 30)
                        .map((c, i) => (
                          <tr
                            className="im-tr"
                            key={`${c.jobId}-${c.status}-${i}`}
                          >
                            <td
                              className="im-td"
                              style={{
                                fontFamily: 'var(--font-im-mono)',
                                fontSize: 11,
                              }}
                            >
                              {c.jobId}
                            </td>
                            <td className="im-td" style={{ fontSize: 11 }}>
                              {c.status}
                            </td>
                            <td
                              className="im-td"
                              style={{ textAlign: 'right', fontSize: 11 }}
                            >
                              {c.count}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
                Loading…
              </span>
            )}
            <p style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
              {govFailureInsights?.notes}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 24,
            }}
          >
            <h3 style={{ fontSize: 12, fontWeight: 500 }}>
              Execution history and timeline ({govPanelJobId})
            </h3>
            {govTimeline && govTimeline.events.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  height: 32,
                  width: '100%',
                  alignItems: 'flex-end',
                  gap: 1,
                  overflow: 'auto',
                  background: 'var(--color-im-panel)',
                  border: '1px solid var(--color-im-rule)',
                  padding: 4,
                }}
              >
                {govTimeline.events.map(ev => {
                  const w = Math.max(
                    2,
                    Math.min(24, (ev.executionTimeMs ?? 4000) / 2000)
                  );
                  const st = ev.status.toUpperCase();
                  const bg =
                    st === 'SUCCESS'
                      ? '#10b981'
                      : st === 'FAILED'
                        ? '#ef4444'
                        : st === 'TIMEOUT'
                          ? '#f59e0b'
                          : st === 'MISSED'
                            ? '#8b5cf6'
                            : st === 'RETRY'
                              ? '#0ea5e9'
                              : 'var(--color-im-muted)';
                  return (
                    <div
                      key={ev.executionId}
                      style={{
                        width: `${w}px`,
                        minHeight: 22,
                        background: bg,
                        flexShrink: 0,
                        opacity: 0.9,
                      }}
                      title={`${ev.status} @ ${ev.startedAt}`}
                    />
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
                No events in window.
              </p>
            )}
            <div className="im-table-scroll">
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th">Execution</th>
                    <th className="im-th">Status</th>
                    <th className="im-th">Started</th>
                    <th className="im-th">Ms</th>
                    <th className="im-th">Records</th>
                    <th className="im-th">Retry</th>
                    <th className="im-th">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {govExecLog.length === 0 ? (
                    <tr className="im-tr">
                      <td
                        colSpan={7}
                        className="im-td"
                        style={{ color: 'var(--color-im-muted)', fontSize: 12 }}
                      >
                        No rows (pick a job above).
                      </td>
                    </tr>
                  ) : (
                    govExecLog.map(r => (
                      <tr className="im-tr" key={r.executionId}>
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'var(--font-im-mono)',
                            fontSize: 10,
                          }}
                        >
                          {r.executionId.slice(0, 8)}…
                        </td>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {r.status}
                        </td>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {r.startedAt}
                        </td>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {r.executionTimeMs ?? '—'}
                        </td>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {r.recordsProcessed}
                        </td>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {r.retryCount}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: 11,
                          }}
                          title={r.errorMessage ?? ''}
                        >
                          {r.errorMessage ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 24,
            }}
          >
            {mutateOk && (
              <button
                type="button"
                className="im-btn im-btn--sm"
                disabled={loading}
                onClick={() => {
                  void (async () => {
                    try {
                      await simulateBackgroundJobs(callerRole);
                      toast.success('Simulation complete (read-only)');
                    } catch (err) {
                      toast.error(String(err));
                    }
                  })();
                }}
              >
                Simulate recovery (read-only)
              </button>
            )}
            <button
              type="button"
              className="im-btn im-btn--sm"
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
                  } catch (err) {
                    toast.error(String(err));
                  }
                })();
              }}
            >
              Export recovery log CSV
            </button>
          </div>
        </div>
      </div>
    );
  }
);
