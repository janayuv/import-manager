import { memo } from 'react';
import { automationHealthBadge } from '@/components/admin/automation-rules/health-badge';
import type { AutomationHealthSnapshot } from '@/lib/automation-console';

export interface AutomationMasterHealthPanelProps {
  health: AutomationHealthSnapshot | null;
  masterOn: boolean;
  mutateOk: boolean;
  onMasterChange: (on: boolean) => void;
}

export const AutomationMasterHealthPanel = memo(
  function AutomationMasterHealthPanel({
    health,
    masterOn,
    mutateOk,
    onMasterChange,
  }: AutomationMasterHealthPanelProps) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 16,
        }}
      >
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Automation Master</span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
                When off, the daily automation cycle does not execute actions.
              </p>
              {health && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <span>Status:</span>
                  {automationHealthBadge(health.status)}
                  {health.lastCycleAt && (
                    <span style={{ color: 'var(--color-im-muted)' }}>
                      Last cycle: {health.lastCycleAt}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12 }}>
                {masterOn ? 'ACTIVE' : 'PAUSED'}
              </span>
              <input
                type="checkbox"
                checked={masterOn}
                onChange={e => void onMasterChange(e.target.checked)}
                disabled={!mutateOk}
                style={{
                  width: 16,
                  height: 16,
                  accentColor: 'var(--color-im-accent)',
                }}
              />
            </div>
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Automation Health</span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 12,
              color: 'var(--color-im-muted)',
            }}
          >
            {health ? (
              <>
                <div>
                  Actions (24h):{' '}
                  <span
                    style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                  >
                    {health.actionsLast24h}
                  </span>
                </div>
                <div>
                  Alerts / pauses (24h):{' '}
                  <span
                    style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                  >
                    {health.errorsLast24h}
                  </span>
                </div>
                <div>
                  Guardrail state:{' '}
                  <span
                    style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                  >
                    {health.paused ? 'Cooldown active' : 'Clear'}
                  </span>
                </div>
              </>
            ) : (
              <span>Loading…</span>
            )}
          </div>
        </div>
      </div>
    );
  }
);
