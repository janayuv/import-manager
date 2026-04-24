import { invoke } from '@tauri-apps/api/core';

export type WorkflowDecisionRuleRow = {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  conditionExpression: string;
  actionType: string;
  priority: number;
  enabled: number;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationLogRow = {
  automationId: string;
  ruleId: string;
  actionTaken: string;
  targetEntity: string;
  executedAt: string;
  executionResult: string;
  casesResolved: number;
  casesAssigned: number;
  priorityAdjustments: number;
  slaImprovements: number;
  resolutionTimeReductionHours: number;
  actualExecutionTimeMs: number;
  recordsProcessed: number;
  estimatedCostUnits: number;
};

export type AutomationLogQuery = {
  ruleId?: string;
  actionTaken?: string;
  dateFrom?: string;
  dateTo?: string;
  resultStatus?: string;
  search?: string;
  limit?: number;
};

export type AdaptiveSlaAdjustmentRow = {
  id: string;
  exceptionType: string;
  snapshotDate: string;
  previousHours: number;
  adjustedHours: number;
  factorsJson: string;
  createdAt: string;
};

export type WorkflowRuleChangeRow = {
  changeId: string;
  ruleId: string;
  changedBy: string;
  changeType: string;
  previousValue: string;
  newValue: string;
  changedAt: string;
};

export type AutomationHealthSnapshot = {
  masterEnabled: boolean;
  paused: boolean;
  lastCycleAt: string;
  actionsLast24h: number;
  errorsLast24h: number;
  status: string;
};

export type AutomationImpactSummary = {
  autoResolve7d: number;
  autoAssign7d: number;
  priorityAdjust7d: number;
  autoRepair7d: number;
  escalationsLogged7d: number;
  cycleSummaries7d: number;
};

export type AutomationCycleReport = {
  skippedPaused: boolean;
  autoResolved: number;
  autoAssigned: number;
  priorityAdjusted: number;
  repairs: number;
  adaptiveSlaRows: number;
};

export type AutomationGuardrailsInput = {
  maxAutoResolvePerHour?: number;
  maxPriorityAdjustsPerCycle?: number;
  automationPauseDurationMinutes?: number;
};

export function normalizeAutomationRole(role: string): string {
  return role.replace(/\s+/g, '').toLowerCase();
}

export function canViewAutomationConsole(role: string | undefined): boolean {
  const n = normalizeAutomationRole(role ?? '');
  return (
    n.includes('admin') ||
    n.includes('automationmanager') ||
    n.includes('viewer')
  );
}

export function canMutateAutomationRules(role: string | undefined): boolean {
  const n = normalizeAutomationRole(role ?? '');
  return n.includes('admin') || n.includes('automationmanager');
}

export async function listWorkflowDecisionRules(
  callerRole: string
): Promise<WorkflowDecisionRuleRow[]> {
  return invoke<WorkflowDecisionRuleRow[]>('list_workflow_decision_rules', {
    callerRole,
  });
}

export async function setWorkflowDecisionRuleEnabled(
  ruleId: string,
  enabled: boolean,
  callerRole: string,
  changedBy: string
): Promise<void> {
  await invoke('set_workflow_decision_rule_enabled', {
    ruleId,
    enabled,
    callerRole,
    changedBy,
  });
}

export async function setWorkflowAutomationMasterEnabled(
  enabled: boolean,
  callerRole: string,
  changedBy: string
): Promise<void> {
  await invoke('set_workflow_automation_master_enabled', {
    enabled,
    callerRole,
    changedBy,
  });
}

export async function setAutomationGuardrails(
  input: AutomationGuardrailsInput,
  callerRole: string
): Promise<void> {
  await invoke('set_automation_guardrails', { input, callerRole });
}

export async function setAdaptiveSlaApplyEnabled(
  enabled: boolean,
  callerRole: string,
  changedBy: string
): Promise<void> {
  await invoke('set_adaptive_sla_apply_enabled', {
    enabled,
    callerRole,
    changedBy,
  });
}

export async function applyAdaptiveSlaDecision(
  accept: boolean,
  callerRole: string,
  changedBy: string
): Promise<number> {
  return invoke<number>('apply_adaptive_sla_decision', {
    accept,
    callerRole,
    changedBy,
  });
}

export async function queryWorkflowAutomationLog(
  query: AutomationLogQuery,
  callerRole: string
): Promise<AutomationLogRow[]> {
  return invoke<AutomationLogRow[]>('query_workflow_automation_log', {
    query,
    callerRole,
  });
}

export async function getAutomationHealth(
  callerRole: string
): Promise<AutomationHealthSnapshot> {
  return invoke<AutomationHealthSnapshot>('get_automation_health', {
    callerRole,
  });
}

export async function getAutomationImpactSummary(
  callerRole: string
): Promise<AutomationImpactSummary> {
  return invoke<AutomationImpactSummary>('get_automation_impact_summary', {
    callerRole,
  });
}

export async function listAdaptiveSlaAdjustments(
  callerRole: string,
  limit?: number
): Promise<AdaptiveSlaAdjustmentRow[]> {
  return invoke<AdaptiveSlaAdjustmentRow[]>('list_adaptive_sla_adjustments', {
    limit,
    callerRole,
  });
}

export async function listWorkflowRuleChangeLog(
  callerRole: string,
  limit?: number
): Promise<WorkflowRuleChangeRow[]> {
  return invoke<WorkflowRuleChangeRow[]>('list_workflow_rule_change_log', {
    limit,
    callerRole,
  });
}

export async function runWorkflowAutomationCycle(
  callerRole: string
): Promise<AutomationCycleReport> {
  return invoke<AutomationCycleReport>(
    'run_workflow_automation_cycle_command',
    {
      callerRole,
    }
  );
}

export async function simulateRuleExecution(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('simulate_rule_execution_command', {
    callerRole,
  });
}

export type RuleEffectivenessMetricRow = {
  ruleId: string;
  metricDate: string;
  actionsTaken: number;
  successfulActions: number;
  failedActions: number;
  casesResolved: number;
  casesAssigned: number;
  priorityAdjustments: number;
  slaImprovements: number;
  avgResolutionTimeSaved: number;
};

export type AutomationRoiMetricRow = {
  snapshotDate: string;
  timeSavedHoursEstimate: number;
  manualWorkloadReductionPct: number;
  slaComplianceImprovementPct: number;
  resolutionSpeedIncreasePct: number;
  factorsJson: string;
};

export type AutomationStabilityAlertRow = {
  id: string;
  alertType: string;
  severity: string;
  detailsJson: string;
  createdAt: string;
  acknowledged: number;
};

export type AutomationBenchmarkRow = {
  id: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  metricsJson: string;
  createdAt: string;
};

export async function getRulePerformanceDashboard(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('get_rule_performance_dashboard', {
    callerRole,
  });
}

export async function listRuleEffectivenessMetrics(
  callerRole: string,
  days?: number
): Promise<RuleEffectivenessMetricRow[]> {
  return invoke<RuleEffectivenessMetricRow[]>(
    'list_rule_effectiveness_metrics',
    { callerRole, days }
  );
}

export async function listAutomationRoiMetrics(
  callerRole: string,
  limit?: number
): Promise<AutomationRoiMetricRow[]> {
  return invoke<AutomationRoiMetricRow[]>('list_automation_roi_metrics', {
    callerRole,
    limit,
  });
}

export async function listAutomationBenchmarkHistory(
  callerRole: string,
  limit?: number
): Promise<AutomationBenchmarkRow[]> {
  return invoke<AutomationBenchmarkRow[]>('list_automation_benchmark_history', {
    callerRole,
    limit,
  });
}

export async function listAutomationStabilityAlerts(
  callerRole: string,
  includeAcknowledged?: boolean,
  limit?: number
): Promise<AutomationStabilityAlertRow[]> {
  return invoke<AutomationStabilityAlertRow[]>(
    'list_automation_stability_alerts',
    { callerRole, includeAcknowledged, limit }
  );
}

export async function acknowledgeAutomationStabilityAlert(
  alertId: string,
  callerRole: string
): Promise<void> {
  await invoke('acknowledge_automation_stability_alert', {
    alertId,
    callerRole,
  });
}

export async function generateRuleOptimizationRecommendations(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'generate_rule_optimization_recommendations_command',
    { callerRole }
  );
}

