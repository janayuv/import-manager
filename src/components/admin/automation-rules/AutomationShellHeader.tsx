import { memo } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Automation control center
        </h1>
        <p className="text-muted-foreground text-sm">
          Rules, guardrails, effectiveness metrics, ROI, stability signals, and
          adaptive SLA — without direct database edits.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onRefresh()}
          disabled={loading}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh
        </Button>
        {mutateOk && (
          <Button type="button" size="sm" onClick={() => void onRunCycle()}>
            <Play className="mr-1 h-4 w-4" />
            Run automation now
          </Button>
        )}
      </div>
    </div>
  );
});
