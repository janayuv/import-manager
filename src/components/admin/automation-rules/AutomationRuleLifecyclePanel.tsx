import { memo, useMemo, type Dispatch, type SetStateAction } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
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
          <option key={rule.ruleId} value={rule.ruleId}>
            {rule.ruleName} ({rule.ruleId})
          </option>
        )),
      [filteredRules]
    );

    const stagingStatusOptions = useMemo(
      () =>
        LC_STAGING_STATUS_OPTIONS.map(s => (
          <option key={s} value={s}>
            {s}
          </option>
        )),
      []
    );

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
            <History style={{ width: 14, height: 14, flexShrink: 0 }} />
            // Rule Deployment Lifecycle
          </span>
          {lcLoading ? (
            <span style={{ fontSize: 11, color: 'var(--color-im-muted)' }}>
              Loading…
            </span>
          ) : null}
        </div>
        <div
          className="im-section__body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            fontSize: 12,
          }}
        >
          {depGov ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 24,
                borderBottom: '1px solid var(--color-im-rule)',
                paddingBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={depGov.deploymentFrozen}
                  disabled={!mutateOk}
                  onChange={async e => {
                    const v = e.target.checked;
                    if (!mutateOk) return;
                    try {
                      await setDeploymentFreeze(v, callerRole);
                      toast.success(
                        v
                          ? 'Deployment freeze enabled'
                          : 'Deployment freeze off'
                      );
                      await loadCore();
                    } catch (err) {
                      toast.error(String(err));
                    }
                  }}
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: 'var(--color-im-accent)',
                  }}
                />
                <p
                  className="im-field-label"
                  style={{ color: 'var(--color-im-text)' }}
                >
                  Deployment freeze
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={depGov.requiresApproval}
                  disabled={!mutateOk}
                  onChange={async e => {
                    const v = e.target.checked;
                    if (!mutateOk) return;
                    try {
                      await setDeploymentRequiresApproval(v, callerRole);
                      toast.success(
                        v
                          ? 'Approvals required before deploy'
                          : 'Direct deploy allowed'
                      );
                      await loadCore();
                    } catch (err) {
                      toast.error(String(err));
                    }
                  }}
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: 'var(--color-im-accent)',
                  }}
                />
                <p
                  className="im-field-label"
                  style={{ color: 'var(--color-im-text)' }}
                >
                  Require approval
                </p>
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: 'span 2',
              }}
            >
              <p className="im-field-label">Rule</p>
              <div className="im-select-wrap">
                <select
                  className="im-select"
                  value={lcRuleId || ''}
                  onChange={e => setLcRuleId(e.target.value)}
                >
                  <option value="">
                    Select rule for versions &amp; deployments
                  </option>
                  {ruleSelectOptions}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label" style={{ fontSize: 11 }}>
                Version list — tenant id (optional)
              </p>
              <input
                className="im-input"
                placeholder="e.g. tenant-default"
                value={lcVersionTenantFilter}
                onChange={e => setLcVersionTenantFilter(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label" style={{ fontSize: 11 }}>
                Version list — environment id (optional)
              </p>
              <input
                className="im-input"
                placeholder="e.g. env-dev"
                value={lcVersionEnvFilter}
                onChange={e => setLcVersionEnvFilter(e.target.value)}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                gridColumn: 'span 4',
              }}
            >
              <button
                type="button"
                className="im-btn im-btn--sm"
                disabled={!viewOk}
                onClick={onRefreshLifecycle}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                Refresh lifecycle
              </button>
            </div>
          </div>

          {mutateOk && lcRuleId.trim() ? (
            <div
              style={{
                background: 'var(--color-im-panel)',
                border: '1px solid var(--color-im-rule)',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 500 }}>
                New version from live rule
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2,1fr)',
                  gap: 8,
                }}
              >
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  <p className="im-field-label" style={{ fontSize: 11 }}>
                    Tenant id (optional)
                  </p>
                  <input
                    className="im-input"
                    placeholder="default: matching rule tenant"
                    value={lcSnapTenant}
                    onChange={e => setLcSnapTenant(e.target.value)}
                  />
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  <p className="im-field-label" style={{ fontSize: 11 }}>
                    Environment id (optional)
                  </p>
                  <input
                    className="im-input"
                    placeholder="e.g. env-dev"
                    value={lcSnapEnv}
                    onChange={e => setLcSnapEnv(e.target.value)}
                  />
                </div>
              </div>
              <input
                className="im-input"
                placeholder="Change reason"
                value={lcChangeReason}
                onChange={e => setLcChangeReason(e.target.value)}
              />
              <button
                type="button"
                className="im-btn im-btn--sm im-btn--primary"
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
                  } catch (err) {
                    toast.error(String(err));
                  }
                }}
              >
                Snapshot live as new version
              </button>
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label" style={{ fontSize: 11 }}>
                Compare version A
              </p>
              <input
                className="im-input"
                value={lcCompareA}
                onChange={e => setLcCompareA(e.target.value)}
                placeholder="version_id"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label" style={{ fontSize: 11 }}>
                Compare version B
              </p>
              <input
                className="im-input"
                value={lcCompareB}
                onChange={e => setLcCompareB(e.target.value)}
                placeholder="version_id"
              />
            </div>
          </div>
          <button
            type="button"
            className="im-btn im-btn--sm"
            disabled={!viewOk}
            onClick={async () => {
              try {
                const r = await compareRuleVersions(
                  lcCompareA.trim(),
                  lcCompareB.trim(),
                  callerRole
                );
                setLcCompareResult(r);
              } catch (err) {
                toast.error(String(err));
              }
            }}
          >
            Compare versions
          </button>
          {lcCompareResult ? (
            <pre
              style={{
                background: 'var(--color-im-panel)',
                maxHeight: 144,
                overflow: 'auto',
                padding: 8,
                fontSize: 10,
              }}
            >
              {JSON.stringify(lcCompareResult, null, 2)}
            </pre>
          ) : null}

          {mutateOk && lcRuleId.trim() ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,1fr)',
                gap: 12,
                borderTop: '1px solid var(--color-im-rule)',
                paddingTop: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Stage version id
                </p>
                <input
                  className="im-input"
                  value={lcVersionForStaging}
                  onChange={e => setLcVersionForStaging(e.target.value)}
                />
                <input
                  className="im-input"
                  placeholder="Environment (default)"
                  value={lcStagingEnv}
                  onChange={e => setLcStagingEnv(e.target.value)}
                />
                <button
                  type="button"
                  className="im-btn im-btn--sm"
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
                    } catch (err) {
                      toast.error(String(err));
                    }
                  }}
                >
                  Create staging
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Update staging status
                </p>
                <input
                  className="im-input"
                  placeholder="staging_id"
                  value={lcStagingId}
                  onChange={e => setLcStagingId(e.target.value)}
                />
                <div className="im-select-wrap">
                  <select
                    className="im-select"
                    value={lcStagingStatus}
                    onChange={e => setLcStagingStatus(e.target.value)}
                  >
                    {stagingStatusOptions}
                  </select>
                </div>
                <button
                  type="button"
                  className="im-btn im-btn--sm"
                  onClick={async () => {
                    try {
                      await updateWorkflowRuleStagingStatus(
                        lcStagingId.trim(),
                        lcStagingStatus,
                        callerRole
                      );
                      toast.success('Staging status updated');
                      await loadLifecycle();
                    } catch (err) {
                      toast.error(String(err));
                    }
                  }}
                >
                  Apply staging status
                </button>
              </div>
            </div>
          ) : null}

          {mutateOk && lcRuleId.trim() ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,1fr)',
                gap: 12,
                borderTop: '1px solid var(--color-im-rule)',
                paddingTop: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Request approval (version id)
                </p>
                <input
                  className="im-input"
                  value={lcDeployVid}
                  onChange={e => setLcDeployVid(e.target.value)}
                />
                <button
                  type="button"
                  className="im-btn im-btn--sm im-btn--primary"
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
                    } catch (err) {
                      toast.error(String(err));
                    }
                  }}
                >
                  Submit for approval
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Record decision (approval id)
                </p>
                <input
                  className="im-input"
                  value={lcApprovalId}
                  onChange={e => setLcApprovalId(e.target.value)}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="im-btn im-btn--sm"
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="im-btn im-btn--sm"
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {mutateOk && lcRuleId.trim() ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,1fr)',
                gap: 12,
                borderTop: '1px solid var(--color-im-rule)',
                paddingTop: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Deploy version id
                </p>
                <input
                  className="im-input"
                  value={lcDeployVid}
                  onChange={e => setLcDeployVid(e.target.value)}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="im-btn im-btn--sm"
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    }}
                  >
                    Validate deploy
                  </button>
                  <button
                    type="button"
                    className="im-btn im-btn--sm im-btn--primary"
                    style={{ background: '#15803d' }}
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    }}
                  >
                    Deploy version
                  </button>
                </div>
                {isAdminRole ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      border: '1px solid rgba(232,162,58,0.4)',
                      background: 'rgba(232,162,58,0.06)',
                      padding: '6px 8px',
                    }}
                  >
                    <input
                      type="checkbox"
                      id="lc-safety-override"
                      checked={lcSafetyOverride}
                      onChange={e => setLcSafetyOverride(e.target.checked)}
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: 'var(--color-im-accent)',
                      }}
                    />
                    <label
                      htmlFor="lc-safety-override"
                      style={{
                        cursor: 'pointer',
                        fontSize: 11,
                        lineHeight: 1.3,
                      }}
                    >
                      Admin: acknowledge HIGH/CRITICAL safety override for this
                      deploy (audited)
                    </label>
                  </div>
                ) : null}
                {lcValidateResult ? (
                  <pre
                    style={{
                      background: 'var(--color-im-panel)',
                      maxHeight: 128,
                      overflow: 'auto',
                      padding: 8,
                      fontSize: 10,
                    }}
                  >
                    {JSON.stringify(lcValidateResult, null, 2)}
                  </pre>
                ) : null}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Rollback to version id
                </p>
                <input
                  className="im-input"
                  value={lcRollbackVid}
                  onChange={e => setLcRollbackVid(e.target.value)}
                />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  <p className="im-field-label" style={{ fontSize: 11 }}>
                    Rollback environment id (optional; must match target
                    version)
                  </p>
                  <input
                    className="im-input"
                    placeholder="e.g. env-prod"
                    value={lcRollbackEnv}
                    onChange={e => setLcRollbackEnv(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="im-btn im-btn--sm im-btn--danger"
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
                    } catch (err) {
                      toast.error(String(err));
                    }
                  }}
                >
                  Rollback
                </button>
              </div>
            </div>
          ) : null}

          {mutateOk && lcRuleId.trim() ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,1fr)',
                gap: 12,
                borderTop: '1px solid var(--color-im-rule)',
                paddingTop: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Canary — version id
                </p>
                <input
                  className="im-input"
                  value={lcCanaryVid}
                  onChange={e => setLcCanaryVid(e.target.value)}
                />
                <input
                  className="im-input"
                  placeholder="Sample % (0–100)"
                  value={lcCanaryPct}
                  onChange={e => setLcCanaryPct(e.target.value)}
                  inputMode="decimal"
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="im-btn im-btn--sm"
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
                      } catch (err) {
                        toast.error(String(err));
                      }
                    }}
                  >
                    Set canary
                  </button>
                  <button
                    type="button"
                    className="im-btn im-btn--sm"
                    onClick={async () => {
                      try {
                        await clearCanaryRuleDeployment(
                          lcRuleId.trim(),
                          callerRole
                        );
                        toast.success('Canary cleared');
                        await loadLifecycle();
                      } catch (err) {
                        toast.error(String(err));
                      }
                    }}
                  >
                    Clear canary
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label" style={{ fontSize: 11 }}>
                  Impact metrics
                </p>
                <button
                  type="button"
                  className="im-btn im-btn--sm"
                  onClick={async () => {
                    try {
                      await refreshRuleDeploymentImpactMetrics(
                        lcRuleId.trim(),
                        callerRole
                      );
                      toast.success('Impact refreshed');
                      await loadLifecycle();
                    } catch (err) {
                      toast.error(String(err));
                    }
                  }}
                >
                  Refresh impact (7d aggregates)
                </button>
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              gap: 16,
              borderTop: '1px solid var(--color-im-rule)',
              paddingTop: 12,
            }}
          >
            <div>
              <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
                Versions
              </p>
              <div
                style={{
                  maxHeight: 192,
                  overflow: 'auto',
                  border: '1px solid var(--color-im-rule)',
                }}
              >
                <table className="im-table">
                  <thead>
                    <tr>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        #
                      </th>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Tenant
                      </th>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Env
                      </th>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Active
                      </th>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Created
                      </th>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Reason
                      </th>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Version id
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lcVersions.map(v => (
                      <tr className="im-tr" key={v.versionId}>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {v.versionNumber}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 72,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: 11,
                          }}
                        >
                          {v.tenantId}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 64,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: 11,
                          }}
                        >
                          {v.environmentId}
                        </td>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {v.isActive ? 'yes' : 'no'}
                        </td>
                        <td
                          className="im-td"
                          style={{ whiteSpace: 'nowrap', fontSize: 11 }}
                        >
                          {v.createdAt}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: 11,
                          }}
                        >
                          {v.changeReason}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 140,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontFamily: 'var(--font-im-mono)',
                            fontSize: 10,
                          }}
                        >
                          {v.versionId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lcVersions.length === 0 ? (
                  <p
                    style={{
                      color: 'var(--color-im-muted)',
                      padding: 8,
                      fontSize: 11,
                    }}
                  >
                    No rows — pick a rule and refresh.
                  </p>
                ) : null}
              </div>
              <p
                style={{
                  color: 'var(--color-im-muted)',
                  marginTop: 4,
                  fontSize: 10,
                }}
              >
                Version ids are scoped per tenant/environment (see Version id
                column).
              </p>
            </div>
            <div>
              <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
                Approvals
              </p>
              <div
                style={{
                  maxHeight: 192,
                  overflow: 'auto',
                  border: '1px solid var(--color-im-rule)',
                }}
              >
                <table className="im-table">
                  <thead>
                    <tr>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Status
                      </th>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Version
                      </th>
                      <th className="im-th" style={{ fontSize: 11 }}>
                        Requested
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lcApprovals.map(a => (
                      <tr className="im-tr" key={a.approvalId}>
                        <td className="im-td" style={{ fontSize: 11 }}>
                          {a.approvalStatus}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: 11,
                          }}
                        >
                          {a.versionId}
                        </td>
                        <td
                          className="im-td"
                          style={{ whiteSpace: 'nowrap', fontSize: 11 }}
                        >
                          {a.createdAt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
                Staging
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
                {JSON.stringify(lcStaging, null, 2)}
              </pre>
            </div>
            <div>
              <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
                Deployment log
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
                {JSON.stringify(lcDeployLog, null, 2)}
              </pre>
            </div>
          </div>

          <div>
            <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
              Active canaries (all rules)
            </p>
            <pre
              style={{
                background: 'var(--color-im-panel)',
                maxHeight: 128,
                overflow: 'auto',
                padding: 8,
                fontSize: 11,
              }}
            >
              {JSON.stringify(lcCanary, null, 2)}
            </pre>
          </div>

          <div>
            <p style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>
              Deployment impact
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
              {JSON.stringify(lcImpact, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  }
);