export async function generateAutomationLearningSuggestions(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'generate_automation_learning_suggestions_command',
    { callerRole }
  );
}

export async function simulateMultipleRuleSets(
  callerRole: string,
  stagedVersionId?: string | null,
  tenantId?: string | null,
  environmentId?: string | null
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'simulate_multiple_rule_sets_command',
    {
      callerRole,
      stagedVersionId: stagedVersionId ?? null,
      tenantId: tenantId ?? null,
      environmentId: environmentId ?? null,
    }
  );
}

export async function rollbackAutomationAction(
  originalAutomationId: string,
  rollbackType: 'AUTO_RESOLVE' | 'AUTO_ASSIGN' | 'PRIORITY_ADJUST',
  performedBy: string,
  callerRole: string
): Promise<string> {
  return invoke<string>('rollback_automation_action', {
    originalAutomationId,
    rollbackType,
    performedBy,
    callerRole,
  });
}

export type RuleExecutionCostEstimateRow = {
  ruleId: string;
  actionType: string;
  estimatedCpuCost: number;
  estimatedIoCost: number;
  estimatedTimeMs: number;
  estimatedMemoryCost: number;
  costWeight: number;
  updatedAt: string;
};

export type AutomationCostLimitsRow = {
  id: string;
  maxCostUnitsPerCycle: number;
  maxExecutionTimePerCycleMs: number;
  maxRecordsProcessedPerCycle: number;
  updatedAt: string;
};

