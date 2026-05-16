import { memo, type Dispatch, type SetStateAction } from 'react';
import { Gauge } from 'lucide-react';
import type {
  AutomationCapacityLoadRow,
  DailyAutomationEconomicsRow,
} from '@/lib/automation-console';

export interface AutomationCostBenefitPanelProps {
  costDash: Record<string, unknown> | null;
  capLoad: AutomationCapacityLoadRow[];
  econTrend: DailyAutomationEconomicsRow[];
  ineffRules: Record<string, unknown> | null;
  capForecast: Record<string, unknown> | null;
  costSug: Record<string, unknown> | null;
  limMaxCu: string;
  setLimMaxCu: Dispatch<SetStateAction<string>>;
  limMaxMs: string;
  setLimMaxMs: Dispatch<SetStateAction<string>>;
  limMaxRec: string;
  setLimMaxRec: Dispatch<SetStateAction<string>>;
  mutateOk: boolean;
  onDetectIneff: () => void | Promise<void>;
  onCapForecast: () => void | Promise<void>;
  onCostSug: () => void | Promise<void>;
  onSaveCostLimits: () => void | Promise<void>;
}

export const AutomationCostBenefitPanel = memo(
  function AutomationCostBenefitPanel({
    costDash,
    capLoad,
    econTrend,
    ineffRules,
    capForecast,
    costSug,
    limMaxCu,
    setLimMaxCu,
    limMaxMs,
    setLimMaxMs,
    limMaxRec,
    setLimMaxRec,
    mutateOk,
    onDetectIneff,
    onCapForecast,
    onCostSug,
    onSaveCostLimits,
  }: AutomationCostBenefitPanelProps) {
    return (
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
          <span
            className="im-section__label"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Gauge style={{ width: 14, height: 14 }} />
            // Automation Cost vs Benefit
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="im-btn im-btn--sm"
              onClick={() => void onDetectIneff()}
            >
              Inefficient rules
            </button>
            <button
              type="button"
              className="im-btn im-btn--sm"
              onClick={() => void onCapForecast()}
            >
              Capacity forecast
            </button>
            <button
              type="button"
              className="im-btn im-btn--sm"
              onClick={() => void onCostSug()}
            >
              Cost suggestions
            </button>
          </div>
        </div>
        <div
          className="im-section__body"
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {costDash?.totals14d ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,1fr)',
                gap: 8,
                fontSize: 12,
                color: 'var(--color-im-muted)',
              }}
            >
              <div>
                Cost units (14d roll-up):{' '}
                <span
                  style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                >
                  {Number(
                    (costDash.totals14d as Record<string, unknown>)
                      .totalCostUnits ?? 0
                  ).toFixed(1)}
                </span>
              </div>
              <div>
                Resolution gain h (14d):{' '}
                <span
                  style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                >
                  {Number(
                    (costDash.totals14d as Record<string, unknown>)
                      .totalResolutionGainHours ?? 0
                  ).toFixed(2)}
                </span>
              </div>
              <div>
                Cost / resolution-hour:{' '}
                <span
                  style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                >
                  {Number(
                    (costDash.totals14d as Record<string, unknown>)
                      .costPerResolutionHour ?? 0
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
              Cost efficiency metrics populate after automation cycles write
              logs.
            </p>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              gap: 16,
            }}
          >
            <div>
              <p style={{ marginBottom: 4, fontSize: 12, fontWeight: 500 }}>
                Economics index (recent)
              </p>
              <pre
                style={{
                  background: 'var(--color-im-panel)',
                  maxHeight: 160,
                  overflow: 'auto',
                  padding: 8,
                  fontSize: 11,
                }}
              >
                {JSON.stringify(
                  econTrend.slice(0, 14).map(e => ({
                    date: e.snapshotDate,
                    index: e.economicsIndex,
                  })),
                  null,
                  2
                )}
              </pre>
            </div>
            <div>
              <p style={{ marginBottom: 4, fontSize: 12, fontWeight: 500 }}>
                Latest capacity
              </p>
              {capLoad[0] ? (
                <ul
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    fontSize: 12,
                    color: 'var(--color-im-muted)',
                  }}
                >
                  <li>
                    Load:{' '}
                    <span className="im-badge">{capLoad[0].loadState}</span>{' '}
                    <span
                      style={{ color: 'var(--color-im-text)', fontWeight: 500 }}
                    >
                      {capLoad[0].loadPercentage.toFixed(0)}%
                    </span>
                  </li>
                  <li>Actions / cycle: {capLoad[0].actionsPerCycle}</li>
                  <li>Peak cycle ms: {capLoad[0].peakCycleDurationMs}</li>
                  <li>
                    Cost units / cycle:{' '}
                    {capLoad[0].totalCostUnitsCycle.toFixed(1)}
                  </li>
                  <li>Queue (open cases): {capLoad[0].queueDepth}</li>
                </ul>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-im-muted)' }}>
                  No snapshots yet.
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              gap: 16,
            }}
          >
            <div>
              <p style={{ marginBottom: 4, fontSize: 12, fontWeight: 500 }}>
                Cost trend (30d)
              </p>
              <pre
                style={{
                  background: 'var(--color-im-panel)',
                  maxHeight: 144,
                  overflow: 'auto',
                  fontSize: 11,
                }}
              >
                {JSON.stringify(costDash?.costTrend30d ?? [], null, 2)}
              </pre>
            </div>
            <div>
              <p style={{ marginBottom: 4, fontSize: 12, fontWeight: 500 }}>
                Benefit trend (30d)
              </p>
              <pre
                style={{
                  background: 'var(--color-im-panel)',
                  maxHeight: 144,
                  overflow: 'auto',
                  fontSize: 11,
                }}
              >
                {JSON.stringify(costDash?.benefitTrend30d ?? [], null, 2)}
              </pre>
            </div>
          </div>
          {(ineffRules || capForecast || costSug) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: 16,
                borderTop: '1px solid var(--color-im-rule)',
                paddingTop: 16,
              }}
            >
              {ineffRules && (
                <div>
                  <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
                    Inefficient
                  </p>
                  <pre
                    style={{
                      background: 'var(--color-im-panel)',
                      maxHeight: 192,
                      overflow: 'auto',
                      fontSize: 11,
                    }}
                  >
                    {JSON.stringify(ineffRules, null, 2)}
                  </pre>
                </div>
              )}
              {capForecast && (
                <div>
                  <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
                    Forecast
                  </p>
                  <pre
                    style={{
                      background: 'var(--color-im-panel)',
                      maxHeight: 192,
                      overflow: 'auto',
                      fontSize: 11,
                    }}
                  >
                    {JSON.stringify(capForecast, null, 2)}
                  </pre>
                </div>
              )}
              {costSug && (
                <div>
                  <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
                    Suggestions
                  </p>
                  <pre
                    style={{
                      background: 'var(--color-im-panel)',
                      maxHeight: 192,
                      overflow: 'auto',
                      fontSize: 11,
                    }}
                  >
                    {JSON.stringify(costSug, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          {mutateOk && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                borderTop: '1px solid var(--color-im-rule)',
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  gap: 8,
                  flex: 1,
                }}
              >
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  <p className="im-field-label">Max cost units / cycle</p>
                  <input
                    className="im-input"
                    value={limMaxCu}
                    onChange={e => setLimMaxCu(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  <p className="im-field-label">Max cycle time (ms)</p>
                  <input
                    className="im-input"
                    value={limMaxMs}
                    onChange={e => setLimMaxMs(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  <p className="im-field-label">Max records / cycle</p>
                  <input
                    className="im-input"
                    value={limMaxRec}
                    onChange={e => setLimMaxRec(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <button
                type="button"
                className="im-btn im-btn--primary im-btn--sm"
                onClick={() => void onSaveCostLimits()}
              >
                Save cost limits
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);
