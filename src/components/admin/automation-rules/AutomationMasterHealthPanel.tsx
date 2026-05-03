import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Automation master</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">
                When off, the daily automation cycle does not execute actions.
              </p>
              {health && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Status:</span>
                  {automationHealthBadge(health.status)}
                  {health.lastCycleAt && (
                    <span className="text-muted-foreground">
                      Last cycle: {health.lastCycleAt}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">{masterOn ? 'ACTIVE' : 'PAUSED'}</span>
              <Switch
                checked={masterOn}
                onCheckedChange={v => void onMasterChange(v)}
                disabled={!mutateOk}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Automation health</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            {health ? (
              <>
                <div>
                  Actions (24h):{' '}
                  <span className="text-foreground font-medium">
                    {health.actionsLast24h}
                  </span>
                </div>
                <div>
                  Alerts / pauses (24h):{' '}
                  <span className="text-foreground font-medium">
                    {health.errorsLast24h}
                  </span>
                </div>
                <div>
                  Guardrail state:{' '}
                  <span className="text-foreground font-medium">
                    {health.paused ? 'Cooldown active' : 'Clear'}
                  </span>
                </div>
              </>
            ) : (
              <span>Loading…</span>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
);