export type AutomationCapacityLoadRow = {
  id: string;
  snapshotAt: string;
  currentActiveRules: number;
  actionsPerCycle: number;
  recordsProcessedPerCycle: number;
  peakCycleDurationMs: number;
  queueDepth: number;
  loadPercentage: number;
  loadState: string;
  totalCostUnitsCycle: number;
  factorsJson: string;
};

export type DailyAutomationEconomicsRow = {
  snapshotDate: string;
  benefitScore: number;
  costScore: number;
  efficiencyGain: number;
  economicsIndex: number;
  factorsJson: string;
};

export type RuleCostEfficiencyMetricRow = {
  ruleId: string;
  metricDate: string;
  totalCostUnits: number;
  totalActions: number;
  totalResolutionGain: number;
  costPerResolution: number;
  efficiencyScore: number;
};

export async function getAutomationCostVsBenefitDashboard(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'get_automation_cost_vs_benefit_dashboard',
    { callerRole }
  );
}

export async function listAutomationCapacityLoad(
  callerRole: string,
  limit?: number
): Promise<AutomationCapacityLoadRow[]> {
  return invoke<AutomationCapacityLoadRow[]>('list_automation_capacity_load', {
    callerRole,
    limit,
  });
}

export async function listDailyAutomationEconomicsIndex(
  callerRole: string,
  limit?: number
): Promise<DailyAutomationEconomicsRow[]> {
  return invoke<DailyAutomationEconomicsRow[]>(
    'list_daily_automation_economics_index',
    { callerRole, limit }
  );
}

export async function getAutomationCostLimits(
  callerRole: string
): Promise<AutomationCostLimitsRow> {
  return invoke<AutomationCostLimitsRow>('get_automation_cost_limits', {
    callerRole,
  });
}

export async function setAutomationCostLimits(
  input: {
    maxCostUnitsPerCycle?: number;
    maxExecutionTimePerCycleMs?: number;
    maxRecordsProcessedPerCycle?: number;
  },
  callerRole: string
): Promise<void> {
  await invoke('set_automation_cost_limits', { input, callerRole });
}

export async function listRuleExecutionCostEstimates(
  callerRole: string
): Promise<RuleExecutionCostEstimateRow[]> {
  return invoke<RuleExecutionCostEstimateRow[]>(
    'list_rule_execution_cost_estimates',
    { callerRole }
  );
}

export async function upsertRuleExecutionCostEstimate(
  input: {
    ruleId: string;
    actionType: string;
    estimatedCpuCost?: number;
    estimatedIoCost?: number;
    estimatedTimeMs?: number;
    estimatedMemoryCost?: number;
    costWeight?: number;
  },
  callerRole: string
): Promise<void> {
  await invoke('upsert_rule_execution_cost_estimate', { input, callerRole });
}

export async function listRuleCostEfficiencyMetrics(
  callerRole: string,
  days?: number
): Promise<RuleCostEfficiencyMetricRow[]> {
  return invoke<RuleCostEfficiencyMetricRow[]>(
    'list_rule_cost_efficiency_metrics',
    { callerRole, days }
  );
}

