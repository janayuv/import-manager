import { memo, useMemo, type Dispatch, type SetStateAction } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  clearCanaryRuleDeployment,
  compareRuleVersions,
  createWorkflowRuleStaging,
  createWorkflowRuleVersion,
  deployRuleVersion,
  recordRuleApprovalDecision,
  refreshRuleDeploymentImpactMetrics,
  rollbackRuleVersion,
  setCanaryRuleDeployment,
  setDeploymentFreeze,
  setDeploymentRequiresApproval,
  submitRuleVersionApproval,
  updateWorkflowRuleStagingStatus,
  validateRuleDeployment,
  type CanaryRuleDeploymentRow,
  type DeploymentFreezeStatus,
  type RuleDeploymentImpactRow,
  type WorkflowDecisionRuleRow,
  type WorkflowRuleApprovalRow,
  type WorkflowRuleDeploymentLogRow,
  type WorkflowRuleStagingRow,
  type WorkflowRuleVersionRow,
} from '@/lib/automation-console';

const LC_STAGING_STATUS_OPTIONS = [
  'DRAFT',
  'TESTING',
  'READY',
  'DEPLOYED',
  'FAILED',
] as const;

export interface AutomationRuleLifecyclePanelProps {
  depGov: DeploymentFreezeStatus | null;
  lcLoading: boolean;
  viewOk: boolean;
  mutateOk: boolean;
  isAdminRole: boolean;
  callerRole: string;
  changedBy: string;
  loadCore: () => void | Promise<void>;
  loadLifecycle: () => void | Promise<void>;
  onRefreshLifecycle: () => void;
  /** Full rule list (snapshot lookup). */
  rules: WorkflowDecisionRuleRow[];
  /** Filtered rules for the rule dropdown. */
  filteredRules: WorkflowDecisionRuleRow[];
  lcRuleId: string;
  setLcRuleId: Dispatch<SetStateAction<string>>;
  lcVersionTenantFilter: string;
  setLcVersionTenantFilter: Dispatch<SetStateAction<string>>;
  lcVersionEnvFilter: string;
  setLcVersionEnvFilter: Dispatch<SetStateAction<string>>;
  lcSnapTenant: string;
  setLcSnapTenant: Dispatch<SetStateAction<string>>;
  lcSnapEnv: string;
  setLcSnapEnv: Dispatch<SetStateAction<string>>;
  lcChangeReason: string;
  setLcChangeReason: Dispatch<SetStateAction<string>>;
  lcCompareA: string;
  setLcCompareA: Dispatch<SetStateAction<string>>;
  lcCompareB: string;
  setLcCompareB: Dispatch<SetStateAction<string>>;
  lcCompareResult: Record<string, unknown> | null;
  setLcCompareResult: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  lcVersionForStaging: string;
  setLcVersionForStaging: Dispatch<SetStateAction<string>>;
  lcStagingEnv: string;
  setLcStagingEnv: Dispatch<SetStateAction<string>>;
  lcStagingId: string;
  setLcStagingId: Dispatch<SetStateAction<string>>;
  lcStagingStatus: string;
  setLcStagingStatus: Dispatch<SetStateAction<string>>;
  lcDeployVid: string;
  setLcDeployVid: Dispatch<SetStateAction<string>>;
  lcApprovalId: string;
  setLcApprovalId: Dispatch<SetStateAction<string>>;
  lcValidateResult: Record<string, unknown> | null;
  setLcValidateResult: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  lcSafetyOverride: boolean;
  setLcSafetyOverride: Dispatch<SetStateAction<boolean>>;
  lcRollbackVid: string;
  setLcRollbackVid: Dispatch<SetStateAction<string>>;
  lcRollbackEnv: string;
  setLcRollbackEnv: Dispatch<SetStateAction<string>>;
  lcCanaryVid: string;
  setLcCanaryVid: Dispatch<SetStateAction<string>>;
  lcCanaryPct: string;
  setLcCanaryPct: Dispatch<SetStateAction<string>>;
  lcVersions: WorkflowRuleVersionRow[];
  lcStaging: WorkflowRuleStagingRow[];
  lcApprovals: WorkflowRuleApprovalRow[];
  lcDeployLog: WorkflowRuleDeploymentLogRow[];
  lcCanary: CanaryRuleDeploymentRow[];
  lcImpact: RuleDeploymentImpactRow[];
}

