import { memo, useMemo } from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 shrink-0" />
            Deployment safety
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!viewOk}
              onClick={onLoadDashboard}
            >
              Safety dashboard
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!viewOk}
              onClick={onLoadRecommendations}
            >
              Timing recommendations
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ruleScopedActionsDisabled}
              onClick={onEvaluateSafety}
            >
              Evaluate safety
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ruleScopedActionsDisabled}
              onClick={onDryRun}
            >
              Dry-run
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ruleScopedActionsDisabled}
              onClick={onAuditReport}
            >
              Audit report
            </Button>
          </div>
          {mutateOk ? (
            <div className="flex flex-wrap gap-2 border-t pt-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onEnableProdSafetyGate}
              >
                Enable prod safety gate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDisableProdSafetyGate}
              >
                Disable prod safety gate
              </Button>
            </div>
          ) : null}
          {depSafetyDash ? (
            <pre className="bg-muted max-h-36 overflow-auto rounded-md p-2 text-[10px]">
              {JSON.stringify(depSafetyDash, null, 2)}
            </pre>
          ) : null}
          {depSafetyReco ? (
            <pre className="bg-muted max-h-28 overflow-auto rounded-md p-2 text-[10px]">
              {JSON.stringify(depSafetyReco, null, 2)}
            </pre>
          ) : null}
          {depSafetyEval ? (
            <pre className="bg-muted max-h-44 overflow-auto rounded-md p-2 text-[10px]">
              {JSON.stringify(depSafetyEval, null, 2)}
            </pre>
          ) : null}
          {depDryRun ? (
            <pre className="bg-muted max-h-44 overflow-auto rounded-md p-2 text-[10px]">
              {JSON.stringify(depDryRun, null, 2)}
            </pre>
          ) : null}
          {depSafetyAudit ? (
            <pre className="bg-muted max-h-44 overflow-auto rounded-md p-2 text-[10px]">
              {JSON.stringify(depSafetyAudit, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    );
  }
);
