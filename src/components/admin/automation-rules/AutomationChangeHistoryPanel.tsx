import { memo } from 'react';
import type { WorkflowRuleChangeRow } from '@/lib/automation-console';

export interface AutomationChangeHistoryPanelProps {
  changes: WorkflowRuleChangeRow[];
}

export const AutomationChangeHistoryPanel = memo(
  function AutomationChangeHistoryPanel({
    changes,
  }: AutomationChangeHistoryPanelProps) {
    return (
      <div className="im-section">
        <div className="im-section__header">
          <span className="im-section__label">// Rule Change History</span>
        </div>
        <div className="im-section__body">
          <div className="im-table-scroll">
            <table className="im-table">
              <thead>
                <tr>
                  <th className="im-th">When</th>
                  <th className="im-th">Rule</th>
                  <th className="im-th">Type</th>
                  <th className="im-th">By</th>
                  <th className="im-th">Prev → New</th>
                </tr>
              </thead>
              <tbody>
                {changes.map(c => (
                  <tr className="im-tr" key={c.changeId}>
                    <td className="im-td" style={{ fontSize: 11 }}>
                      {c.changedAt}
                    </td>
                    <td className="im-td" style={{ fontSize: 11 }}>
                      {c.ruleId || '—'}
                    </td>
                    <td className="im-td" style={{ fontSize: 11 }}>
                      {c.changeType}
                    </td>
                    <td className="im-td" style={{ fontSize: 11 }}>
                      {c.changedBy}
                    </td>
                    <td className="im-td" style={{ fontSize: 11 }}>
                      {c.previousValue} → {c.newValue}
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