export const AutomationRuleLifecyclePanel = memo(
  function AutomationRuleLifecyclePanel({
    depGov,
    lcLoading,
    viewOk,
    mutateOk,
    isAdminRole,
    callerRole,
    changedBy,
    loadCore,
    loadLifecycle,
    onRefreshLifecycle,
    rules,
    filteredRules,
    lcRuleId,
    setLcRuleId,
    lcVersionTenantFilter,
    setLcVersionTenantFilter,
    lcVersionEnvFilter,
    setLcVersionEnvFilter,
    lcSnapTenant,
    setLcSnapTenant,
    lcSnapEnv,
    setLcSnapEnv,
    lcChangeReason,
    setLcChangeReason,
    lcCompareA,
    setLcCompareA,
    lcCompareB,
    setLcCompareB,
    lcCompareResult,
    setLcCompareResult,
    lcVersionForStaging,
    setLcVersionForStaging,
    lcStagingEnv,
    setLcStagingEnv,
    lcStagingId,
    setLcStagingId,
    lcStagingStatus,
    setLcStagingStatus,
    lcDeployVid,
    setLcDeployVid,
    lcApprovalId,
    setLcApprovalId,
    lcValidateResult,
    setLcValidateResult,
    lcSafetyOverride,
    setLcSafetyOverride,
    lcRollbackVid,
    setLcRollbackVid,
    lcRollbackEnv,
    setLcRollbackEnv,
    lcCanaryVid,
    setLcCanaryVid,
    lcCanaryPct,
    setLcCanaryPct,
    lcVersions,
    lcStaging,
    lcApprovals,
    lcDeployLog,
    lcCanary,
    lcImpact,
  }: AutomationRuleLifecyclePanelProps) {
    const ruleSelectOptions = useMemo(
      () =>
        filteredRules.map(rule => (
          <SelectItem key={rule.ruleId} value={rule.ruleId}>
            {rule.ruleName} ({rule.ruleId})
          </SelectItem>
        )),
      [filteredRules]
    );

    const stagingStatusOptions = useMemo(
      () =>
        LC_STAGING_STATUS_OPTIONS.map(s => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        )),
      []
    );

    return (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 shrink-0" />
            Rule deployment lifecycle
          </CardTitle>
          {lcLoading ? (
            <span className="text-muted-foreground text-xs">Loading…</span>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {depGov ? (
            <div className="flex flex-wrap items-center gap-6 border-b pb-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={depGov.deploymentFrozen}
                  disabled={!mutateOk}
                  onCheckedChange={async v => {
                    if (!mutateOk) return;
                    try {
                      await setDeploymentFreeze(v, callerRole);
                      toast.success(
                        v
                          ? 'Deployment freeze enabled'
                          : 'Deployment freeze off'
                      );
                      await loadCore();
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                />
                <Label className="text-foreground">Deployment freeze</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={depGov.requiresApproval}
                  disabled={!mutateOk}
                  onCheckedChange={async v => {
                    if (!mutateOk) return;
                    try {
                      await setDeploymentRequiresApproval(v, callerRole);
                      toast.success(
                        v
                          ? 'Approvals required before deploy'
                          : 'Direct deploy allowed'
                      );
                      await loadCore();
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                />
                <Label className="text-foreground">Require approval</Label>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Rule</Label>
              <Select value={lcRuleId || undefined} onValueChange={setLcRuleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select rule for versions & deployments" />
                </SelectTrigger>
                <SelectContent>{ruleSelectOptions}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">
                Version list — tenant id (optional)
              </Label>
              <Input
                placeholder="e.g. tenant-default"
                value={lcVersionTenantFilter}
                onChange={e => setLcVersionTenantFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">
                Version list — environment id (optional)
              </Label>
              <Input
                placeholder="e.g. env-dev"
                value={lcVersionEnvFilter}
                onChange={e => setLcVersionEnvFilter(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 lg:col-span-4">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={!viewOk}
                onClick={onRefreshLifecycle}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                Refresh lifecycle
              </Button>
            </div>
          </div>

          {mutateOk && lcRuleId.trim() ? (
            <div className="bg-muted/40 space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium">New version from live rule</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tenant id (optional)</Label>
                  <Input
                    placeholder="default: matching rule tenant"
                    value={lcSnapTenant}
                    onChange={e => setLcSnapTenant(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Environment id (optional)</Label>
                  <Input
                    placeholder="e.g. env-dev"
                    value={lcSnapEnv}
                    onChange={e => setLcSnapEnv(e.target.value)}
                  />
                </div>
              </div>
              <Input
                placeholder="Change reason"
                value={lcChangeReason}
                onChange={e => setLcChangeReason(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  const rid = lcRuleId.trim();
                  const rule = rules.find(x => x.ruleId === rid);
                  if (!rule) {
                    toast.error('Rule not found in list');
                    return;
                  }
                  try {
                    await createWorkflowRuleVersion(
                      {
                        ruleId: rule.ruleId,
                        ruleDefinition: {
                          ruleName: rule.ruleName,
                          ruleType: rule.ruleType,
                          conditionExpression: rule.conditionExpression,
                          actionType: rule.actionType,
                          priority: rule.priority,
                          enabled: rule.enabled,
                        },
                        changeReason:
                          lcChangeReason.trim() || 'Snapshot from live rule',
                        createdBy: changedBy,
                        tenantId: lcSnapTenant.trim() || null,
                        environmentId: lcSnapEnv.trim() || null,
                      },
                      callerRole
                    );
                    toast.success('Version created');
                    await loadLifecycle();
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                Snapshot live as new version
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Compare version A</Label>
              <Input
                value={lcCompareA}
                onChange={e => setLcCompareA(e.target.value)}
                placeholder="version_id"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Compare version B</Label>
              <Input
                value={lcCompareB}
                onChange={e => setLcCompareB(e.target.value)}
                placeholder="version_id"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!viewOk}
            onClick={async () => {
              try {
                const r = await compareRuleVersions(
                  lcCompareA.trim(),
                  lcCompareB.trim(),
                  callerRole
                );
                setLcCompareResult(r);
              } catch (e) {
                toast.error(String(e));
              }
            }}
          >
            Compare versions
          </Button>
          {lcCompareResult ? (
            <pre className="bg-muted max-h-36 overflow-auto rounded-md p-2 text-xs">
              {JSON.stringify(lcCompareResult, null, 2)}
            </pre>
          ) : null}

          {mutateOk && lcRuleId.trim() ? (
            <div className="grid gap-3 border-t pt-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Stage version id</Label>
                <Input
                  value={lcVersionForStaging}
                  onChange={e => setLcVersionForStaging(e.target.value)}
                />
                <Input
                  placeholder="Environment (default)"
                  value={lcStagingEnv}
                  onChange={e => setLcStagingEnv(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await createWorkflowRuleStaging(
                        lcRuleId.trim(),
                        lcVersionForStaging.trim(),
                        callerRole,
                        lcStagingEnv.trim() || 'default'
                      );
                      toast.success('Staging row created');
                      await loadLifecycle();
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                >
                  Create staging
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Update staging status</Label>
                <Input
                  placeholder="staging_id"
                  value={lcStagingId}
                  onChange={e => setLcStagingId(e.target.value)}
                />
                <Select
                  value={lcStagingStatus}
                  onValueChange={setLcStagingStatus}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>{stagingStatusOptions}</SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await updateWorkflowRuleStagingStatus(
                        lcStagingId.trim(),
                        lcStagingStatus,
                        callerRole
                      );
                      toast.success('Staging status updated');
                      await loadLifecycle();
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                >
                  Apply staging status
                </Button>
              </div>
            </div>
          ) : null}

          {mutateOk && lcRuleId.trim() ? (
            <div className="grid gap-3 border-t pt-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Request approval (version id)</Label>
                <Input
                  value={lcDeployVid}
                  onChange={e => setLcDeployVid(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    try {
                      await submitRuleVersionApproval(
                        lcRuleId.trim(),
                        lcDeployVid.trim(),
                        changedBy,
                        callerRole
                      );
                      toast.success('Approval requested');
                      await loadLifecycle();
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                >
                  Submit for approval
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Record decision (approval id)</Label>
                <Input
                  value={lcApprovalId}
                  onChange={e => setLcApprovalId(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await recordRuleApprovalDecision(
                          lcApprovalId.trim(),
                          true,
                          changedBy,
                          callerRole
                        );
                        toast.success('Marked approved');
                        await loadLifecycle();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await recordRuleApprovalDecision(
                          lcApprovalId.trim(),
                          false,
                          changedBy,
                          callerRole
                        );
                        toast.success('Marked rejected');
                        await loadLifecycle();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {mutateOk && lcRuleId.trim() ? (
            <div className="grid gap-3 border-t pt-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Deploy version id</Label>
                <Input
                  value={lcDeployVid}
                  onChange={e => setLcDeployVid(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const vr = await validateRuleDeployment(
                          lcRuleId.trim(),
                          lcDeployVid.trim(),
                          callerRole
                        );
                        setLcValidateResult(vr);
                        if (vr.ok === true) {
                          toast.success('Deployment validation passed');
                        } else {
                          toast.message(
                            'Validation reported issues — see JSON'
                          );
                        }
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                  >
                    Validate deploy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-700 hover:bg-emerald-800"
                    onClick={async () => {
                      try {
                        await deployRuleVersion(
                          lcRuleId.trim(),
                          lcDeployVid.trim(),
                          changedBy,
                          callerRole,
                          lcSafetyOverride && isAdminRole ? true : null
                        );
                        toast.success('Version deployed');
                        setLcValidateResult(null);
                        setLcSafetyOverride(false);
                        await loadLifecycle();
                        await loadCore();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                  >
                    Deploy version
                  </Button>
                </div>
                {isAdminRole ? (
                  <div className="flex items-center gap-2 rounded-md border border-amber-200/80 bg-amber-50/50 px-2 py-1.5 dark:bg-amber-950/20">
                    <Switch
                      checked={lcSafetyOverride}
                      onCheckedChange={setLcSafetyOverride}
                      id="lc-safety-override"
                    />
                    <Label
                      htmlFor="lc-safety-override"
                      className="cursor-pointer text-[11px] leading-tight"
                    >
                      Admin: acknowledge HIGH/CRITICAL safety override for this
                      deploy (audited)
                    </Label>
                  </div>
                ) : null}
                {lcValidateResult ? (
                  <pre className="bg-muted max-h-32 overflow-auto rounded-md p-2 text-[10px]">
                    {JSON.stringify(lcValidateResult, null, 2)}
                  </pre>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Rollback to version id</Label>
                <Input
                  value={lcRollbackVid}
                  onChange={e => setLcRollbackVid(e.target.value)}
                />
                <div className="space-y-1">
                  <Label className="text-xs">
                    Rollback environment id (optional; must match target
                    version)
                  </Label>
                  <Input
                    placeholder="e.g. env-prod"
                    value={lcRollbackEnv}
                    onChange={e => setLcRollbackEnv(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await rollbackRuleVersion(
                        lcRuleId.trim(),
                        lcRollbackVid.trim(),
                        changedBy,
                        callerRole,
                        lcRollbackEnv.trim() || null
                      );
                      toast.success('Rollback complete');
                      await loadLifecycle();
                      await loadCore();
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                >
                  Rollback
                </Button>
              </div>
            </div>
          ) : null}

          {mutateOk && lcRuleId.trim() ? (
            <div className="grid gap-3 border-t pt-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Canary — version id</Label>
                <Input
                  value={lcCanaryVid}
                  onChange={e => setLcCanaryVid(e.target.value)}
                />
                <Input
                  placeholder="Sample % (0–100)"
                  value={lcCanaryPct}
                  onChange={e => setLcCanaryPct(e.target.value)}
                  inputMode="decimal"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await setCanaryRuleDeployment(
                          lcRuleId.trim(),
                          lcCanaryVid.trim(),
                          Number.parseFloat(lcCanaryPct) || 10,
                          callerRole
                        );
                        toast.success('Canary set');
                        await loadLifecycle();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                  >
                    Set canary
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await clearCanaryRuleDeployment(
                          lcRuleId.trim(),
                          callerRole
                        );
                        toast.success('Canary cleared');
                        await loadLifecycle();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                  >
                    Clear canary
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Impact metrics</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await refreshRuleDeploymentImpactMetrics(
                        lcRuleId.trim(),
                        callerRole
                      );
                      toast.success('Impact refreshed');
                      await loadLifecycle();
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                >
                  Refresh impact (7d aggregates)
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 border-t pt-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium">Versions</p>
              <div className="max-h-48 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Tenant</TableHead>
                      <TableHead className="text-xs">Env</TableHead>
                      <TableHead className="text-xs">Active</TableHead>
                      <TableHead className="text-xs">Created</TableHead>
                      <TableHead className="text-xs">Reason</TableHead>
                      <TableHead className="text-xs">Version id</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lcVersions.map(v => (
                      <TableRow key={v.versionId}>
                        <TableCell className="text-xs">
                          {v.versionNumber}
                        </TableCell>
                        <TableCell className="max-w-[72px] truncate text-xs">
                          {v.tenantId}
                        </TableCell>
                        <TableCell className="max-w-[64px] truncate text-xs">
                          {v.environmentId}
                        </TableCell>
                        <TableCell className="text-xs">
                          {v.isActive ? 'yes' : 'no'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {v.createdAt}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-xs">
                          {v.changeReason}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate font-mono text-[10px]">
                          {v.versionId}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {lcVersions.length === 0 ? (
                  <p className="text-muted-foreground p-2 text-xs">
                    No rows — pick a rule and refresh.
                  </p>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 text-[10px]">
                Version ids are scoped per tenant/environment (see Version id
                column).
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Approvals</p>
              <div className="max-h-48 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Version</TableHead>
                      <TableHead className="text-xs">Requested</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lcApprovals.map(a => (
                      <TableRow key={a.approvalId}>
                        <TableCell className="text-xs">
                          {a.approvalStatus}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-xs">
                          {a.versionId}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {a.createdAt}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium">Staging</p>
              <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs">
                {JSON.stringify(lcStaging, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Deployment log</p>
              <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs">
                {JSON.stringify(lcDeployLog, null, 2)}
              </pre>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">
              Active canaries (all rules)
            </p>
            <pre className="bg-muted max-h-32 overflow-auto rounded-md p-2 text-xs">
              {JSON.stringify(lcCanary, null, 2)}
            </pre>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">Deployment impact</p>
            <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs">
              {JSON.stringify(lcImpact, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    );
  }
);