export async function detectInefficientRules(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('detect_inefficient_rules_command', {
    callerRole,
  });
}

export async function generateCostOptimizationSuggestions(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'generate_cost_optimization_suggestions_command',
    { callerRole }
  );
}

export async function predictiveCapacityForecast(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'predictive_capacity_forecast_command',
    { callerRole }
  );
}

export async function getAppMetadata(key: string): Promise<string | null> {
  return invoke<string | null>('get_app_metadata_value', { key });
}

export async function setAppMetadata(
  key: string,
  value: string
): Promise<void> {
  await invoke('set_app_metadata_value', { key, value });
}

/** --- Rule deployment lifecycle (versioning, staging, approvals, canary) --- */

export type WorkflowRuleVersionRow = {
  versionId: string;
  ruleId: string;
  tenantId: string;
  environmentId: string;
  versionNumber: number;
  ruleDefinitionJson: string;
  createdBy: string;
  createdAt: string;
  isActive: number;
  changeReason: string;
};

export type WorkflowRuleStagingRow = {
  stagingId: string;
  ruleId: string;
  versionId: string;
  stagingEnvironment: string;
  createdAt: string;
  status: string;
};

export type WorkflowRuleDeploymentLogRow = {
  deploymentId: string;
  ruleId: string;
  versionId: string;
  deployedBy: string;
  deploymentStatus: string;
  deploymentTime: string;
  rollbackFlag: number;
  detailsJson: string;
};

export type WorkflowRuleApprovalRow = {
  approvalId: string;
  ruleId: string;
  versionId: string;
  approvedBy: string;
  approvalStatus: string;
  approvalTime: string;
  requestedBy: string;
  createdAt: string;
};

export type CanaryRuleDeploymentRow = {
  id: string;
  tenantId: string;
  ruleId: string;
  versionId: string;
  sampleSizePercentage: number;
  deploymentStatus: string;
  createdAt: string;
};

export type RuleDeploymentImpactRow = {
  id: string;
  ruleId: string;
  versionId: string;
  snapshotAt: string;
  failureRate: number;
  costUnitsDelta: number;
  resolutionGainDelta: number;
  executionCount: number;
  factorsJson: string;
};

export type CreateWorkflowRuleVersionInput = {
  ruleId: string;
  ruleDefinition: Record<string, unknown>;
  changeReason: string;
  createdBy: string;
  tenantId?: string | null;
  environmentId?: string | null;
};

export type DeploymentFreezeStatus = {
  deploymentFrozen: boolean;
  requiresApproval: boolean;
};

export async function listWorkflowRuleVersions(
  ruleId: string,
  callerRole: string,
  tenantId?: string | null,
  environmentId?: string | null
): Promise<WorkflowRuleVersionRow[]> {
  return invoke<WorkflowRuleVersionRow[]>('list_workflow_rule_versions', {
    ruleId,
    callerRole,
    tenantId: tenantId ?? null,
    environmentId: environmentId ?? null,
  });
}

export async function createWorkflowRuleVersion(
  input: CreateWorkflowRuleVersionInput,
  callerRole: string
): Promise<string> {
  return invoke<string>('create_workflow_rule_version', { input, callerRole });
}

export async function compareRuleVersions(
  versionIdA: string,
  versionIdB: string,
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('compare_rule_versions_command', {
    versionIdA,
    versionIdB,
    callerRole,
  });
}

export async function createWorkflowRuleStaging(
  ruleId: string,
  versionId: string,
  callerRole: string,
  stagingEnvironment?: string | null
): Promise<string> {
  return invoke<string>('create_workflow_rule_staging', {
    ruleId,
    versionId,
    stagingEnvironment: stagingEnvironment ?? null,
    callerRole,
  });
}

export async function updateWorkflowRuleStagingStatus(
  stagingId: string,
  status: string,
  callerRole: string
): Promise<void> {
  await invoke('update_workflow_rule_staging_status', {
    stagingId,
    status,
    callerRole,
  });
}

export async function listWorkflowRuleStaging(
  callerRole: string,
  ruleId?: string | null
): Promise<WorkflowRuleStagingRow[]> {
  return invoke<WorkflowRuleStagingRow[]>('list_workflow_rule_staging', {
    callerRole,
    ruleId: ruleId ?? null,
  });
}

