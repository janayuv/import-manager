import { memo, type Dispatch, type SetStateAction } from 'react';
import { Gauge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            Automation cost vs benefit
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onDetectIneff()}
            >
              Inefficient rules
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onCapForecast()}
            >
              Capacity forecast
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onCostSug()}
            >
              Cost suggestions
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {costDash?.totals14d ? (
            <div className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
              <div>
                Cost units (14d roll-up):{' '}
                <span className="text-foreground font-medium">
                  {Number(
                    (costDash.totals14d as Record<string, unknown>)
                      .totalCostUnits ?? 0
                  ).toFixed(1)}
                </span>
              </div>
              <div>
                Resolution gain h (14d):{' '}
                <span className="text-foreground font-medium">
                  {Number(
                    (costDash.totals14d as Record<string, unknown>)
                      .totalResolutionGainHours ?? 0
                  ).toFixed(2)}
                </span>
              </div>
              <div>
                Cost / resolution-hour:{' '}
                <span className="text-foreground font-medium">
                  {Number(
                    (costDash.totals14d as Record<string, unknown>)
                      .costPerResolutionHour ?? 0
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Cost efficiency metrics populate after automation cycles write
              logs.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium">
                Economics index (recent)
              </p>
              <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs">
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
              <p className="mb-1 text-sm font-medium">Latest capacity</p>
              {capLoad[0] ? (
                <ul className="text-muted-foreground space-y-1 text-sm">
                  <li>
                    Load:{' '}
                    <Badge variant="outline">{capLoad[0].loadState}</Badge>{' '}
                    <span className="text-foreground font-medium">
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
                <span className="text-muted-foreground text-sm">
                  No snapshots yet.
                </span>
              )}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium">Cost trend (30d)</p>
              <pre className="bg-muted max-h-36 overflow-auto text-xs">
                {JSON.stringify(costDash?.costTrend30d ?? [], null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Benefit trend (30d)</p>
              <pre className="bg-muted max-h-36 overflow-auto text-xs">
                {JSON.stringify(costDash?.benefitTrend30d ?? [], null, 2)}
              </pre>
            </div>
          </div>
          {(ineffRules || capForecast || costSug) && (
            <div className="grid gap-4 border-t pt-4 md:grid-cols-3">
              {ineffRules && (
                <div>
                  <p className="mb-1 text-xs font-medium">Inefficient</p>
                  <pre className="bg-muted max-h-48 overflow-auto text-xs">
                    {JSON.stringify(ineffRules, null, 2)}
                  </pre>
                </div>
              )}
              {capForecast && (
                <div>
                  <p className="mb-1 text-xs font-medium">Forecast</p>
                  <pre className="bg-muted max-h-48 overflow-auto text-xs">
                    {JSON.stringify(capForecast, null, 2)}
                  </pre>
                </div>
              )}
              {costSug && (
                <div>
                  <p className="mb-1 text-xs font-medium">Suggestions</p>
                  <pre className="bg-muted max-h-48 overflow-auto text-xs">
                    {JSON.stringify(costSug, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          {mutateOk && (
            <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-end">
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Max cost units / cycle</Label>
                  <Input
                    value={limMaxCu}
                    onChange={e => setLimMaxCu(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max cycle time (ms)</Label>
                  <Input
                    value={limMaxMs}
                    onChange={e => setLimMaxMs(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max records / cycle</Label>
                  <Input
                    value={limMaxRec}
                    onChange={e => setLimMaxRec(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <Button type="button" onClick={() => void onSaveCostLimits()}>
                Save cost limits
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);
