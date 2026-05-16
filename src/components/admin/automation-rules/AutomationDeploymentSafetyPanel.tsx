import { memo, useMemo } from 'react';
import { Shield } from 'lucide-react';

export interface AutomationDeploymentSafetyPanelProps {
  viewOk: boolean;
  mutateOk: boolean;
  lcRuleId: string;
  lcDeployVid: string;
  depSafetyDash: Record<string, unknown> | null;
  depSafetyReco: Record<string, unknown> | null;
  depSafetyEval: Record<string, unknown> | null;
  depDryRun: Record<string, unknown> | null;
  depSafetyAudit: Record<string, unknown> | null;
  onLoadDashboard: () => void | Promise<void>;
  onLoadRecommendations: () => void | Promise<void>;
  onEvaluateSafety: () => void | Promise<void>;
  onDryRun: () => void | Promise<void>;
  onAuditReport: () => void | Promise<void>;
  onEnableProdSafetyGate: () => void | Promise<void>;
  onDisableProdSafetyGate: () => void | Promise<void>;
}

const preStyle: React.CSSProperties = {
  background: 'var(--color-im-panel)',
  border: '1px solid var(--color-im-rule)',
  overflow: 'auto',
  padding: 8,
  fontSize: 10,
  fontFamily: 'var(--font-im-mono)',
  color: 'var(--color-im-muted)',
  lineHeight: 1.5,
};

export const AutomationDeploymentSafetyPanel = memo(
  function AutomationDeploymentSafetyPanel({
    viewOk,
    mutateOk,
    lcRuleId,
    lcDeployVid,
    depSafetyDash,
    depSafetyReco,
    depSafetyEval,
    depDryRun,
    depSafetyAudit,
    onLoadDashboard,
    onLoadRecommendations,
    onEvaluateSafety,
    onDryRun,
    onAuditReport,
    onEnableProdSafetyGate,
    onDisableProdSafetyGate,
  }: AutomationDeploymentSafetyPanelProps) {
    const ruleScopedActionsDisabled = useMemo(
      () => !viewOk || !lcRuleId.trim() || !lcDeployVid.trim(),
      [viewOk, lcRuleId, lcDeployVid]
    );

    return (
      <div className="im-section">
        <div className="im-section__header">
          <span
            className="im-section__label"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Shield style={{ width: 14, height: 14, flexShrink: 0 }} />
            // Deployment safety
          </span>
        </div>
        <div
          className="im-section__body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="im-btn im-btn--sm"
              disabled={!viewOk}
              onClick={onLoadDashboard}
            >
              Safety dashboard
            </button>
            <button
              type="button"
              className="im-btn im-btn--sm"
              disabled={!viewOk}
              onClick={onLoadRecommendations}
            >
              Timing recommendations
            </button>
            <button
              type="button"
              className="im-btn im-btn--sm"
              disabled={ruleScopedActionsDisabled}
              onClick={onEvaluateSafety}
            >
              Evaluate safety
            </button>
            <button
              type="button"
              className="im-btn im-btn--sm"
              disabled={ruleScopedActionsDisabled}
              onClick={onDryRun}
            >
              Dry-run
            </button>
            <button
              type="button"
              className="im-btn im-btn--sm"
              disabled={ruleScopedActionsDisabled}
              onClick={onAuditReport}
            >
              Audit report
            </button>
          </div>
          {mutateOk ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                borderTop: '1px solid var(--color-im-rule)',
                paddingTop: 8,
              }}
            >
              <button
                type="button"
                className="im-btn im-btn--sm im-btn--primary"
                onClick={onEnableProdSafetyGate}
              >
                Enable prod safety gate
              </button>
              <button
                type="button"
                className="im-btn im-btn--sm"
                onClick={onDisableProdSafetyGate}
              >
                Disable prod safety gate
              </button>
            </div>
          ) : null}
          {depSafetyDash ? (
            <pre style={{ ...preStyle, maxHeight: 144 }}>
              {JSON.stringify(depSafetyDash, null, 2)}
            </pre>
          ) : null}
          {depSafetyReco ? (
            <pre style={{ ...preStyle, maxHeight: 112 }}>
              {JSON.stringify(depSafetyReco, null, 2)}
            </pre>
          ) : null}
          {depSafetyEval ? (
            <pre style={{ ...preStyle, maxHeight: 176 }}>
              {JSON.stringify(depSafetyEval, null, 2)}
            </pre>
          ) : null}
          {depDryRun ? (
            <pre style={{ ...preStyle, maxHeight: 176 }}>
              {JSON.stringify(depDryRun, null, 2)}
            </pre>
          ) : null}
          {depSafetyAudit ? (
            <pre style={{ ...preStyle, maxHeight: 176 }}>
              {JSON.stringify(depSafetyAudit, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
);