export async function submitRuleVersionApproval(
  ruleId: string,
  versionId: string,
  requestedBy: string,
  callerRole: string
): Promise<string> {
  return invoke<string>('submit_rule_version_approval', {
    ruleId,
    versionId,
    requestedBy,
    callerRole,
  });
}

export async function recordRuleApprovalDecision(
  approvalId: string,
  approve: boolean,
  approvedBy: string,
  callerRole: string
): Promise<void> {
  await invoke('record_rule_approval_decision', {
    approvalId,
    approve,
    approvedBy,
    callerRole,
  });
}

export async function listWorkflowRuleApprovals(
  callerRole: string,
  ruleId?: string | null
): Promise<WorkflowRuleApprovalRow[]> {
  return invoke<WorkflowRuleApprovalRow[]>('list_workflow_rule_approvals', {
    callerRole,
    ruleId: ruleId ?? null,
  });
}

export async function deployRuleVersion(
  ruleId: string,
  versionId: string,
  deployedBy: string,
  callerRole: string,
  safetyOverrideAcknowledged?: boolean | null
): Promise<void> {
  await invoke('deploy_rule_version_command', {
    ruleId,
    versionId,
    deployedBy,
    callerRole,
    safetyOverrideAcknowledged: safetyOverrideAcknowledged ?? null,
  });
}

export async function validateDeploymentSafety(
  ruleId: string,
  versionId: string,
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('validate_deployment_safety_command', {
    ruleId,
    versionId,
    callerRole,
  });
}

export async function runDeploymentDryRun(
  ruleId: string,
  versionId: string,
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('run_deployment_dry_run_command', {
    ruleId,
    versionId,
    callerRole,
  });
}

export async function getDeploymentSafetyDashboard(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'get_deployment_safety_dashboard_command',
    { callerRole }
  );
}

export async function getSmartDeploymentRecommendations(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'get_smart_deployment_recommendations_command',
    { callerRole }
  );
}

export async function generateDeploymentSafetyAuditReport(
  ruleId: string,
  versionId: string,
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>(
    'generate_deployment_safety_audit_report_command',
    { ruleId, versionId, callerRole }
  );
}

export async function listDeploymentConflictLog(
  callerRole: string,
  limit?: number | null
): Promise<Record<string, unknown>[]> {
  return invoke<Record<string, unknown>[]>(
    'list_deployment_conflict_log_command',
    { callerRole, limit: limit ?? null }
  );
}

export async function listDeploymentRiskTimeline(
  callerRole: string,
  limit?: number | null
): Promise<Record<string, unknown>[]> {
  return invoke<Record<string, unknown>[]>(
    'list_deployment_risk_timeline_command',
    { callerRole, limit: limit ?? null }
  );
}

export async function setDeploymentProdSafetyEnforcement(
  enabled: boolean,
  callerRole: string
): Promise<void> {
  await invoke('set_deployment_prod_safety_enforcement_command', {
    enabled,
    callerRole,
  });
}

export async function rollbackRuleVersion(
  ruleId: string,
  targetVersionId: string,
  performedBy: string,
  callerRole: string,
  environmentId?: string | null
): Promise<void> {
  await invoke('rollback_rule_version_command', {
    ruleId,
    targetVersionId,
    performedBy,
    callerRole,
    environmentId: environmentId ?? null,
  });
}

export async function listWorkflowRuleDeploymentLog(
  callerRole: string,
  ruleId?: string | null,
  limit?: number | null
): Promise<WorkflowRuleDeploymentLogRow[]> {
  return invoke<WorkflowRuleDeploymentLogRow[]>(
    'list_workflow_rule_deployment_log',
    { callerRole, ruleId: ruleId ?? null, limit: limit ?? null }
  );
}

export async function setCanaryRuleDeployment(
  ruleId: string,
  versionId: string,
  sampleSizePercentage: number,
  callerRole: string
): Promise<void> {
  await invoke('set_canary_rule_deployment', {
    ruleId,
    versionId,
    sampleSizePercentage,
    callerRole,
  });
}

export async function clearCanaryRuleDeployment(
  ruleId: string,
  callerRole: string
): Promise<void> {
  await invoke('clear_canary_rule_deployment', { ruleId, callerRole });
}

