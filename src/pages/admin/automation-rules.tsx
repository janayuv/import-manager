import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  FlaskConical,
  GitCompare,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
  acknowledgeAutomationStabilityAlert,
  applyAdaptiveSlaDecision,
  detectInefficientRules,
  generateDeploymentSafetyAuditReport,
  getDeploymentSafetyDashboard,
  getSmartDeploymentRecommendations,
  runDeploymentDryRun,
  setDeploymentProdSafetyEnforcement,
  validateDeploymentSafety,
  generateAutomationLearningSuggestions,
  generateCostOptimizationSuggestions,
  generateRuleOptimizationRecommendations,
  getAppMetadata,
  getDeploymentFreezeStatus,
  getEnvironmentHealthDashboard,
  getTenantPerformanceDashboard,
  getWorkflowExecutionContext,
  getAutomationCostLimits,
  getAutomationCostVsBenefitDashboard,
  getAutomationHealth,
  getBackgroundJobHealthDashboard,
  getMissedScheduleDashboard,
  getAutomationImpactSummary,
  getRulePerformanceDashboard,
  listAdaptiveSlaAdjustments,
  listAutomationBenchmarkHistory,
  listAutomationCapacityLoad,
  listAutomationRoiMetrics,
  listAutomationStabilityAlerts,
  listDailyAutomationEconomicsIndex,
  listCanaryRuleDeployments,
  listWorkflowEnvironments,
  listWorkflowTenants,
  listRuleDeploymentImpactMetrics,
  listWorkflowDecisionRules,
  listWorkflowRuleApprovals,
  listWorkflowRuleChangeLog,
  listWorkflowRuleDeploymentLog,
  listWorkflowRuleStaging,
  listWorkflowRuleVersions,
  queryWorkflowAutomationLog,
  promoteRuleVersion,
  rollbackAutomationAction,
  predictiveCapacityForecast,
  runWorkflowAutomationCycle,
  setAutomationCostLimits,
  setAutomationGuardrails,
  setAdaptiveSlaApplyEnabled,
  setWorkflowActiveTenant,
  setWorkflowExecutionEnvironment,
  recoverMissedJob,
  detectMissedJobRuns,
  getJobExecutionTimeline,
  getJobFailureInsights,
  getWorkflowJobDependenciesTree,
  listWorkflowBackgroundJobs,
  listWorkflowJobExecutionLog,
  listWorkflowJobManualOverrideLog,
  listWorkflowJobScheduleExpectations,
  setWorkflowAutomationMasterEnabled,
  setWorkflowDecisionRuleEnabled,
  simulateMultipleRuleSets,
  simulateRuleExecution,
  type AdaptiveSlaAdjustmentRow,
  type AutomationCycleReport,
  type AutomationGuardrailsInput,
  type AutomationHealthSnapshot,
  type BackgroundJobHealthDashboard,
  type MissedScheduleDashboard,
  type JobExecutionTimeline,
  type JobFailureInsights,
  type ManualOverrideLogRow,
  type WorkflowBackgroundJobRow,
  type WorkflowJobDependenciesTree,
  type WorkflowJobExecutionLogRow,
  type WorkflowJobScheduleExpectationRow,
  type AutomationImpactSummary,
  type AutomationLogQuery,
  type AutomationLogRow,
  type AutomationBenchmarkRow,
  type AutomationCapacityLoadRow,
  type AutomationRoiMetricRow,
  type AutomationStabilityAlertRow,
  type CanaryRuleDeploymentRow,
  type DailyAutomationEconomicsRow,
  type DeploymentFreezeStatus,
  type RuleDeploymentImpactRow,
  type WorkflowDecisionRuleRow,
  type WorkflowRuleApprovalRow,
  type WorkflowRuleChangeRow,
  type WorkflowRuleDeploymentLogRow,
  type WorkflowRuleStagingRow,
  type WorkflowEnvironmentRow,
  type WorkflowRuleVersionRow,
  type WorkflowTenantRow,
} from '@/lib/automation-console';
import { useUser, useHasPermission } from '@/lib/user-context';
import {
  DeploymentActivityDrawer,
  openDeploymentActivitySearchParams,
} from '@/components/admin/DeploymentActivityDrawer';
import {
  AutomationChangeHistoryPanel,
  AutomationCostBenefitPanel,
  AutomationExecutionLogPanel,
  AutomationGovernancePanel,
  AutomationDeploymentSafetyPanel,
  AutomationJobObservabilityPanel,
  AutomationMasterHealthPanel,
  AutomationRuleLifecyclePanel,
  AutomationShellHeader,
} from '@/components/admin/automation-rules';

