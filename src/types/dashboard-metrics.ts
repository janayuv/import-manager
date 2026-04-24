export type DashboardMetricsFilters = {
  startDate?: string;
  endDate?: string;
  supplierId?: string;
  currency?: string;
  fiscalYearStartMonth?: number;
  fiscalYear?: number;
  /** Passed to backend for role-based widgets (optional). */
  userRole?: string;
};

export type DashboardException = {
  kind: string;
  severity: string;
  message: string;
  count: number;
  exceptionType?: string;
  /** `aggregate` for rolled-up rows; `shipment` for a single entity. */
  entityType?: string;
  entityId?: string | null;
  /** Sample shipment IDs in scope (capped) for drill-down / workflows. */
  sampleShipmentIds?: string[];
  navigationTarget?: string;
  /** Full route with query string for client navigation. */
  navigationUrl?: string;
  filterParameters?: Record<string, unknown>;
};

export type EntityExceptionDto = {
  exceptionCaseId: string;
  exceptionType: string;
  entityType: string;
  entityId: string;
  status: string;
  priority: string;
  assignedTo?: string | null;
  assignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  ageDays: number;
  slaDeadline?: string | null;
  slaStatus: string;
  navigationUrl: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  /** SLA escalation applied (server). */
  escalatedAt?: string | null;
  escalationLevel?: number;
  workflowTimeoutFlag?: number;
  recurrenceFlag?: number;
  /** MANUAL | AUTO_RULE | AUTO_LOAD_BALANCED */
  assignmentMethod?: string;
};

export type ExceptionTypeCount = {
  exceptionType: string;
  count: number;
};

export type ExceptionPriorityCount = {
  priority: string;
  count: number;
};

export type ExceptionWorkflowSummary = {
  openCount: number;
  resolvedTodayCount: number;
  slaBreachedCount: number;
  avgResolutionDays?: number | null;
  byType: ExceptionTypeCount[];
  byPriority: ExceptionPriorityCount[];
};

export type MonthlySummaryRow = {
  period: string;
  shipments: number;
  value: number;
  dutySavings: number;
};

export type DocumentComplianceSummary = {
  shipmentsMissingEta: number;
  shipmentsMissingEtd: number;
  shipmentsWithoutBoeRow: number;
  shipmentsWithoutExpense: number;
};

export type DashboardErpExtras = {
  overdueEtaCount?: number;
  activeKpiAlerts?: unknown[];
  warnings?: string[];
  exceptionTrend?: unknown[];
  dashboardPermissions?: Record<string, boolean>;
  avgComplianceScore?: number;
  complianceLowCount?: number;
  kpiForecast?: unknown;
  entityExceptions?: EntityExceptionDto[];
  exceptionWorkflow?: ExceptionWorkflowSummary;
};

export type DashboardMetricsResponse = {
  snapshotAt: string;
  totalSuppliers: number;
  totalItems: number;
  totalShipments: number;
  pendingShipments: number;
  deliveredShipments: number;
  reconciledBoes: number;
  totalInvoiceValue: number;
  avgTransitDays: number | null;
  expenseTotal: number;
  dutyTotal: number;
  totalDutySavingsEstimate: number;
  landedCostTotal: number;
  monthlySummary: MonthlySummaryRow[];
  exceptions: DashboardException[];
  documentCompliance: DocumentComplianceSummary;
  erp?: DashboardErpExtras;
};

export type KpiMetadataRow = {
  kpiName: string;
  formula: string;
  description: string;
  unit: string;
  lastUpdated: string;
};

export type KpiSnapshotHistoryRow = {
  snapshotDate: string;
  kpiName: string;
  value: number;
  createdAt: string;
};

/** Query for `get_kpi_snapshot_history` (camelCase for Tauri invoke). */
export type KpiSnapshotQuery = {
  kpiName?: string;
  /** Server clamps to 1..365; dashboard requests at most 365 for performance. */
  limitDays?: number;
};

/** One calendar day after pivoting long-format snapshot rows. */
export type KpiHistoryDayPoint = {
  dateRaw: string;
  dateSort: number;
  dateLabel: string;
  totalShipments: number | null;
  pendingShipments: number | null;
  deliveredShipments: number | null;
  dutyTotal: number | null;
  expenseTotal: number | null;
};

/** `get_workflow_health_summary` (camelCase from Tauri). */
export type WorkflowHealthSummary = {
  openExceptions: number;
  criticalExceptions: number;
  slaBreachesToday: number;
  workflowTimeouts: number;
  integrityIssues: number;
  recurringExceptions: number;
  lastMaintenanceRun: string;
  lastIntegrityCheck: string;
};

export type WorkflowMaintenanceHistoryRow = {
  runId: string;
  jobName: string;
  startedAt: string;
  completedAt: string;
  status: string;
  recordsProcessed: number;
  errorsDetected: number;
};

export type RecoveryReadinessReport = {
  backupStatus: string;
  snapshotStatus: string;
  integrityStatus: string;
  auditStatus: string;
};

export type ReliabilityDiagnostics = {
  mostCommonExceptionType: string;
  highestRecurrenceEntity: string;
  longestUnresolvedCaseId: string;
  mostFrequentSlaBreachType: string;
  slowestResolutionWorkflowType: string;
};

export type PredictiveRisk = {
  riskLevel: string;
};

export type AuditVerificationSummary = {
  checksumMismatches: number;
  integrityWarnings: number;
  missingChecksumEntries: number;
};