export async function listCanaryRuleDeployments(
  callerRole: string
): Promise<CanaryRuleDeploymentRow[]> {
  return invoke<CanaryRuleDeploymentRow[]>('list_canary_rule_deployments', {
    callerRole,
  });
}

export async function setDeploymentFreeze(
  frozen: boolean,
  callerRole: string
): Promise<void> {
  await invoke('set_deployment_freeze', { frozen, callerRole });
}

export async function getDeploymentFreezeStatus(
  callerRole: string
): Promise<DeploymentFreezeStatus> {
  return invoke<DeploymentFreezeStatus>('get_deployment_freeze_status', {
    callerRole,
  });
}

export async function setDeploymentRequiresApproval(
  required: boolean,
  callerRole: string
): Promise<void> {
  await invoke('set_deployment_requires_approval', {
    required,
    callerRole,
  });
}

export async function listRuleDeploymentImpactMetrics(
  callerRole: string,
  ruleId?: string | null,
  limit?: number | null
): Promise<RuleDeploymentImpactRow[]> {
  return invoke<RuleDeploymentImpactRow[]>(
    'list_rule_deployment_impact_metrics',
    { callerRole, ruleId: ruleId ?? null, limit: limit ?? null }
  );
}

export async function refreshRuleDeploymentImpactMetrics(
  ruleId: string,
  callerRole: string
): Promise<void> {
  await invoke('refresh_rule_deployment_impact_metrics', {
    ruleId,
    callerRole,
  });
}

export async function validateRuleDeployment(
  ruleId: string,
  versionId: string,
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('validate_rule_deployment_command', {
    ruleId,
    versionId,
    callerRole,
  });
}

export type WorkflowEnvironmentRow = {
  environmentId: string;
  environmentName: string;
  environmentType: string;
  isActive: number;
  createdAt: string;
};

export type WorkflowTenantRow = {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  createdAt: string;
};

export type WorkflowEnvironmentDeploymentLogRow = {
  deploymentId: string;
  tenantId: string;
  environmentId: string;
  ruleId: string;
  versionId: string;
  status: string;
  timestamp: string;
  detailsJson: string;
};

export async function listWorkflowEnvironments(
  callerRole: string
): Promise<WorkflowEnvironmentRow[]> {
  return invoke<WorkflowEnvironmentRow[]>('list_workflow_environments', {
    callerRole,
  });
}

export async function listWorkflowTenants(
  callerRole: string
): Promise<WorkflowTenantRow[]> {
  return invoke<WorkflowTenantRow[]>('list_workflow_tenants', { callerRole });
}

export async function getWorkflowExecutionContext(callerRole: string): Promise<{
  activeTenantId: string;
  executionEnvironmentId: string;
  defaultVersionEnvironmentId: string;
}> {
  return invoke('get_workflow_execution_context', { callerRole });
}

export async function setWorkflowActiveTenant(
  tenantId: string,
  callerRole: string
): Promise<void> {
  await invoke('set_workflow_active_tenant', { tenantId, callerRole });
}

export async function setWorkflowExecutionEnvironment(
  environmentId: string,
  callerRole: string
): Promise<void> {
  await invoke('set_workflow_execution_environment', {
    environmentId,
    callerRole,
  });
}

export async function listWorkflowEnvironmentDeploymentLog(
  callerRole: string,
  environmentId?: string | null,
  tenantId?: string | null,
  limit?: number | null
): Promise<WorkflowEnvironmentDeploymentLogRow[]> {
  return invoke<WorkflowEnvironmentDeploymentLogRow[]>(
    'list_workflow_environment_deployment_log',
    {
      callerRole,
      environmentId: environmentId ?? null,
      tenantId: tenantId ?? null,
      limit: limit ?? null,
    }
  );
}

export async function getEnvironmentHealthDashboard(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('get_environment_health_dashboard', {
    callerRole,
  });
}

export async function getTenantPerformanceDashboard(
  callerRole: string,
  tenantId?: string | null
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('get_tenant_performance_dashboard', {
    callerRole,
    tenantId: tenantId ?? null,
  });
}