export default function AutomationRulesAdminPage() {
  const { user } = useUser();
  const [, setSearchParams] = useSearchParams();
  const role = user?.role ?? '';
  const callerRole = role;
  const changedBy = user?.id ?? 'unknown';
  const viewOk = useHasPermission('automation.view');
  const mutateOk = useHasPermission('automation.mutate');
  const isAdminRole = useHasPermission('role.write');

  const [rules, setRules] = useState<WorkflowDecisionRuleRow[]>([]);
  const [health, setHealth] = useState<AutomationHealthSnapshot | null>(null);
  const [impact, setImpact] = useState<AutomationImpactSummary | null>(null);
  const [slaRows, setSlaRows] = useState<AdaptiveSlaAdjustmentRow[]>([]);
  const [changes, setChanges] = useState<WorkflowRuleChangeRow[]>([]);
  const [logRows, setLogRows] = useState<AutomationLogRow[]>([]);
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(
    null
  );
  const [multiSim, setMultiSim] = useState<Record<string, unknown> | null>(
    null
  );
  const [perfDash, setPerfDash] = useState<Record<string, unknown> | null>(
    null
  );
  const [roiRows, setRoiRows] = useState<AutomationRoiMetricRow[]>([]);
  const [stabilityAlerts, setStabilityAlerts] = useState<
    AutomationStabilityAlertRow[]
  >([]);
  const [benchmarks, setBenchmarks] = useState<AutomationBenchmarkRow[]>([]);
  const [costDash, setCostDash] = useState<Record<string, unknown> | null>(
    null
  );
  const [capLoad, setCapLoad] = useState<AutomationCapacityLoadRow[]>([]);
  const [econTrend, setEconTrend] = useState<DailyAutomationEconomicsRow[]>([]);
  const [limMaxCu, setLimMaxCu] = useState('500000');
  const [limMaxMs, setLimMaxMs] = useState('120000');
  const [limMaxRec, setLimMaxRec] = useState('500000');
  const [ineffRules, setIneffRules] = useState<Record<string, unknown> | null>(
    null
  );
  const [capForecast, setCapForecast] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [costSug, setCostSug] = useState<Record<string, unknown> | null>(null);
  const [optRecs, setOptRecs] = useState<Record<string, unknown> | null>(null);
  const [learnSug, setLearnSug] = useState<Record<string, unknown> | null>(
    null
  );
  const [rollbackId, setRollbackId] = useState('');
  const [rollbackType, setRollbackType] = useState<
    'AUTO_RESOLVE' | 'AUTO_ASSIGN' | 'PRIORITY_ADJUST'
  >('AUTO_RESOLVE');
  const [lastRun, setLastRun] = useState<AutomationCycleReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobHealth, setJobHealth] =
    useState<BackgroundJobHealthDashboard | null>(null);
  const [missedSchedule, setMissedSchedule] =
    useState<MissedScheduleDashboard | null>(null);

  const [govRegistry, setGovRegistry] = useState<WorkflowBackgroundJobRow[]>(
    []
  );
  const [govScheduleExpectations, setGovScheduleExpectations] = useState<
    WorkflowJobScheduleExpectationRow[]
  >([]);
  const [govOverrideLog, setGovOverrideLog] = useState<ManualOverrideLogRow[]>(
    []
  );
  const [govFailureInsights, setGovFailureInsights] =
    useState<JobFailureInsights | null>(null);
  const [govDependencies, setGovDependencies] =
    useState<WorkflowJobDependenciesTree | null>(null);
  const [govPanelJobId, setGovPanelJobId] = useState('automation_cycle');
  const [govRetryExecId, setGovRetryExecId] = useState('');
  const [govOverrideReason, setGovOverrideReason] = useState('');
  const [govTuneGrace, setGovTuneGrace] = useState('');
  const [govTuneDelay, setGovTuneDelay] = useState('');
  const [govTuneMax, setGovTuneMax] = useState('');
  const [govExecLog, setGovExecLog] = useState<WorkflowJobExecutionLogRow[]>(
    []
  );
  const [govTimeline, setGovTimeline] = useState<JobExecutionTimeline | null>(
    null
  );

  const [depGov, setDepGov] = useState<DeploymentFreezeStatus | null>(null);
  const [lcRuleId, setLcRuleId] = useState('');
  const [lcVersions, setLcVersions] = useState<WorkflowRuleVersionRow[]>([]);
  const [lcStaging, setLcStaging] = useState<WorkflowRuleStagingRow[]>([]);
  const [lcApprovals, setLcApprovals] = useState<WorkflowRuleApprovalRow[]>([]);
  const [lcDeployLog, setLcDeployLog] = useState<
    WorkflowRuleDeploymentLogRow[]
  >([]);
  const [lcImpact, setLcImpact] = useState<RuleDeploymentImpactRow[]>([]);
  const [lcCanary, setLcCanary] = useState<CanaryRuleDeploymentRow[]>([]);
  const [lcChangeReason, setLcChangeReason] = useState('');
  const [lcStagingEnv, setLcStagingEnv] = useState('default');
  const [lcVersionForStaging, setLcVersionForStaging] = useState('');
  const [lcCompareA, setLcCompareA] = useState('');
  const [lcCompareB, setLcCompareB] = useState('');
  const [lcCompareResult, setLcCompareResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [lcDeployVid, setLcDeployVid] = useState('');
  const [lcRollbackVid, setLcRollbackVid] = useState('');
  const [lcApprovalId, setLcApprovalId] = useState('');
  const [lcStagingId, setLcStagingId] = useState('');
  const [lcStagingStatus, setLcStagingStatus] = useState('TESTING');
  const [lcCanaryPct, setLcCanaryPct] = useState('10');
  const [lcCanaryVid, setLcCanaryVid] = useState('');
  const [stagedVersionForSim, setStagedVersionForSim] = useState('');
  const [simTenantId, setSimTenantId] = useState('');
  const [simEnvironmentId, setSimEnvironmentId] = useState('');
  const [lcVersionTenantFilter, setLcVersionTenantFilter] = useState('');
  const [lcVersionEnvFilter, setLcVersionEnvFilter] = useState('');
  const [meCtx, setMeCtx] = useState<Record<string, unknown> | null>(null);
  const [meEnvs, setMeEnvs] = useState<WorkflowEnvironmentRow[]>([]);
  const [meTenants, setMeTenants] = useState<WorkflowTenantRow[]>([]);
  const [meHealth, setMeHealth] = useState<Record<string, unknown> | null>(
    null
  );
  const [meTenantDash, setMeTenantDash] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [lcPromoteFrom, setLcPromoteFrom] = useState('');
  const [lcPromoteToEnv, setLcPromoteToEnv] = useState('env-test');
  const [lcSnapTenant, setLcSnapTenant] = useState('');
  const [lcSnapEnv, setLcSnapEnv] = useState('');
  const [lcRollbackEnv, setLcRollbackEnv] = useState('');
  const [lcValidateResult, setLcValidateResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [lcSafetyOverride, setLcSafetyOverride] = useState(false);
  const [depSafetyDash, setDepSafetyDash] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [depSafetyReco, setDepSafetyReco] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [depSafetyEval, setDepSafetyEval] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [depDryRun, setDepDryRun] = useState<Record<string, unknown> | null>(
    null
  );
  const [depSafetyAudit, setDepSafetyAudit] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [lcLoading, setLcLoading] = useState(false);

  const [masterOn, setMasterOn] = useState(true);
  const [adaptiveApply, setAdaptiveApply] = useState(false);
  const [maxResolve, setMaxResolve] = useState('40');
  const [maxPrio, setMaxPrio] = useState('80');
  const [pauseMin, setPauseMin] = useState('60');

  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>('ALL');

  const [logRuleId, setLogRuleId] = useState('');
  const [logAction, setLogAction] = useState('');
  const [logFrom, setLogFrom] = useState('');
  const [logTo, setLogTo] = useState('');
  const [logStatus, setLogStatus] = useState('ANY');
  const [logSearch, setLogSearch] = useState('');

  const loadCore = useCallback(async () => {
    if (!viewOk) return;
    setLoading(true);
    try {
      const [
        r,
        h,
        im,
        sla,
        ch,
        m,
        aa,
        dash,
        roi,
        alerts,
        bench,
        cDash,
        caps,
        econ,
        lim,
        dg,
        jh,
        ms,
        br,
        se,
        mol,
        fi,
        dep,
      ] = await Promise.all([
        listWorkflowDecisionRules(callerRole),
        getAutomationHealth(callerRole),
        getAutomationImpactSummary(callerRole),
        listAdaptiveSlaAdjustments(callerRole, 40),
        listWorkflowRuleChangeLog(callerRole, 80),
        getAppMetadata('workflow_automation_master_enabled'),
        getAppMetadata('automation_adaptive_sla_apply'),
        getRulePerformanceDashboard(callerRole),
        listAutomationRoiMetrics(callerRole, 21),
        listAutomationStabilityAlerts(callerRole, false, 25),
        listAutomationBenchmarkHistory(callerRole, 12),
        getAutomationCostVsBenefitDashboard(callerRole),
        listAutomationCapacityLoad(callerRole, 20),
        listDailyAutomationEconomicsIndex(callerRole, 45),
        getAutomationCostLimits(callerRole),
        getDeploymentFreezeStatus(callerRole),
        getBackgroundJobHealthDashboard(callerRole),
        getMissedScheduleDashboard(callerRole),
        listWorkflowBackgroundJobs(callerRole),
        listWorkflowJobScheduleExpectations(callerRole),
        listWorkflowJobManualOverrideLog(callerRole, 25),
        getJobFailureInsights(callerRole),
        getWorkflowJobDependenciesTree(callerRole),
      ]);
      setRules(r);
      setHealth(h);
      setImpact(im);
      setSlaRows(sla);
      setChanges(ch);
      setMasterOn((m ?? '1').trim() !== '0');
      setAdaptiveApply((aa ?? '0').trim() === '1');
      setPerfDash(dash);
      setRoiRows(roi);
      setStabilityAlerts(alerts);
      setBenchmarks(bench);
      setCostDash(cDash);
      setCapLoad(caps);
      setEconTrend(econ);
      setLimMaxCu(String(lim.maxCostUnitsPerCycle));
      setLimMaxMs(String(lim.maxExecutionTimePerCycleMs));
      setLimMaxRec(String(lim.maxRecordsProcessedPerCycle));
      setDepGov(dg);
      setJobHealth(jh);
      setMissedSchedule(ms);
      setGovRegistry(br);
      setGovScheduleExpectations(se);
      setGovOverrideLog(mol);
      setGovFailureInsights(fi);
      setGovDependencies(dep);
      const mr = await getAppMetadata('automation_max_auto_resolve_per_hour');
      const mp = await getAppMetadata(
        'automation_max_priority_adjust_per_cycle'
      );
      const pm = await getAppMetadata('automation_pause_duration_minutes');
      if (mr) setMaxResolve(mr);
      if (mp) setMaxPrio(mp);
      if (pm) setPauseMin(pm);
      const q: AutomationLogQuery = { limit: 250 };
      const rows = await queryWorkflowAutomationLog(q, callerRole);
      setLogRows(rows);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [callerRole, viewOk]);

  const onScanMissedRuns = useCallback(async () => {
    if (!mutateOk) return;
    try {
      const n = await detectMissedJobRuns(callerRole);
      toast.success(`Missed-run scan: ${n} new record(s)`);
      await loadCore();
    } catch (e) {
      toast.error(String(e));
    }
  }, [callerRole, mutateOk, loadCore]);

  const onRecoverMissedJob = useCallback(
    async (jobId: string, alertId: string) => {
      if (!mutateOk) return;
      try {
        const msg = await recoverMissedJob(jobId, callerRole, alertId);
        toast.success(msg);
        await loadCore();
      } catch (e) {
        toast.error(String(e));
      }
    },
    [callerRole, mutateOk, loadCore]
  );

  useEffect(() => {
    const row = govScheduleExpectations.find(r => r.jobId === govPanelJobId);
    if (row) {
      setGovTuneGrace(String(row.gracePeriodMinutes));
      setGovTuneDelay(String(row.recoveryDelaySec));
      setGovTuneMax(String(row.maxRecoveryAttempts));
    }
  }, [govScheduleExpectations, govPanelJobId]);

  useEffect(() => {
    if (!viewOk || !govPanelJobId.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [log, tl] = await Promise.all([
          listWorkflowJobExecutionLog(callerRole, govPanelJobId.trim(), 120),
          getJobExecutionTimeline(govPanelJobId.trim(), callerRole, 48),
        ]);
        if (!cancelled) {
          setGovExecLog(log);
          setGovTimeline(tl);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callerRole, govPanelJobId, viewOk]);

  const loadLogs = useCallback(async () => {
    if (!viewOk) return;
    try {
      const q: AutomationLogQuery = {
        ruleId: logRuleId.trim() || undefined,
        actionTaken: logAction.trim() || undefined,
        dateFrom: logFrom.trim() || undefined,
        dateTo: logTo.trim() || undefined,
        resultStatus:
          logStatus === 'ANY' || !logStatus.trim()
            ? undefined
            : logStatus.trim(),
        search: logSearch.trim() || undefined,
        limit: 250,
      };
      const rows = await queryWorkflowAutomationLog(q, callerRole);
      setLogRows(rows);
    } catch (e) {
      toast.error(String(e));
    }
  }, [
    callerRole,
    logAction,
    logFrom,
    logRuleId,
    logSearch,
    logStatus,
    logTo,
    viewOk,
  ]);

  const loadLifecycle = useCallback(async () => {
    if (!viewOk || !lcRuleId.trim()) {
      toast.error('Select a rule to load deployment lifecycle data.');
      return;
    }
    const rid = lcRuleId.trim();
    setLcLoading(true);
    try {
      const [versions, staging, approvals, log, impact, canary] =
        await Promise.all([
          listWorkflowRuleVersions(
            rid,
            callerRole,
            lcVersionTenantFilter.trim() || null,
            lcVersionEnvFilter.trim() || null
          ),
          listWorkflowRuleStaging(callerRole, rid),
          listWorkflowRuleApprovals(callerRole, rid),
          listWorkflowRuleDeploymentLog(callerRole, rid, 80),
          listRuleDeploymentImpactMetrics(callerRole, rid, 40),
          listCanaryRuleDeployments(callerRole),
        ]);
      setLcVersions(versions);
      setLcStaging(staging);
      setLcApprovals(approvals);
      setLcDeployLog(log);
      setLcImpact(impact);
      setLcCanary(canary);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLcLoading(false);
    }
  }, [callerRole, lcRuleId, lcVersionTenantFilter, lcVersionEnvFilter, viewOk]);

  const onRefreshLifecycle = useCallback(() => {
    void loadLifecycle();
  }, [loadLifecycle]);

  const onDeploymentSafetyLoadDashboard = useCallback(async () => {
    try {
      setDepSafetyDash(await getDeploymentSafetyDashboard(callerRole));
    } catch (e) {
      toast.error(String(e));
    }
  }, [callerRole]);

  const onDeploymentSafetyLoadRecommendations = useCallback(async () => {
    try {
      setDepSafetyReco(await getSmartDeploymentRecommendations(callerRole));
    } catch (e) {
      toast.error(String(e));
    }
  }, [callerRole]);

  const onDeploymentSafetyEvaluate = useCallback(async () => {
    try {
      setDepSafetyEval(
        await validateDeploymentSafety(
          lcRuleId.trim(),
          lcDeployVid.trim(),
          callerRole
        )
      );
      toast.message('Safety evaluation updated');
    } catch (e) {
      toast.error(String(e));
    }
  }, [callerRole, lcRuleId, lcDeployVid]);

  const onDeploymentSafetyDryRun = useCallback(async () => {
    try {
      setDepDryRun(
        await runDeploymentDryRun(
          lcRuleId.trim(),
          lcDeployVid.trim(),
          callerRole
        )
      );
      toast.message('Dry-run ready');
    } catch (e) {
      toast.error(String(e));
    }
  }, [callerRole, lcRuleId, lcDeployVid]);

  const onDeploymentSafetyAuditReport = useCallback(async () => {
    try {
      setDepSafetyAudit(
        await generateDeploymentSafetyAuditReport(
          lcRuleId.trim(),
          lcDeployVid.trim(),
          callerRole
        )
      );
      toast.message('Audit report generated');
    } catch (e) {
      toast.error(String(e));
    }
  }, [callerRole, lcRuleId, lcDeployVid]);

  const onDeploymentSafetyEnableProdGate = useCallback(async () => {
    try {
      await setDeploymentProdSafetyEnforcement(true, callerRole);
      toast.success('Production safety enforcement ON');
    } catch (e) {
      toast.error(String(e));
    }
  }, [callerRole]);

  const onDeploymentSafetyDisableProdGate = useCallback(async () => {
    try {
      await setDeploymentProdSafetyEnforcement(false, callerRole);
      toast.success('Production safety enforcement OFF');
    } catch (e) {
      toast.error(String(e));
    }
  }, [callerRole]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  const ruleTypes = useMemo(() => {
    const s = new Set(rules.map(r => r.ruleType));
    return ['ALL', ...Array.from(s).sort()];
  }, [rules]);

  const filteredRules = useMemo(() => {
    let r = [...rules];
    if (ruleTypeFilter !== 'ALL') {
      r = r.filter(x => x.ruleType === ruleTypeFilter);
    }
    const q = ruleSearch.trim().toLowerCase();
    if (q) {
      r = r.filter(x => x.ruleName.toLowerCase().includes(q));
    }
    r.sort((a, b) => b.priority - a.priority);
    return r;
  }, [rules, ruleSearch, ruleTypeFilter]);

  const onToggleRule = async (ruleId: string, enabled: boolean) => {
    if (!mutateOk) return;
    try {
      await setWorkflowDecisionRuleEnabled(
        ruleId,
        enabled,
        callerRole,
        changedBy
      );
      toast.success('Rule updated');
      await loadCore();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onMaster = async (on: boolean) => {
    if (!mutateOk) return;
    try {
      await setWorkflowAutomationMasterEnabled(on, callerRole, changedBy);
      setMasterOn(on);
      toast.success(on ? 'Automation enabled' : 'Automation disabled');
      await loadCore();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const saveGuardrails = async () => {
    if (!mutateOk) return;
    try {
      const input: AutomationGuardrailsInput = {
        maxAutoResolvePerHour: Number.parseInt(maxResolve, 10) || 40,
        maxPriorityAdjustsPerCycle: Number.parseInt(maxPrio, 10) || 80,
        automationPauseDurationMinutes: Number.parseInt(pauseMin, 10) || 60,
      };
      await setAutomationGuardrails(input, callerRole);
      toast.success('Guardrails saved');
      await loadCore();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onAdaptiveToggle = async (on: boolean) => {
    if (!mutateOk) return;
    try {
      await setAdaptiveSlaApplyEnabled(on, callerRole, changedBy);
      setAdaptiveApply(on);
      toast.success(on ? 'Adaptive SLA apply enabled' : 'Apply disabled');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onAdaptiveDecision = async (accept: boolean) => {
    if (!mutateOk) return;
    try {
      const n = await applyAdaptiveSlaDecision(accept, callerRole, changedBy);
      toast.success(
        accept ? `Applied adaptive SLA (${n} type row(s))` : 'Rejected apply'
      );
      await loadCore();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onSimulate = async () => {
    if (!viewOk) return;
    try {
      const r = await simulateRuleExecution(callerRole);
      setSimResult(r);
      toast.message('Simulation complete (read-only)');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onMultiSim = async () => {
    if (!viewOk) return;
    try {
      const sv = stagedVersionForSim.trim();
      const r = await simulateMultipleRuleSets(
        callerRole,
        sv.length > 0 ? sv : null,
        simTenantId.trim() || null,
        simEnvironmentId.trim() || null
      );
      setMultiSim(r);
      toast.message('Multi-scenario comparison ready (read-only)');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onLoadOptRecs = async () => {
    if (!viewOk) return;
    try {
      const r = await generateRuleOptimizationRecommendations(callerRole);
      setOptRecs(r);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onLoadLearn = async () => {
    if (!viewOk) return;
    try {
      const r = await generateAutomationLearningSuggestions(callerRole);
      setLearnSug(r);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onAckAlert = async (alertId: string) => {
    if (!mutateOk) return;
    try {
      await acknowledgeAutomationStabilityAlert(alertId, callerRole);
      toast.success('Alert acknowledged');
      await loadCore();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onRollback = async () => {
    if (!mutateOk) return;
    const id = rollbackId.trim();
    if (!id) {
      toast.error('Enter automation ID from the log');
      return;
    }
    try {
      await rollbackAutomationAction(id, rollbackType, changedBy, callerRole);
      toast.success('Rollback recorded');
      setRollbackId('');
      await loadCore();
      await loadLogs();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onSaveCostLimits = async () => {
    if (!mutateOk) return;
    try {
      await setAutomationCostLimits(
        {
          maxCostUnitsPerCycle: Number.parseFloat(limMaxCu) || undefined,
          maxExecutionTimePerCycleMs:
            Number.parseInt(limMaxMs, 10) || undefined,
          maxRecordsProcessedPerCycle:
            Number.parseInt(limMaxRec, 10) || undefined,
        },
        callerRole
      );
      toast.success('Cost limits saved');
      await loadCore();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onDetectIneff = async () => {
    if (!viewOk) return;
    try {
      const r = await detectInefficientRules(callerRole);
      setIneffRules(r);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onCapForecast = async () => {
    if (!viewOk) return;
    try {
      const r = await predictiveCapacityForecast(callerRole);
      setCapForecast(r);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onCostSug = async () => {
    if (!viewOk) return;
    try {
      const r = await generateCostOptimizationSuggestions(callerRole);
      setCostSug(r);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onRunCycle = async () => {
    if (!mutateOk) return;
    try {
      const rep = await runWorkflowAutomationCycle(callerRole);
      setLastRun(rep);
      toast.success(
        rep.skippedPaused
          ? 'Cycle skipped (paused or limits)'
          : 'Automation cycle completed'
      );
      await loadCore();
      await loadLogs();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const openDeploymentActivityDrawer = () => {
    setSearchParams(
      prev => {
        const n = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(
          openDeploymentActivitySearchParams()
        )) {
          n.set(k, v);
        }
        return n;
      },
      { replace: true }
    );
  };

  if (!viewOk) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <div className="container mx-auto max-w-7xl space-y-6 p-6">
        <AutomationShellHeader
          loading={loading}
          mutateOk={mutateOk}
          onRefresh={loadCore}
          onRunCycle={onRunCycle}
        />

        <AutomationMasterHealthPanel
          health={health}
          masterOn={masterOn}
          mutateOk={mutateOk}
          onMasterChange={onMaster}
        />

        <AutomationJobObservabilityPanel
          jobHealth={jobHealth}
          missedSchedule={missedSchedule}
          loading={loading}
          mutateOk={mutateOk}
          onScanMissedRuns={onScanMissedRuns}
          onRecoverMissedJob={onRecoverMissedJob}
        />

        <AutomationGovernancePanel
          callerRole={callerRole}
          mutateOk={mutateOk}
          isAdminRole={isAdminRole}
          loading={loading}
          loadCore={loadCore}
          govRegistry={govRegistry}
          govPanelJobId={govPanelJobId}
          setGovPanelJobId={setGovPanelJobId}
          govRetryExecId={govRetryExecId}
          setGovRetryExecId={setGovRetryExecId}
          govOverrideReason={govOverrideReason}
          setGovOverrideReason={setGovOverrideReason}
          govTuneGrace={govTuneGrace}
          setGovTuneGrace={setGovTuneGrace}
          govTuneDelay={govTuneDelay}
          setGovTuneDelay={setGovTuneDelay}
          govTuneMax={govTuneMax}
          setGovTuneMax={setGovTuneMax}
          govOverrideLog={govOverrideLog}
          govDependencies={govDependencies}
          govFailureInsights={govFailureInsights}
          govTimeline={govTimeline}
          govExecLog={govExecLog}
        />

        {lastRun && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Last manual cycle result
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>Skipped: {String(lastRun.skippedPaused)}</div>
              <div>Auto-resolved: {lastRun.autoResolved}</div>
              <div>Auto-assigned: {lastRun.autoAssigned}</div>
              <div>Priority adjusts: {lastRun.priorityAdjusted}</div>
              <div>Repairs: {lastRun.repairs}</div>
              <div>Adaptive SLA rows: {lastRun.adaptiveSlaRows}</div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Automation guardrails</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Max auto-resolve / hour</Label>
              <Input
                value={maxResolve}
                onChange={e => setMaxResolve(e.target.value)}
                disabled={!mutateOk}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Max priority adjusts / cycle</Label>
              <Input
                value={maxPrio}
                onChange={e => setMaxPrio(e.target.value)}
                disabled={!mutateOk}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Pause duration (minutes)</Label>
              <Input
                value={pauseMin}
                onChange={e => setPauseMin(e.target.value)}
                disabled={!mutateOk}
                inputMode="numeric"
              />
            </div>
            {mutateOk && (
              <Button type="button" onClick={() => void saveGuardrails()}>
                Save guardrails
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adaptive SLA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-muted-foreground text-sm">
                  Snapshots are computed daily. “Apply” writes adjusted
                  deadlines when enabled.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Apply to open cases</span>
                <Switch
                  checked={adaptiveApply}
                  onCheckedChange={v => void onAdaptiveToggle(v)}
                  disabled={!mutateOk}
                />
              </div>
            </div>
            {mutateOk && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void onAdaptiveDecision(true)}
                >
                  Accept &amp; apply now
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onAdaptiveDecision(false)}
                >
                  Reject apply
                </Button>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Prev h</TableHead>
                  <TableHead>Adj h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slaRows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>{row.exceptionType}</TableCell>
                    <TableCell>{row.snapshotDate}</TableCell>
                    <TableCell>{row.previousHours}</TableCell>
                    <TableCell>{row.adjustedHours}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4">
            <CardTitle className="text-base">Workflow decision rules</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search rule name"
                value={ruleSearch}
                onChange={e => setRuleSearch(e.target.value)}
                className="w-48"
              />
              <Select value={ruleTypeFilter} onValueChange={setRuleTypeFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Rule type" />
                </SelectTrigger>
                <SelectContent>
                  {ruleTypes.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map(r => (
                  <TableRow key={r.ruleId}>
                    <TableCell className="font-medium">{r.ruleName}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[120px] truncate text-xs">
                      {r.tenantId}
                    </TableCell>
                    <TableCell>{r.ruleType}</TableCell>
                    <TableCell>{r.actionType}</TableCell>
                    <TableCell>{r.priority}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.enabled === 1}
                        onCheckedChange={v => void onToggleRule(r.ruleId, v)}
                        disabled={!mutateOk}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.updatedAt}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutDashboard className="h-4 w-4" />
              Rule performance dashboard
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void onLoadOptRecs()}
              >
                <Sparkles className="mr-1 h-4 w-4" />
                Optimization
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void onLoadLearn()}
              >
                Learning
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {(
                [
                  ['topPerformingRules', 'Top performing (14d)'],
                  ['lowPerformingRules', 'Low performing (14d)'],
                  ['unusedRules', 'Unused (enabled, no volume)'],
                  ['highFailureRateRules', 'High failure rate'],
                ] as const
              ).map(([key, label]) => {
                const rows =
                  (perfDash?.[key] as Record<string, unknown>[]) ?? [];
                return (
                  <div key={key} className="space-y-2">
                    <p className="text-sm font-medium">{label}</p>
                    <div className="bg-muted max-h-48 overflow-auto rounded-md p-2 text-xs">
                      {rows.length === 0 ? (
                        <span className="text-muted-foreground">
                          No data yet.
                        </span>
                      ) : (
                        <ul className="space-y-1">
                          {rows.slice(0, 8).map((x, i) => (
                            <li key={i}>
                              <span className="font-medium">
                                {String(x.ruleName ?? x.ruleId ?? '—')}
                              </span>
                              {typeof x.actions14d === 'number' ? (
                                <span className="text-muted-foreground">
                                  {' '}
                                  · actions {x.actions14d}
                                </span>
                              ) : null}
                              {typeof x.failureRate === 'number' ? (
                                <span className="text-muted-foreground">
                                  {' '}
                                  · fail {(x.failureRate * 100).toFixed(0)}%
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">
                  ROI snapshot (recent)
                </p>
                {roiRows[0] ? (
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    <li>
                      Est. time saved (30d roll-up):{' '}
                      <span className="text-foreground font-medium">
                        {roiRows[0].timeSavedHoursEstimate.toFixed(1)} h
                      </span>
                    </li>
                    <li>
                      Manual share reduction (proxy):{' '}
                      <span className="text-foreground font-medium">
                        {roiRows[0].manualWorkloadReductionPct.toFixed(1)}%
                      </span>
                    </li>
                    <li>
                      Resolved on-time share (30d proxy):{' '}
                      <span className="text-foreground font-medium">
                        {roiRows[0].slaComplianceImprovementPct.toFixed(1)}%
                      </span>
                    </li>
                    <li>
                      Automation vs manual resolution speed delta:{' '}
                      <span className="text-foreground font-medium">
                        {roiRows[0].resolutionSpeedIncreasePct.toFixed(1)}%
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Run an automation cycle to seed ROI metrics.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Stability alerts</p>
                {stabilityAlerts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">None open.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {stabilityAlerts.map(a => (
                      <li
                        key={a.id}
                        className="border-border/60 flex flex-wrap items-start justify-between gap-2 border-b pb-2"
                      >
                        <div>
                          <Badge variant="outline">{a.severity}</Badge>{' '}
                          <span className="font-medium">{a.alertType}</span>
                          <p className="text-muted-foreground text-xs">
                            {a.createdAt}
                          </p>
                        </div>
                        {mutateOk && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void onAckAlert(a.id)}
                          >
                            Ack
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Automation benchmarks</p>
              {benchmarks.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Weekly/monthly snapshots appear after automation cycles roll
                  benchmarks forward.
                </p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {benchmarks.slice(0, 8).map(b => (
                    <li key={b.id} className="bg-muted rounded-md p-2">
                      <span className="font-medium">{b.periodType}</span>{' '}
                      <span className="text-muted-foreground">
                        {b.periodStart} → {b.periodEnd}
                      </span>
                      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap">
                        {b.metricsJson}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(optRecs || learnSug) && (
              <div className="grid gap-4 md:grid-cols-2">
                {optRecs && (
                  <div>
                    <p className="mb-2 text-sm font-medium">
                      Optimization recommendations
                    </p>
                    <pre className="bg-muted max-h-56 overflow-auto rounded-md p-3 text-xs">
                      {JSON.stringify(optRecs, null, 2)}
                    </pre>
                  </div>
                )}
                {learnSug && (
                  <div>
                    <p className="mb-2 text-sm font-medium">
                      Automation learning suggestions
                    </p>
                    <pre className="bg-muted max-h-56 overflow-auto rounded-md p-3 text-xs">
                      {JSON.stringify(learnSug, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {mutateOk && (
              <div className="flex flex-col gap-2 border-t pt-4 md:flex-row md:items-end">
                <div className="grid flex-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Rollback automation ID</Label>
                    <Input
                      value={rollbackId}
                      onChange={e => setRollbackId(e.target.value)}
                      placeholder="automation_id from log"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select
                      value={rollbackType}
                      onValueChange={v =>
                        setRollbackType(
                          v as
                            | 'AUTO_RESOLVE'
                            | 'AUTO_ASSIGN'
                            | 'PRIORITY_ADJUST'
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AUTO_RESOLVE">
                          AUTO_RESOLVE
                        </SelectItem>
                        <SelectItem value="AUTO_ASSIGN">AUTO_ASSIGN</SelectItem>
                        <SelectItem value="PRIORITY_ADJUST">
                          PRIORITY_ADJUST
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void onRollback()}
                >
                  Roll back action
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <AutomationCostBenefitPanel
          costDash={costDash}
          capLoad={capLoad}
          econTrend={econTrend}
          ineffRules={ineffRules}
          capForecast={capForecast}
          costSug={costSug}
          limMaxCu={limMaxCu}
          setLimMaxCu={setLimMaxCu}
          limMaxMs={limMaxMs}
          setLimMaxMs={setLimMaxMs}
          limMaxRec={limMaxRec}
          setLimMaxRec={setLimMaxRec}
          mutateOk={mutateOk}
          onDetectIneff={onDetectIneff}
          onCapForecast={onCapForecast}
          onCostSug={onCostSug}
          onSaveCostLimits={onSaveCostLimits}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Environments, tenants & promotion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!viewOk}
                onClick={async () => {
                  try {
                    const [ctx, envs, tenants] = await Promise.all([
                      getWorkflowExecutionContext(callerRole),
                      listWorkflowEnvironments(callerRole),
                      listWorkflowTenants(callerRole),
                    ]);
                    setMeCtx(ctx as Record<string, unknown>);
                    setMeEnvs(envs);
                    setMeTenants(tenants);
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                Load registry & context
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!viewOk}
                onClick={async () => {
                  try {
                    setMeHealth(
                      await getEnvironmentHealthDashboard(callerRole)
                    );
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                Environment health
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!viewOk}
                onClick={async () => {
                  try {
                    setMeTenantDash(
                      await getTenantPerformanceDashboard(
                        callerRole,
                        (meCtx?.activeTenantId as string | undefined)?.trim() ||
                          null
                      )
                    );
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                Tenant performance
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!viewOk}
                onClick={openDeploymentActivityDrawer}
              >
                <Activity className="mr-1 h-4 w-4" />
                Deployment activity
              </Button>
            </div>
            {meCtx ? (
              <pre className="bg-muted max-h-28 overflow-auto rounded-md p-2 text-xs">
                {JSON.stringify(meCtx, null, 2)}
              </pre>
            ) : null}
            {meEnvs.length > 0 ? (
              <pre className="bg-muted max-h-24 overflow-auto text-xs">
                {JSON.stringify(meEnvs, null, 2)}
              </pre>
            ) : null}
            {meHealth ? (
              <pre className="bg-muted max-h-40 overflow-auto text-xs">
                {JSON.stringify(meHealth, null, 2)}
              </pre>
            ) : null}
            {meTenantDash ? (
              <pre className="bg-muted max-h-40 overflow-auto text-xs">
                {JSON.stringify(meTenantDash, null, 2)}
              </pre>
            ) : null}
            {mutateOk ? (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium">Active context (metadata)</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tenant id</Label>
                    <Select
                      value={
                        (meCtx?.activeTenantId as string | undefined) ||
                        undefined
                      }
                      onValueChange={async v => {
                        try {
                          await setWorkflowActiveTenant(v, callerRole);
                          toast.success('Active tenant updated');
                          const ctx =
                            await getWorkflowExecutionContext(callerRole);
                          setMeCtx(ctx as Record<string, unknown>);
                          await loadCore();
                        } catch (e) {
                          toast.error(String(e));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="tenant" />
                      </SelectTrigger>
                      <SelectContent>
                        {meTenants.map(t => (
                          <SelectItem key={t.tenantId} value={t.tenantId}>
                            {t.tenantName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Execution environment</Label>
                    <Select
                      value={
                        (meCtx?.executionEnvironmentId as string | undefined) ||
                        undefined
                      }
                      onValueChange={async v => {
                        try {
                          await setWorkflowExecutionEnvironment(v, callerRole);
                          toast.success('Execution environment updated');
                          const ctx =
                            await getWorkflowExecutionContext(callerRole);
                          setMeCtx(ctx as Record<string, unknown>);
                        } catch (e) {
                          toast.error(String(e));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="environment" />
                      </SelectTrigger>
                      <SelectContent>
                        {meEnvs.map(e => (
                          <SelectItem
                            key={e.environmentId}
                            value={e.environmentId}
                          >
                            {e.environmentName} ({e.environmentType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">
                Promote version (DEV → TEST → PROD)
              </Label>
              <Input
                placeholder="source version_id"
                value={lcPromoteFrom}
                onChange={e => setLcPromoteFrom(e.target.value)}
              />
              <Select value={lcPromoteToEnv} onValueChange={setLcPromoteToEnv}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="env-test">env-test</SelectItem>
                  <SelectItem value="env-prod">env-prod</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={!mutateOk}
                onClick={async () => {
                  try {
                    const nv = await promoteRuleVersion(
                      lcPromoteFrom.trim(),
                      lcPromoteToEnv,
                      changedBy,
                      callerRole
                    );
                    toast.success(`Promoted → ${nv}`);
                    setLcPromoteFrom('');
                    await loadLifecycle();
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                Promote
              </Button>
            </div>
          </CardContent>
        </Card>

        <AutomationRuleLifecyclePanel
          depGov={depGov}
          lcLoading={lcLoading}
          viewOk={viewOk}
          mutateOk={mutateOk}
          isAdminRole={isAdminRole}
          callerRole={callerRole}
          changedBy={changedBy}
          loadCore={loadCore}
          loadLifecycle={loadLifecycle}
          onRefreshLifecycle={onRefreshLifecycle}
          rules={rules}
          filteredRules={filteredRules}
          lcRuleId={lcRuleId}
          setLcRuleId={setLcRuleId}
          lcVersionTenantFilter={lcVersionTenantFilter}
          setLcVersionTenantFilter={setLcVersionTenantFilter}
          lcVersionEnvFilter={lcVersionEnvFilter}
          setLcVersionEnvFilter={setLcVersionEnvFilter}
          lcSnapTenant={lcSnapTenant}
          setLcSnapTenant={setLcSnapTenant}
          lcSnapEnv={lcSnapEnv}
          setLcSnapEnv={setLcSnapEnv}
          lcChangeReason={lcChangeReason}
          setLcChangeReason={setLcChangeReason}
          lcCompareA={lcCompareA}
          setLcCompareA={setLcCompareA}
          lcCompareB={lcCompareB}
          setLcCompareB={setLcCompareB}
          lcCompareResult={lcCompareResult}
          setLcCompareResult={setLcCompareResult}
          lcVersionForStaging={lcVersionForStaging}
          setLcVersionForStaging={setLcVersionForStaging}
          lcStagingEnv={lcStagingEnv}
          setLcStagingEnv={setLcStagingEnv}
          lcStagingId={lcStagingId}
          setLcStagingId={setLcStagingId}
          lcStagingStatus={lcStagingStatus}
          setLcStagingStatus={setLcStagingStatus}
          lcDeployVid={lcDeployVid}
          setLcDeployVid={setLcDeployVid}
          lcApprovalId={lcApprovalId}
          setLcApprovalId={setLcApprovalId}
          lcValidateResult={lcValidateResult}
          setLcValidateResult={setLcValidateResult}
          lcSafetyOverride={lcSafetyOverride}
          setLcSafetyOverride={setLcSafetyOverride}
          lcRollbackVid={lcRollbackVid}
          setLcRollbackVid={setLcRollbackVid}
          lcRollbackEnv={lcRollbackEnv}
          setLcRollbackEnv={setLcRollbackEnv}
          lcCanaryVid={lcCanaryVid}
          setLcCanaryVid={setLcCanaryVid}
          lcCanaryPct={lcCanaryPct}
          setLcCanaryPct={setLcCanaryPct}
          lcVersions={lcVersions}
          lcStaging={lcStaging}
          lcApprovals={lcApprovals}
          lcDeployLog={lcDeployLog}
          lcCanary={lcCanary}
          lcImpact={lcImpact}
        />

        <AutomationDeploymentSafetyPanel
          viewOk={viewOk}
          mutateOk={mutateOk}
          lcRuleId={lcRuleId}
          lcDeployVid={lcDeployVid}
          depSafetyDash={depSafetyDash}
          depSafetyReco={depSafetyReco}
          depSafetyEval={depSafetyEval}
          depDryRun={depDryRun}
          depSafetyAudit={depSafetyAudit}
          onLoadDashboard={onDeploymentSafetyLoadDashboard}
          onLoadRecommendations={onDeploymentSafetyLoadRecommendations}
          onEvaluateSafety={onDeploymentSafetyEvaluate}
          onDryRun={onDeploymentSafetyDryRun}
          onAuditReport={onDeploymentSafetyAuditReport}
          onEnableProdSafetyGate={onDeploymentSafetyEnableProdGate}
          onDisableProdSafetyGate={onDeploymentSafetyDisableProdGate}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Rule simulation</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onSimulate()}
                >
                  <FlaskConical className="mr-1 h-4 w-4" />
                  Run simulation
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onMultiSim()}
                >
                  <GitCompare className="mr-1 h-4 w-4" />
                  Compare rule sets
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">
                  Staged version id (optional — attaches active vs staged diff
                  to comparison)
                </Label>
                <Input
                  value={stagedVersionForSim}
                  onChange={e => setStagedVersionForSim(e.target.value)}
                  placeholder="e.g. rule-auto-resolve-overdue-delivered:v:2"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">
                    Simulation tenant id (optional)
                  </Label>
                  <Input
                    value={simTenantId}
                    onChange={e => setSimTenantId(e.target.value)}
                    placeholder="tenant-default"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Simulation environment id (optional)
                  </Label>
                  <Input
                    value={simEnvironmentId}
                    onChange={e => setSimEnvironmentId(e.target.value)}
                    placeholder="env-dev"
                  />
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs">
                  Single pass
                </p>
                <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 text-xs">
                  {simResult
                    ? JSON.stringify(simResult, null, 2)
                    : 'No simulation run yet.'}
                </pre>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs">
                  Current vs all-off vs auto-resolve-only
                </p>
                <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 text-xs">
                  {multiSim
                    ? JSON.stringify(multiSim, null, 2)
                    : 'Run “Compare rule sets” for projections.'}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Automation impact (7 days)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-1 text-sm">
              {impact ? (
                <>
                  <div>Auto-resolve: {impact.autoResolve7d}</div>
                  <div>Auto-assign: {impact.autoAssign7d}</div>
                  <div>Priority adjust: {impact.priorityAdjust7d}</div>
                  <div>Auto-repair: {impact.autoRepair7d}</div>
                  <div>SLA escalations (log): {impact.escalationsLogged7d}</div>
                  <div>Cycle summaries: {impact.cycleSummaries7d}</div>
                </>
              ) : (
                <span>Loading…</span>
              )}
            </CardContent>
          </Card>
        </div>

        <AutomationExecutionLogPanel
          logRuleId={logRuleId}
          logAction={logAction}
          logFrom={logFrom}
          logTo={logTo}
          logStatus={logStatus}
          logSearch={logSearch}
          logRows={logRows}
          onLogRuleIdChange={setLogRuleId}
          onLogActionChange={setLogAction}
          onLogFromChange={setLogFrom}
          onLogToChange={setLogTo}
          onLogStatusChange={setLogStatus}
          onLogSearchChange={setLogSearch}
          onApplyFilters={loadLogs}
        />

        <AutomationChangeHistoryPanel changes={changes} />

        {!mutateOk && (
          <p className="text-muted-foreground text-sm">
            Your role is read-only (viewer). Rule toggles and guardrails are
            disabled.
          </p>
        )}
      </div>
      <DeploymentActivityDrawer
        callerRole={callerRole}
        rules={rules}
        environments={meEnvs}
        tenants={meTenants}
      />
    </>
  );
}
