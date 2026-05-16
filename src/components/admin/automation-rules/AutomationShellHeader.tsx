import { memo } from 'react';
import { Play, RefreshCw } from 'lucide-react';

export interface AutomationShellHeaderProps {
  loading: boolean;
  mutateOk: boolean;
  onRefresh: () => void;
  onRunCycle: () => void;
}

export const AutomationShellHeader = memo(function AutomationShellHeader({
  loading,
  mutateOk,
  onRefresh,
  onRunCycle,
}: AutomationShellHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 0',
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-im-mono)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--color-im-text)',
            textTransform: 'uppercase',
          }}
        >
          Automation Control Center
        </h1>
        <p
          style={{ fontSize: 12, color: 'var(--color-im-faint)', marginTop: 4 }}
        >
          Rules, guardrails, effectiveness metrics, ROI, stability signals, and
          adaptive SLA — without direct database edits.
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="im-btn im-btn--sm"
          onClick={() => void onRefresh()}
          disabled={loading}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh
        </button>
        {mutateOk && (
          <button
            type="button"
            className="im-btn im-btn--sm im-btn--primary"
            onClick={() => void onRunCycle()}
          >
            <Play className="mr-1 h-4 w-4" />
            Run automation now
          </button>
        )}
      </div>
    </div>
  );
});