export async function promoteRuleVersion(
  sourceVersionId: string,
  targetEnvironmentId: string,
  promotedBy: string,
  callerRole: string
): Promise<string> {
  return invoke<string>('promote_rule_version_command', {
    sourceVersionId,
    targetEnvironmentId,
    promotedBy,
    callerRole,
  });
}

/** Background job monitoring — registry + execution health. */
export type BackgroundJobReliabilityRow = {
  score: number;
  successRate: number;
  failureRate: number;
  retryFrequency: number;
  sampleExecutions: number;
  updatedAt: string;
};

export type BackgroundJobLastExecution = {
  status: string;
  startedAt: string;
  completedAt: string | null;
  executionTimeMs: number | null;
  recordsProcessed: number;
  errorMessage: string | null;
};

export type BackgroundJobHealthRow = {
  jobId: string;
  lastExecution: BackgroundJobLastExecution | null;
  failures7d: number;
  avgExecutionMs7d: number;
  retryRows: number;
  reliability: BackgroundJobReliabilityRow | null;
};

export type BackgroundJobHealthDashboard = {
  jobs: BackgroundJobHealthRow[];
};

export async function getBackgroundJobHealthDashboard(
  callerRole: string
): Promise<BackgroundJobHealthDashboard> {
  return invoke<BackgroundJobHealthDashboard>(
    'get_background_job_health_dashboard_command',
    { callerRole }
  );
}

export type MissedJobAlertRow = {
  alertId: string;
  jobId: string;
  expectedTime: string;
  detectedTime: string;
  recoveryTriggered: number;
  status: string;
};

export type DailyMissedJobMetricsRow = {
  metricDate: string;
  missedRuns: number;
  recoverySuccess: number;
  recoveryFailures: number;
  driftWarnings: number;
  updatedAt: string;
};

export type JobRecoveryScoreRow = {
  jobId: string;
  score: number;
  missedJobs: number;
  recoveredJobs: number;
  windowDays: number;
  updatedAt: string;
};

export type MissedScheduleDashboard = {
  pendingMissed: number;
  recovered7d: number;
  missedExecutions7d: number;
  recoverySuccessRate30d: number;
  todayMetrics: DailyMissedJobMetricsRow | null;
  recentMissedAlerts: MissedJobAlertRow[];
  recoveryScores: JobRecoveryScoreRow[];
};

export async function getMissedScheduleDashboard(
  callerRole: string
): Promise<MissedScheduleDashboard> {
  return invoke<MissedScheduleDashboard>(
    'get_missed_schedule_dashboard_command',
    { callerRole }
  );
}

export async function recoverMissedJob(
  jobId: string,
  callerRole: string,
  alertId?: string | null
): Promise<string> {
  return invoke<string>('recover_missed_job_command', {
    jobId,
    alertId: alertId ?? null,
    callerRole,
  });
}

export async function detectMissedJobRuns(callerRole: string): Promise<number> {
  return invoke<number>('detect_missed_job_runs_command', { callerRole });
}

export type WorkflowBackgroundJobRow = {
  jobId: string;
  jobName: string;
  jobType: string;
  scheduleType: string;
  isEnabled: number;
  expectedDurationMs: number;
  maxRetries: number;
  retryDelaySec: number;
  createdAt: string;
  updatedAt: string;
};

export async function listWorkflowBackgroundJobs(
  callerRole: string
): Promise<WorkflowBackgroundJobRow[]> {
  return invoke<WorkflowBackgroundJobRow[]>(
    'list_workflow_background_jobs_command',
    { callerRole }
  );
}

export async function setWorkflowBackgroundJobEnabled(
  jobId: string,
  enabled: boolean,
  callerRole: string
): Promise<void> {
  await invoke('set_workflow_background_job_enabled_command', {
    jobId,
    enabled,
    callerRole,
  });
}

export async function resetJobScheduleAnchor(
  jobId: string,
  callerRole: string
): Promise<void> {
  await invoke('reset_job_schedule_anchor_command', { jobId, callerRole });
}

export async function recoveryGuardOverrideReenable(
  jobId: string,
  reason: string,
  callerRole: string
): Promise<void> {
  await invoke('recovery_guard_override_reenable_command', {
    jobId,
    reason,
    callerRole,
  });
}

