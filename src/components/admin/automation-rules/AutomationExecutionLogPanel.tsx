import { memo } from 'react';
import type { AutomationLogRow } from '@/lib/automation-console';

export interface AutomationExecutionLogPanelProps {
  logRuleId: string;
  logAction: string;
  logFrom: string;
  logTo: string;
  logStatus: string;
  logSearch: string;
  logRows: AutomationLogRow[];
  onLogRuleIdChange: (v: string) => void;
  onLogActionChange: (v: string) => void;
  onLogFromChange: (v: string) => void;
  onLogToChange: (v: string) => void;
  onLogStatusChange: (v: string) => void;
  onLogSearchChange: (v: string) => void;
  onApplyFilters: () => void;
}

export const AutomationExecutionLogPanel = memo(
  function AutomationExecutionLogPanel({
    logRuleId,
    logAction,
    logFrom,
    logTo,
    logStatus,
    logSearch,
    logRows,
    onLogRuleIdChange,
    onLogActionChange,
    onLogFromChange,
    onLogToChange,
    onLogStatusChange,
    onLogSearchChange,
    onApplyFilters,
  }: AutomationExecutionLogPanelProps) {
    return (
      <div className="im-section">
        <div className="im-section__header">
          <span className="im-section__label">// Automation Execution Log</span>
        </div>
        <div
          className="im-section__body"
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Rule ID</p>
              <input
                className="im-input"
                value={logRuleId}
                onChange={e => onLogRuleIdChange(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Action</p>
              <input
                className="im-input"
                value={logAction}
                onChange={e => onLogActionChange(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Result status</p>
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={logStatus}
                  onChange={e => onLogStatusChange(e.target.value)}
                >
                  <option value="ANY">Any</option>
                  <option value="OK">OK</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Date from</p>
              <input
                type="date"
                className="im-input"
                value={logFrom}
                onChange={e => onLogFromChange(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Date to</p>
              <input
                type="date"
                className="im-input"
                value={logTo}
                onChange={e => onLogToChange(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Search target / payload</p>
              <input
                className="im-input"
                value={logSearch}
                onChange={e => onLogSearchChange(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="im-btn im-btn--sm"
            onClick={() => void onApplyFilters()}
          >
            Apply log filters
          </button>
          <div className="im-table-scroll">
            <table className="im-table">
              <thead>
                <tr>
                  <th className="im-th">Executed</th>
                  <th className="im-th">Rule</th>
                  <th className="im-th">Action</th>
                  <th className="im-th">Target</th>
                  <th className="im-th" style={{ textAlign: 'right' }}>
                    Res
                  </th>
                  <th className="im-th" style={{ textAlign: 'right' }}>
                    Δh
                  </th>
                  <th className="im-th" style={{ textAlign: 'right' }}>
                    ms
                  </th>
                  <th className="im-th" style={{ textAlign: 'right' }}>
                    CU
                  </th>
                  <th className="im-th">Result</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map(row => (
                  <tr className="im-tr" key={row.automationId}>
                    <td
                      className="im-td"
                      style={{ whiteSpace: 'nowrap', fontSize: 11 }}
                    >
                      {row.executedAt}
                    </td>
                    <td className="im-td" style={{ fontSize: 11 }}>
                      {row.ruleId || '—'}
                    </td>
                    <td className="im-td" style={{ fontSize: 11 }}>
                      {row.actionTaken}
                    </td>
                    <td
                      className="im-td"
                      style={{
                        maxWidth: 140,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: 11,
                      }}
                    >
                      {row.targetEntity}
                    </td>
                    <td
                      className="im-td"
                      style={{ textAlign: 'right', fontSize: 11 }}
                    >
                      {row.casesResolved ?? 0}
                    </td>
                    <td
                      className="im-td"
                      style={{ textAlign: 'right', fontSize: 11 }}
                    >
                      {(row.resolutionTimeReductionHours ?? 0).toFixed(1)}
                    </td>
                    <td
                      className="im-td"
                      style={{ textAlign: 'right', fontSize: 11 }}
                    >
                      {row.actualExecutionTimeMs ?? 0}
                    </td>
                    <td
                      className="im-td"
                      style={{ textAlign: 'right', fontSize: 11 }}
                    >
                      {(row.estimatedCostUnits ?? 0).toFixed(2)}
                    </td>
                    <td
                      className="im-td"
                      style={{
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: 11,
                      }}
                    >
                      {row.executionResult}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
);
