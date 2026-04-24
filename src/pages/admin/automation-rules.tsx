import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  FlaskConical,
  Gauge,
  GitCompare,
  History,
  LayoutDashboard,
  Play,
  RefreshCw,
  Shield,
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
  canMutateAutomationRules,
  canViewAutomationConsole,
  clearCanaryRuleDeployment,
  compareRuleVersions,
  createWorkflowRuleStaging,
  createWorkflowRuleVersion,
  deployRuleVersion,
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
  recordRuleApprovalDecision,
  refreshRuleDeploymentImpactMetrics,
  promoteRuleVersion,
  rollbackAutomationAction,
  rollbackRuleVersion,
  predictiveCapacityForecast,
  runWorkflowAutomationCycle,
  setAutomationCostLimits,
  setAutomationGuardrails,
  setAdaptiveSlaApplyEnabled,
  setCanaryRuleDeployment,
  setDeploymentFreeze,
  setDeploymentRequiresApproval,
  setWorkflowActiveTenant,
  setWorkflowExecutionEnvironment,
  recoverMissedJob,
  detectMissedJobRuns,
  exportWorkflowJobRecoveryLogCsv,
  getJobExecutionTimeline,
  getJobFailureInsights,
  getWorkflowJobDependenciesTree,
  listWorkflowBackgroundJobs,
  listWorkflowJobExecutionLog,
  listWorkflowJobManualOverrideLog,
  listWorkflowJobScheduleExpectations,
  recoveryGuardOverrideReenable,
  resetJobScheduleAnchor,
  retryFailedJobExecution,
  retryLatestFailedJob,
  setWorkflowBackgroundJobEnabled,
  simulateBackgroundJobs,
  updateJobScheduleExpectations,
  setWorkflowAutomationMasterEnabled,
  setWorkflowDecisionRuleEnabled,
  submitRuleVersionApproval,
  simulateMultipleRuleSets,
  simulateRuleExecution,
  updateWorkflowRuleStagingStatus,
  validateRuleDeployment,
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
import { useUser } from '@/lib/user-context';
import {
  DeploymentActivityDrawer,
  openDeploymentActivitySearchParams,
} from '@/components/admin/DeploymentActivityDrawer';

function healthBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'HEALTHY')
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">ACTIVE</Badge>
    );
  if (s === 'OFF') return <Badge variant="secondary">PAUSED</Badge>;
  if (s === 'WARNING')
    return <Badge className="bg-amber-600 hover:bg-amber-600">WARNING</Badge>;
  if (s === 'ERROR') return <Badge variant="destructive">ERROR</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default function AutomationRulesAdminPage() {
  const { user } = useUser();
  const [, setSearchParams] = useSearchParams();
  const role = user?.role ?? '';
  const callerRole = role;
  const changedBy = user?.id ?? 'unknown';
  const viewOk = canViewAutomationConsole(role);
  const mutateOk = canMutateAutomationRules(role);
  const isAdminRole = useMemo(
    () => callerRole.toLowerCase().replace(/\s/g, '').includes('admin'),
    [callerRole]
  );

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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Automation control center
            </h1>
            <p className="text-muted-foreground text-sm">
              Rules, guardrails, effectiveness metrics, ROI, stability signals,
              and adaptive SLA — without direct database edits.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadCore()}
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
                    {healthBadge(health.status)}
                    {health.lastCycleAt && (
                      <span className="text-muted-foreground">
                        Last cycle: {health.lastCycleAt}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {masterOn ? 'ACTIVE' : 'PAUSED'}
                </span>
                <Switch
                  checked={masterOn}
                  onCheckedChange={v => void onMaster(v)}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Background job health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Scheduled workflow jobs (retention, observability, automation,
              cost rollups, safety signals). Data comes from execution logs and
              reliability scores.
            </p>
            {!jobHealth ? (
              <span className="text-muted-foreground text-sm">Loading…</span>
            ) : jobHealth.jobs.length === 0 ? (
              <span className="text-muted-foreground text-sm">
                No registered jobs yet.
              </span>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Last status</TableHead>
                      <TableHead className="text-right">
                        Failures (7d)
                      </TableHead>
                      <TableHead className="text-right">Avg ms (7d)</TableHead>
                      <TableHead className="text-right">Retry rows</TableHead>
                      <TableHead className="text-right">Reliability</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobHealth.jobs.map(j => (
                      <TableRow key={j.jobId}>
                        <TableCell className="font-mono text-xs">
                          {j.jobId}
                        </TableCell>
                        <TableCell className="text-sm">
                          {j.lastExecution ? (
                            <span className="inline-flex flex-col gap-0.5">
                              <span>{j.lastExecution.status}</span>
                              {j.lastExecution.completedAt && (
                                <span className="text-muted-foreground text-xs">
                                  {j.lastExecution.completedAt}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {j.failures7d}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {Math.round(j.avgExecutionMs7d)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {j.retryRows}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {j.reliability != null
                            ? j.reliability.score.toFixed(2)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              Missed schedule and recovery
            </CardTitle>
            {mutateOk && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void onScanMissedRuns()}
                disabled={loading}
              >
                Scan for missed runs
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Tracks jobs that passed their expected interval without a
              successful run, auto-recovery after the daily pipeline, and
              recovery scores. Use Recover for a pending alert when you need an
              immediate retry.
            </p>
            {!missedSchedule ? (
              <span className="text-muted-foreground text-sm">Loading…</span>
            ) : (
              <>
                <div className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    Pending missed:{' '}
                    <span className="text-foreground font-medium">
                      {missedSchedule.pendingMissed}
                    </span>
                  </div>
                  <div>
                    Recovered (7d):{' '}
                    <span className="text-foreground font-medium">
                      {missedSchedule.recovered7d}
                    </span>
                  </div>
                  <div>
                    Missed exec rows (7d):{' '}
                    <span className="text-foreground font-medium">
                      {missedSchedule.missedExecutions7d}
                    </span>
                  </div>
                  <div>
                    Recovery success (30d):{' '}
                    <span className="text-foreground font-medium">
                      {(missedSchedule.recoverySuccessRate30d * 100).toFixed(0)}
                      %
                    </span>
                  </div>
                </div>
                {missedSchedule.todayMetrics && (
                  <div className="text-muted-foreground border-t pt-3 text-xs">
                    Today: missed {missedSchedule.todayMetrics.missedRuns},
                    recovery ok {missedSchedule.todayMetrics.recoverySuccess},
                    failures {missedSchedule.todayMetrics.recoveryFailures},
                    drift warnings {missedSchedule.todayMetrics.driftWarnings}
                  </div>
                )}
                {missedSchedule.recoveryScores.length > 0 && (
                  <div className="text-muted-foreground border-t pt-3 text-xs">
                    Recovery scores (30d):{' '}
                    {missedSchedule.recoveryScores
                      .map(
                        r =>
                          `${r.jobId}=${(r.score * 100).toFixed(0)}% (missed ${r.missedJobs}, recovered ${r.recoveredJobs})`
                      )
                      .join(' · ')}
                  </div>
                )}
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Detected</TableHead>
                        <TableHead>Status</TableHead>
                        {mutateOk && <TableHead className="text-right" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missedSchedule.recentMissedAlerts.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={mutateOk ? 5 : 4}
                            className="text-muted-foreground text-sm"
                          >
                            No recent missed alerts.
                          </TableCell>
                        </TableRow>
                      ) : (
                        missedSchedule.recentMissedAlerts.map(row => (
                          <TableRow key={row.alertId}>
                            <TableCell className="font-mono text-xs">
                              {row.jobId}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.expectedTime}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.detectedTime}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.status}
                            </TableCell>
                            {mutateOk && (
                              <TableCell className="text-right">
                                {row.status === 'PENDING' ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      void onRecoverMissedJob(
                                        row.jobId,
                                        row.alertId
                                      )
                                    }
                                    disabled={loading}
                                  >
                                    Recover missed job
                                  </Button>
                                ) : null}
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job operations control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <p className="text-muted-foreground text-sm">
              Enable or disable registry jobs, retry failures, reset schedule
              anchors, tune recovery timing, inspect execution history, and
              export recovery audits. Recovery guard override is admin-only.
            </p>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Registry</h3>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      {mutateOk && (
                        <TableHead className="text-right">Enabled</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {govRegistry.map(j => (
                      <TableRow key={j.jobId}>
                        <TableCell className="font-mono text-xs">
                          {j.jobId}
                        </TableCell>
                        <TableCell className="text-sm">{j.jobName}</TableCell>
                        <TableCell>
                          {j.isEnabled ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">
                              ACTIVE
                            </Badge>
                          ) : (
                            <Badge variant="secondary">DISABLED</Badge>
                          )}
                        </TableCell>
                        {mutateOk && (
                          <TableCell className="text-right">
                            <Switch
                              checked={j.isEnabled !== 0}
                              onCheckedChange={v => {
                                void (async () => {
                                  try {
                                    await setWorkflowBackgroundJobEnabled(
                                      j.jobId,
                                      v,
                                      callerRole
                                    );
                                    toast.success(
                                      v ? 'Job enabled' : 'Job disabled'
                                    );
                                    await loadCore();
                                  } catch (e) {
                                    toast.error(String(e));
                                  }
                                })();
                              }}
                              disabled={loading}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-3 border-t pt-6">
              <h3 className="text-sm font-medium">Manual retry</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1 space-y-1">
                  <Label className="text-xs">Execution ID</Label>
                  <Input
                    value={govRetryExecId}
                    onChange={e => setGovRetryExecId(e.target.value)}
                    placeholder="uuid…"
                    disabled={!mutateOk}
                  />
                </div>
                {mutateOk && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={loading || !govRetryExecId.trim()}
                    onClick={() => {
                      void (async () => {
                        try {
                          const id = await retryFailedJobExecution(
                            govRetryExecId.trim(),
                            callerRole
                          );
                          toast.success(`Retry started: ${id}`);
                          setGovRetryExecId('');
                          await loadCore();
                        } catch (e) {
                          toast.error(String(e));
                        }
                      })();
                    }}
                  >
                    Retry job
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] space-y-1">
                  <Label className="text-xs">Job (latest failed)</Label>
                  <Select
                    value={govPanelJobId}
                    onValueChange={setGovPanelJobId}
                    disabled={!mutateOk}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {govRegistry.map(j => (
                        <SelectItem key={j.jobId} value={j.jobId}>
                          {j.jobId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {mutateOk && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={loading}
                    onClick={() => {
                      void (async () => {
                        try {
                          const id = await retryLatestFailedJob(
                            govPanelJobId.trim(),
                            callerRole
                          );
                          toast.success(`Retry started: ${id}`);
                          await loadCore();
                        } catch (e) {
                          toast.error(String(e));
                        }
                      })();
                    }}
                  >
                    Retry latest failed
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t pt-6">
              <h3 className="text-sm font-medium">
                Schedule anchor and recovery tuning
              </h3>
              <div className="flex flex-wrap gap-2">
                {mutateOk && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => {
                      void (async () => {
                        try {
                          await resetJobScheduleAnchor(
                            govPanelJobId.trim(),
                            callerRole
                          );
                          toast.success(
                            'Schedule anchor reset; pending missed cleared'
                          );
                          await loadCore();
                        } catch (e) {
                          toast.error(String(e));
                        }
                      })();
                    }}
                  >
                    Reset schedule anchor
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Grace (minutes)</Label>
                  <Input
                    value={govTuneGrace}
                    onChange={e => setGovTuneGrace(e.target.value)}
                    disabled={!mutateOk}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Recovery delay (sec)</Label>
                  <Input
                    value={govTuneDelay}
                    onChange={e => setGovTuneDelay(e.target.value)}
                    disabled={!mutateOk}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max recovery attempts</Label>
                  <Input
                    value={govTuneMax}
                    onChange={e => setGovTuneMax(e.target.value)}
                    disabled={!mutateOk}
                    inputMode="numeric"
                  />
                </div>
              </div>
              {mutateOk && (
                <Button
                  type="button"
                  size="sm"
                  disabled={loading}
                  onClick={() => {
                    void (async () => {
                      try {
                        await updateJobScheduleExpectations(
                          govPanelJobId.trim(),
                          callerRole,
                          {
                            gracePeriodMinutes: govTuneGrace.trim()
                              ? Number(govTuneGrace)
                              : null,
                            recoveryDelaySec: govTuneDelay.trim()
                              ? Number(govTuneDelay)
                              : null,
                            maxRecoveryAttempts: govTuneMax.trim()
                              ? Number(govTuneMax)
                              : null,
                          }
                        );
                        toast.success('Schedule expectations updated');
                        await loadCore();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    })();
                  }}
                >
                  Save recovery tuning
                </Button>
              )}
            </div>

            {isAdminRole && (
              <div className="space-y-2 border-t pt-6">
                <h3 className="text-sm font-medium">
                  Recovery guard override (admin)
                </h3>
                <p className="text-muted-foreground text-xs">
                  Re-enables a job disabled by the recovery guard. Logged as
                  manual_override_event.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="max-w-md"
                    value={govOverrideReason}
                    onChange={e => setGovOverrideReason(e.target.value)}
                    placeholder="Reason for override (required)"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={loading || !govOverrideReason.trim()}
                    onClick={() => {
                      void (async () => {
                        try {
                          await recoveryGuardOverrideReenable(
                            govPanelJobId.trim(),
                            govOverrideReason.trim(),
                            callerRole
                          );
                          toast.success('Job re-enabled (override logged)');
                          setGovOverrideReason('');
                          await loadCore();
                        } catch (e) {
                          toast.error(String(e));
                        }
                      })();
                    }}
                  >
                    Override and re-enable job
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 border-t pt-6">
              <h3 className="text-sm font-medium">Manual override log</h3>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Job</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {govOverrideLog.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-muted-foreground text-sm"
                        >
                          No manual overrides yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      govOverrideLog.map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs">
                            {o.createdAt}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {o.jobId}
                          </TableCell>
                          <TableCell className="text-xs">{o.action}</TableCell>
                          <TableCell className="text-xs">
                            {o.callerRole}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2 border-t pt-6">
              <h3 className="text-sm font-medium">Job dependencies</h3>
              {govDependencies ? (
                <ul className="text-muted-foreground list-inside list-disc text-sm">
                  {govDependencies.edges.map((e, i) => (
                    <li key={`${e.parentJobId}-${e.dependentJobId}-${i}`}>
                      <span className="font-mono">{e.parentJobId}</span> →{' '}
                      <span className="font-mono">{e.dependentJobId}</span>{' '}
                      <span className="text-xs">({e.dependencyType})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
              {govDependencies && (
                <p className="text-muted-foreground text-xs">
                  Suggested daily order:{' '}
                  {govDependencies.suggestedDailyOrder.join(' → ')}
                </p>
              )}
            </div>

            <div className="space-y-2 border-t pt-6">
              <h3 className="text-sm font-medium">
                Failure root-cause hints (7d)
              </h3>
              {govFailureInsights ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Errors</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {govFailureInsights.failureClusters7d
                          .slice(0, 20)
                          .map((c, i) => (
                            <TableRow key={`${c.jobId}-${i}`}>
                              <TableCell className="font-mono text-xs">
                                {c.jobId}
                              </TableCell>
                              <TableCell
                                className="max-w-[240px] truncate text-xs"
                                title={c.errorMessage}
                              >
                                {c.errorMessage || '—'}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {c.count}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {govFailureInsights.countsByStatus7d
                          .slice(0, 30)
                          .map((c, i) => (
                            <TableRow key={`${c.jobId}-${c.status}-${i}`}>
                              <TableCell className="font-mono text-xs">
                                {c.jobId}
                              </TableCell>
                              <TableCell className="text-xs">
                                {c.status}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {c.count}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">Loading…</span>
              )}
              <p className="text-muted-foreground text-xs">
                {govFailureInsights?.notes}
              </p>
            </div>

            <div className="space-y-3 border-t pt-6">
              <h3 className="text-sm font-medium">
                Execution history and timeline ({govPanelJobId})
              </h3>
              {govTimeline && govTimeline.events.length > 0 ? (
                <div className="bg-muted/30 flex h-8 w-full items-end gap-px overflow-x-auto rounded border p-1">
                  {govTimeline.events.map(ev => {
                    const w = Math.max(
                      2,
                      Math.min(24, (ev.executionTimeMs ?? 4000) / 2000)
                    );
                    const st = ev.status.toUpperCase();
                    const bg =
                      st === 'SUCCESS'
                        ? 'bg-emerald-500'
                        : st === 'FAILED'
                          ? 'bg-red-500'
                          : st === 'TIMEOUT'
                            ? 'bg-amber-500'
                            : st === 'MISSED'
                              ? 'bg-violet-500'
                              : st === 'RETRY'
                                ? 'bg-sky-500'
                                : 'bg-muted-foreground';
                    return (
                      <div
                        key={ev.executionId}
                        className={`${bg} shrink-0 rounded-sm opacity-90`}
                        style={{ width: `${w}px`, minHeight: '22px' }}
                        title={`${ev.status} @ ${ev.startedAt}`}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  No events in window.
                </p>
              )}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Execution</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Ms</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Retry</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {govExecLog.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-muted-foreground text-sm"
                        >
                          No rows (pick a job above).
                        </TableCell>
                      </TableRow>
                    ) : (
                      govExecLog.map(r => (
                        <TableRow key={r.executionId}>
                          <TableCell className="font-mono text-[10px]">
                            {r.executionId.slice(0, 8)}…
                          </TableCell>
                          <TableCell className="text-xs">{r.status}</TableCell>
                          <TableCell className="text-xs">
                            {r.startedAt}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.executionTimeMs ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.recordsProcessed}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.retryCount}
                          </TableCell>
                          <TableCell
                            className="max-w-[200px] truncate text-xs"
                            title={r.errorMessage ?? ''}
                          >
                            {r.errorMessage ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-6">
              {mutateOk && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => {
                    void (async () => {
                      try {
                        await simulateBackgroundJobs(callerRole);
                        toast.success('Simulation complete (read-only)');
                      } catch (e) {
                        toast.error(String(e));
                      }
                    })();
                  }}
                >
                  Simulate recovery (read-only)
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={() => {
                  void (async () => {
                    try {
                      const csv =
                        await exportWorkflowJobRecoveryLogCsv(callerRole);
                      const blob = new Blob([csv], {
                        type: 'text/csv;charset=utf-8',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `workflow_job_recovery_log_${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Recovery log exported');
                    } catch (e) {
                      toast.error(String(e));
                    }
                  })();
                }}
              >
                Export recovery log CSV
              </Button>
            </div>
          </CardContent>
        </Card>

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
                <Select
                  value={lcRuleId || undefined}
                  onValueChange={setLcRuleId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rule for versions & deployments" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRules.map(rule => (
                      <SelectItem key={rule.ruleId} value={rule.ruleId}>
                        {rule.ruleName} ({rule.ruleId})
                      </SelectItem>
                    ))}
                  </SelectContent>
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
                  onClick={() => void loadLifecycle()}
                >
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Refresh lifecycle
                </Button>
              </div>
            </div>

            {mutateOk && lcRuleId.trim() ? (
              <div className="bg-muted/40 space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium">
                  New version from live rule
                </p>
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
                    <SelectContent>
                      {['DRAFT', 'TESTING', 'READY', 'DEPLOYED', 'FAILED'].map(
                        s => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
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
                  <Label className="text-xs">
                    Request approval (version id)
                  </Label>
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
                  <Label className="text-xs">
                    Record decision (approval id)
                  </Label>
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
                        Admin: acknowledge HIGH/CRITICAL safety override for
                        this deploy (audited)
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
                onClick={async () => {
                  try {
                    setDepSafetyDash(
                      await getDeploymentSafetyDashboard(callerRole)
                    );
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                Safety dashboard
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!viewOk}
                onClick={async () => {
                  try {
                    setDepSafetyReco(
                      await getSmartDeploymentRecommendations(callerRole)
                    );
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                Timing recommendations
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!viewOk || !lcRuleId.trim() || !lcDeployVid.trim()}
                onClick={async () => {
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
                }}
              >
                Evaluate safety
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!viewOk || !lcRuleId.trim() || !lcDeployVid.trim()}
                onClick={async () => {
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
                }}
              >
                Dry-run
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!viewOk || !lcRuleId.trim() || !lcDeployVid.trim()}
                onClick={async () => {
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
                }}
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
                  onClick={async () => {
                    try {
                      await setDeploymentProdSafetyEnforcement(
                        true,
                        callerRole
                      );
                      toast.success('Production safety enforcement ON');
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                >
                  Enable prod safety gate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await setDeploymentProdSafetyEnforcement(
                        false,
                        callerRole
                      );
                      toast.success('Production safety enforcement OFF');
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Automation execution log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Rule ID</Label>
                <Input
                  value={logRuleId}
                  onChange={e => setLogRuleId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Action</Label>
                <Input
                  value={logAction}
                  onChange={e => setLogAction(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Result status</Label>
                <Select value={logStatus} onValueChange={setLogStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">Any</SelectItem>
                    <SelectItem value="OK">OK</SelectItem>
                    <SelectItem value="WARN">WARN</SelectItem>
                    <SelectItem value="ERROR">ERROR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date from</Label>
                <Input
                  type="date"
                  value={logFrom}
                  onChange={e => setLogFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date to</Label>
                <Input
                  type="date"
                  value={logTo}
                  onChange={e => setLogTo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Search target / payload</Label>
                <Input
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadLogs()}
            >
              Apply log filters
            </Button>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executed</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Res</TableHead>
                  <TableHead className="text-right">Δh</TableHead>
                  <TableHead className="text-right">ms</TableHead>
                  <TableHead className="text-right">CU</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logRows.map(row => (
                  <TableRow key={row.automationId}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {row.executedAt}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.ruleId || '—'}
                    </TableCell>
                    <TableCell className="text-xs">{row.actionTaken}</TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">
                      {row.targetEntity}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.casesResolved ?? 0}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {(row.resolutionTimeReductionHours ?? 0).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.actualExecutionTimeMs ?? 0}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {(row.estimatedCostUnits ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs">
                      {row.executionResult}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rule change history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Prev → New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map(c => (
                  <TableRow key={c.changeId}>
                    <TableCell className="text-xs">{c.changedAt}</TableCell>
                    <TableCell className="text-xs">{c.ruleId || '—'}</TableCell>
                    <TableCell className="text-xs">{c.changeType}</TableCell>
                    <TableCell className="text-xs">{c.changedBy}</TableCell>
                    <TableCell className="text-xs">
                      {c.previousValue} → {c.newValue}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