export type WorkflowJobScheduleExpectationRow = {
  jobId: string;
  expectedIntervalMinutes: number;
  gracePeriodMinutes: number;
  lastExpectedRunAt: string | null;
  maxRecoveryAttempts: number;
  recoveryDelaySec: number;
  createdAt: string;
  updatedAt: string;
};

export async function listWorkflowJobScheduleExpectations(
  callerRole: string
): Promise<WorkflowJobScheduleExpectationRow[]> {
  return invoke<WorkflowJobScheduleExpectationRow[]>(
    'list_workflow_job_schedule_expectations_command',
    { callerRole }
  );
}

export async function updateJobScheduleExpectations(
  jobId: string,
  callerRole: string,
  opts: {
    gracePeriodMinutes?: number | null;
    recoveryDelaySec?: number | null;
    maxRecoveryAttempts?: number | null;
  }
): Promise<void> {
  await invoke('update_job_schedule_expectations_command', {
    jobId,
    gracePeriodMinutes: opts.gracePeriodMinutes ?? null,
    recoveryDelaySec: opts.recoveryDelaySec ?? null,
    maxRecoveryAttempts: opts.maxRecoveryAttempts ?? null,
    callerRole,
  });
}

export type WorkflowJobExecutionLogRow = {
  executionId: string;
  jobId: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  recordsProcessed: number;
  errorMessage: string | null;
  executionTimeMs: number | null;
  retryCount: number;
};

export async function listWorkflowJobExecutionLog(
  callerRole: string,
  jobId?: string | null,
  limit?: number | null
): Promise<WorkflowJobExecutionLogRow[]> {
  return invoke<WorkflowJobExecutionLogRow[]>(
    'list_workflow_job_execution_log_command',
    {
      callerRole,
      jobId: jobId ?? null,
      limit: limit ?? null,
    }
  );
}

export async function retryFailedJobExecution(
  executionId: string,
  callerRole: string
): Promise<string> {
  return invoke<string>('retry_failed_job_command', {
    executionId: executionId.trim(),
    callerRole,
  });
}

export async function retryLatestFailedJob(
  jobId: string,
  callerRole: string
): Promise<string> {
  return invoke<string>('retry_latest_failed_job_command', {
    jobId,
    callerRole,
  });
}

export type JobFailureInsights = {
  failureClusters7d: { jobId: string; errorMessage: string; count: number }[];
  countsByStatus7d: { jobId: string; status: string; count: number }[];
  notes: string;
};

export async function getJobFailureInsights(
  callerRole: string
): Promise<JobFailureInsights> {
  return invoke<JobFailureInsights>('get_job_failure_insights_command', {
    callerRole,
  });
}

export async function exportWorkflowJobRecoveryLogCsv(
  callerRole: string
): Promise<string> {
  return invoke<string>('export_workflow_job_recovery_log_csv_command', {
    callerRole,
  });
}

export type WorkflowJobDependenciesTree = {
  edges: {
    parentJobId: string;
    dependentJobId: string;
    dependencyType: string;
  }[];
  suggestedDailyOrder: string[];
};

export async function getWorkflowJobDependenciesTree(
  callerRole: string
): Promise<WorkflowJobDependenciesTree> {
  return invoke<WorkflowJobDependenciesTree>(
    'get_workflow_job_dependencies_tree_command',
    { callerRole }
  );
}

export type JobExecutionTimeline = {
  jobId: string;
  hoursWindow: number;
  events: WorkflowJobExecutionLogRow[];
};

export async function getJobExecutionTimeline(
  jobId: string,
  callerRole: string,
  hours?: number | null
): Promise<JobExecutionTimeline> {
  return invoke<JobExecutionTimeline>('get_job_execution_timeline_command', {
    jobId,
    hours: hours ?? null,
    callerRole,
  });
}

export type ManualOverrideLogRow = {
  id: string;
  jobId: string;
  action: string;
  reason: string | null;
  callerRole: string;
  createdAt: string;
};

export async function listWorkflowJobManualOverrideLog(
  callerRole: string,
  limit?: number | null
): Promise<ManualOverrideLogRow[]> {
  return invoke<ManualOverrideLogRow[]>(
    'list_workflow_job_manual_override_log_command',
    { callerRole, limit: limit ?? null }
  );
}

export async function simulateBackgroundJobs(
  callerRole: string
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('simulate_background_jobs_command', {
    callerRole,
  });
}
