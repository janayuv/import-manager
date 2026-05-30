import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
} from 'react';
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AppBar, PageHeader } from '@/components/shared/im';
import {
  Database,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  RefreshCw,
  Trash2,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  confirm as confirmDestructive,
  isTauriEnvironment,
  open as tauriOpenDialog,
} from '@/lib/tauri-bridge';
import { logError, logInfo } from '@/lib/logger';
import { useCurrentUserId } from '@/lib/user-context';
import { APP_TIMEZONE, formatAppDateTime } from '@/lib/app-timezone';
import {
  DatabaseAuditTab,
  DatabaseBackupRestoreTab,
  DatabaseBrowseEditTab,
  DatabaseBulkOperationsTab,
  DatabaseOverviewTab,
  DatabaseRolesTab,
  DatabaseSchedulesTab,
  DatabaseSettingsTab,
  DatabaseSummaryStrip,
} from '@/components/database';
import type {
  AuditLog,
  BackupHealthMetrics,
  BackupInfo,
  BackupRedundancySettings,
  BackupSchedule,
  BulkManageableTable,
  BulkSearchFilters,
  DatabaseStats,
  GoogleDriveStatus,
  HardDeletePinSettings,
  RestorePreview,
  TableData,
  UserRole,
} from '@/components/database/types';
import {
  backupTypeLabel,
  gdriveCloudBlocked,
  isGdriveBackupPath,
  normalizeGoogleDriveStatus,
} from '@/components/database/backup-helpers';

interface RestoreResult {
  success: boolean;
  message: string;
  backup_created?: string;
  integrity_check: string;
  tables_affected: string[];
}

interface UpdateResult {
  success: boolean;
  message: string;
  changes: Record<string, unknown>;
  audit_id?: number;
}

type SchedulePreset = 'daily' | 'weekly' | 'monthly' | 'custom';

interface ScheduleFormState {
  name: string;
  preset: SchedulePreset;
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  customCron: string;
  destination: 'local' | 'google_drive';
  retention_count: number;
  retention_days: number;
  enabled: boolean;
  notes: string;
}

function defaultScheduleForm(): ScheduleFormState {
  return {
    name: '',
    preset: 'daily',
    hour: 2,
    minute: 0,
    dayOfWeek: 1,
    dayOfMonth: 1,
    customCron: '0 0 2 * * *',
    destination: 'local',
    retention_count: 5,
    retention_days: 30,
    enabled: true,
    notes: '',
  };
}

function buildCronExpr(form: ScheduleFormState): string {
  const sec = 0;
  const m = Math.min(59, Math.max(0, Math.floor(form.minute)));
  const h = Math.min(23, Math.max(0, Math.floor(form.hour)));
  if (form.preset === 'custom') {
    return form.customCron.trim();
  }
  if (form.preset === 'daily') {
    return `${sec} ${m} ${h} * * *`;
  }
  if (form.preset === 'weekly') {
    const dow = Math.min(6, Math.max(0, Math.floor(form.dayOfWeek)));
    return `${sec} ${m} ${h} * * ${dow}`;
  }
  if (form.preset === 'monthly') {
    const dom = Math.min(31, Math.max(1, Math.floor(form.dayOfMonth)));
    return `${sec} ${m} ${h} ${dom} * *`;
  }
  return `${sec} ${m} ${h} * * *`;
}

interface DriveTransferProgressPayload {
  phase: string;
  percent: number;
  bytesTransferred: number;
  totalBytes: number;
  attempt?: number;
  message?: string;
}

function invokeErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; error?: unknown; cause?: unknown };
    const m = o.message;
    if (typeof m === 'string') return m;
    const e = o.error;
    if (typeof e === 'string') return e;
    const c = o.cause;
    if (typeof c === 'string') return c;
  }
  try {
    return String(err);
  } catch {
    return 'Unknown error';
  }
}

/** Mirrors Rust `parse_friendly_error` for GDRIVE_ERROR-prefixed strings. */
function parseGdriveErrorMessage(raw: string): string {
  if (!raw.includes('GDRIVE_ERROR:')) return raw;
  const marker = 'GDRIVE_ERROR:';
  const idx = raw.indexOf(marker);
  const rest = raw.slice(idx + marker.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) return raw;
  const kind = rest.slice(0, colonIdx).trim();
  const msg = rest.slice(colonIdx + 1).trim();
  switch (kind) {
    case 'oauth':
      return `Google sign-in failed: ${msg}`;
    case 'network':
      return `Network problem talking to Google. Check your internet connection. (${msg})`;
    case 'token':
      return `Your Google session expired or was revoked. Please connect Google Drive again. (${msg})`;
    case 'permission':
      return `Google Drive permission denied. Reconnect and allow Drive access. (${msg})`;
    case 'upload':
      return `Could not upload to Google Drive: ${msg}`;
    case 'download':
      return `Could not download from Google Drive: ${msg}`;
    case 'cancelled':
      return msg;
    default:
      return `Google Drive: ${msg}`;
  }
}

function friendlyInvokeError(err: unknown): string {
  return parseGdriveErrorMessage(invokeErrorMessage(err));
}

interface BulkDeleteResult {
  success: boolean;
  deleted_count: number;
  total_requested: number;
  failed_deletions: string[];
  message: string;
  undo_token?: string | null;
  expiration_timestamp?: string | null;
}

interface BulkDeleteStartedPayload {
  totalCount: number;
  totalBatches: number;
}

interface BulkDeleteProgressPayload {
  processedCount: number;
  totalCount: number;
  currentBatch: number;
  totalBatches: number;
  elapsedMs: number;
}

interface BulkDeleteCompletedPayload {
  totalDeleted: number;
  totalBatches: number;
  elapsedMs: number;
}

interface BulkDeleteRetryPayload {
  batchNumber: number;
  retryAttempt: number;
}

interface DeleteDependencySummary {
  table: string;
  total_references: number;
}

interface PreviewDeleteDependencies {
  total_records: number;
  blocked_records: number;
  dependency_summary: DeleteDependencySummary[];
  can_hard_delete: boolean;
  /** When true, the scan was aborted (e.g. time limit); do not show partial dependency totals as complete. */
  scan_timed_out?: boolean;
}

interface HardDeleteImpactTableCount {
  table: string;
  records: number;
}

interface HardDeleteImpactPreview {
  root_table: string;
  root_records: number;
  total_with_dependencies: number;
  by_table: HardDeleteImpactTableCount[];
}

interface HardDeletePinVerifyResult {
  ok: boolean;
  failedAttempts: number;
  lockUntil: string | null;
  message: string;
}

const PREVIEW_DELETE_CHUNK_SIZE = 500;
const LARGE_SELECTION_WARNING_THRESHOLD = 50000;
const AUTO_SELECT_ALL_MODE_THRESHOLD = 100000;
const BULK_DELETE_OPERATION_TIMEOUT_MS = 10 * 60 * 1000;

/** Merges chunked server previews into one result; on any sub-scan timeout, returns a safe indeterminate summary. */
function mergeDeletePreviewChunks(
  parts: PreviewDeleteDependencies[]
): PreviewDeleteDependencies {
  if (parts.length === 0) {
    return {
      total_records: 0,
      blocked_records: 0,
      dependency_summary: [],
      can_hard_delete: true,
      scan_timed_out: false,
    };
  }
  const total_records = parts.reduce((s, p) => s + p.total_records, 0);
  const scan_timed_out = parts.some(p => p.scan_timed_out);
  if (scan_timed_out) {
    return {
      total_records,
      blocked_records: 0,
      dependency_summary: [],
      can_hard_delete: false,
      scan_timed_out: true,
    };
  }
  const byTable = new Map<string, number>();
  for (const p of parts) {
    for (const d of p.dependency_summary) {
      byTable.set(d.table, (byTable.get(d.table) ?? 0) + d.total_references);
    }
  }
  const dependency_summary = Array.from(byTable.entries())
    .map(([table, total_references]) => ({ table, total_references }))
    .sort((a, b) => a.table.localeCompare(b.table));
  const totalRefRows = dependency_summary.reduce(
    (s, d) => s + d.total_references,
    0
  );
  const blocked_records = parts.reduce((s, p) => s + p.blocked_records, 0);
  const can_hard_delete = totalRefRows === 0;
  return {
    total_records,
    blocked_records,
    dependency_summary,
    can_hard_delete,
    scan_timed_out: false,
  };
}

function formatTableLabel(table: string): string {
  if (!table) return table;
  return table
    .split('_')
    .map(w => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const DEFAULT_BULK_TABLE_OPTIONS: BulkManageableTable[] = [
  { name: 'suppliers', label: 'Suppliers' },
  { name: 'shipments', label: 'Shipments' },
  { name: 'items', label: 'Items' },
  { name: 'invoices', label: 'Invoices' },
  { name: 'invoice_line_items', label: 'Invoice Line Items' },
  { name: 'boe_details', label: 'BOE Details' },
  { name: 'boe_calculations', label: 'BOE Calculations' },
  { name: 'expenses', label: 'Expenses' },
  { name: 'audit_logs', label: 'Audit Logs' },
];
const LAST_SELECTED_BULK_TABLE_KEY = 'lastSelectedBulkTable';

/** Coerce backend / IPC payloads so bulk UI never throws on missing arrays. */
function normalizeTableData(
  raw: unknown,
  fallbackTableName: string
): TableData {
  if (!raw || typeof raw !== 'object') {
    return {
      tableName: fallbackTableName,
      columns: [],
      rows: [],
      totalCount: 0,
      page: 1,
      pageSize: 1000,
    };
  }
  const r = raw as Partial<TableData>;
  const columns = Array.isArray(r.columns) ? r.columns.map(c => String(c)) : [];
  const rows = Array.isArray(r.rows)
    ? r.rows.map(row => (Array.isArray(row) ? row : []))
    : [];
  const totalCount =
    typeof r.totalCount === 'number' && !Number.isNaN(r.totalCount)
      ? r.totalCount
      : rows.length;
  return {
    tableName:
      typeof r.tableName === 'string' ? r.tableName : fallbackTableName,
    columns,
    rows,
    totalCount,
    page: typeof r.page === 'number' ? r.page : 1,
    pageSize: typeof r.pageSize === 'number' ? r.pageSize : 1000,
  };
}

function databaseAuditActionIcon(action: string) {
  switch (action) {
    case 'backup':
      return <Download className="h-4 w-4 text-blue-500" />;
    case 'restore':
      return <Upload className="h-4 w-4 text-green-500" />;
    case 'delete':
    case 'hard_delete':
      return <Trash2 className="h-4 w-4 text-red-500" />;
    case 'update':
      return <Edit3 className="h-4 w-4 text-yellow-500" />;
    default:
      return <Database className="h-4 w-4 text-gray-500" />;
  }
}

function DatabaseManagementContent() {
  const userId = useCurrentUserId();

  // === Feature Boundary: Overview / Dashboard ownership ===
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupInfo[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(
    null
  );
  const [backupHealth, setBackupHealth] = useState<BackupHealthMetrics | null>(
    null
  );
  const [redundancyForm, setRedundancyForm] =
    useState<BackupRedundancySettings>({ enabled: false, secondaryPath: '' });
  const [redundancySaving, setRedundancySaving] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);

  // === Feature Boundary: Browse/Edit ownership ===
  const [activeTab, setActiveTab] = useState('browse');
  const [selectedTable, setSelectedTable] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(LAST_SELECTED_BULK_TABLE_KEY);
      if (saved && saved.trim().length > 0) {
        return saved;
      }
    }
    return 'suppliers';
  });
  const [bulkTableOptions, setBulkTableOptions] = useState<
    BulkManageableTable[]
  >(DEFAULT_BULK_TABLE_OPTIONS);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editingRecord, setEditingRecord] = useState<{
    id: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  // === Feature Boundary: Bulk operation ownership ===
  const [bulkFilters, setBulkFilters] = useState<BulkSearchFilters>({});
  const [bulkSearchResults, setBulkSearchResults] = useState<TableData | null>(
    null
  );
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(
    new Set()
  );
  const [selectAllActive, setSelectAllActive] = useState(false);
  const [excludedRecordIds, setExcludedRecordIds] = useState<Set<string>>(
    new Set()
  );
  const [selectionFilterSnapshot, setSelectionFilterSnapshot] =
    useState<BulkSearchFilters | null>(null);
  const [selectionIncludeDeletedSnapshot, setSelectionIncludeDeletedSnapshot] =
    useState<boolean | null>(null);
  const [selectionTableSnapshot, setSelectionTableSnapshot] = useState<
    string | null
  >(null);
  const [selectAllInProgress, setSelectAllInProgress] = useState(false);
  const totalSelectedRecords =
    selectAllActive && bulkSearchResults
      ? Math.max(bulkSearchResults.totalCount - excludedRecordIds.size, 0)
      : selectedRecords.size;

  const [bulkDeleteType, setBulkDeleteType] = useState<'soft' | 'hard'>('soft');
  const [bulkOperationInProgress, setBulkOperationInProgress] = useState(false);
  const [deletePreviewOpen, setDeletePreviewOpen] = useState(false);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deletePreview, setDeletePreview] =
    useState<PreviewDeleteDependencies | null>(null);
  const [deleteImpactPreview, setDeleteImpactPreview] =
    useState<HardDeleteImpactPreview | null>(null);
  const [hardDeleteConfirmInput, setHardDeleteConfirmInput] = useState('');
  const [pinSettings, setPinSettings] = useState<HardDeletePinSettings | null>(
    null
  );
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogValue, setPinDialogValue] = useState('');
  const [pinDialogError, setPinDialogError] = useState<string | null>(null);
  const [setPinDialogVisible, setSetPinDialogVisible] = useState(false);
  const [setPinValue, setSetPinValue] = useState('');
  const [setPinConfirmValue, setSetPinConfirmValue] = useState('');
  const [changePinDialogOpen, setChangePinDialogOpen] = useState(false);
  const [changePinCurrent, setChangePinCurrent] = useState('');
  const [changePinNew, setChangePinNew] = useState('');
  const [changePinConfirm, setChangePinConfirm] = useState('');
  const [pinLockRemainingSeconds, setPinLockRemainingSeconds] = useState<
    number | null
  >(null);
  const [pinLockActive, setPinLockActive] = useState(false);
  const [pinThresholdInput, setPinThresholdInput] = useState<number>(10);
  const [pinVerifiedForCurrentPreview, setPinVerifiedForCurrentPreview] =
    useState(false);
  const undoToastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const [bulkDeleteInProgress, setBulkDeleteInProgress] = useState(false);
  const [bulkDeleteProcessedCount, setBulkDeleteProcessedCount] = useState(0);
  const [bulkDeleteTotalCount, setBulkDeleteTotalCount] = useState(0);
  const [bulkDeleteCurrentBatch, setBulkDeleteCurrentBatch] = useState(0);
  const [bulkDeleteTotalBatches, setBulkDeleteTotalBatches] = useState(0);
  const [bulkDeleteRetryHint, setBulkDeleteRetryHint] = useState<string | null>(
    null
  );
  const bulkDeleteCompletionFromEventRef = useRef(false);
  const bulkDeleteLastDeletedCountRef = useRef(0);
  const bulkDeleteRetryClearTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const clearBulkDeleteProgressUi = useCallback(() => {
    setBulkDeleteInProgress(false);
    setBulkDeleteProcessedCount(0);
    setBulkDeleteTotalCount(0);
    setBulkDeleteCurrentBatch(0);
    setBulkDeleteTotalBatches(0);
    setBulkDeleteRetryHint(null);
    if (bulkDeleteRetryClearTimeoutRef.current) {
      clearTimeout(bulkDeleteRetryClearTimeoutRef.current);
      bulkDeleteRetryClearTimeoutRef.current = null;
    }
  }, []);

  const clearBulkSelectionState = useCallback(() => {
    setSelectedRecords(new Set());
    setSelectAllActive(false);
    setExcludedRecordIds(new Set());
    setSelectionFilterSnapshot(null);
    setSelectionIncludeDeletedSnapshot(null);
    setSelectionTableSnapshot(null);
  }, []);

  const clearUndoToastTimer = useCallback(() => {
    if (undoToastIntervalRef.current) {
      clearInterval(undoToastIntervalRef.current);
      undoToastIntervalRef.current = null;
    }
  }, []);

  const handleBrowseTableChange = useCallback(
    (newTable: string) => {
      setSelectedTable(newTable);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LAST_SELECTED_BULK_TABLE_KEY, newTable);
      }
      setSelectedRecords(new Set());
      clearBulkSelectionState();
    },
    [clearBulkSelectionState]
  );

  const handleBulkTableChange = useCallback(
    (newTable: string) => {
      setSelectedTable(newTable);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LAST_SELECTED_BULK_TABLE_KEY, newTable);
      }
      setBulkSearchResults(null);
      clearBulkSelectionState();
      setBulkFilters({});
    },
    [clearBulkSelectionState]
  );

  // === Feature Boundary: Backup schedule ownership ===
  const [backupSchedules, setBackupSchedules] = useState<BackupSchedule[]>([]);

  // === Feature Boundary: Role ownership ===
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);

  // === Feature Boundary: Backup/Restore form ownership ===
  const [backupForm, setBackupForm] = useState({
    destination: 'local',
    filename: '',
    include_wal: true,
    notes: '',
  });

  const [googleDriveStatus, setGoogleDriveStatus] =
    useState<GoogleDriveStatus | null>(null);

  /** Active Google upload/download: show progress overlay (Tauri events). */
  const [gdriveTransfer, setGdriveTransfer] =
    useState<DriveTransferProgressPayload | null>(null);
  const [gdriveOpLabel, setGdriveOpLabel] = useState<string | null>(null);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(
    null
  );
  const [scheduleForm, setScheduleForm] =
    useState<ScheduleFormState>(defaultScheduleForm);

  // === State Ownership Zones (pre-modular split marker) ===
  // - Overview Zone: stats, backupHistory, auditLogs, loading
  // - Browse/Edit Zone: selectedTable, tableData, editingRecord, editForm, pagination
  // - Bulk Zone: bulkFilters, bulkSearchResults, selectedRecords, selection snapshots, delete preview
  // - Backup/Restore Zone: backupForm, backup progress, restore preview/progress, gdrive transfer
  // - Roles/Schedules Zone: userRoles, backupSchedules, schedule dialog/form

  const bulkBulkControlsDisabled =
    bulkOperationInProgress ||
    bulkDeleteInProgress ||
    selectAllInProgress ||
    pinDialogOpen ||
    setPinDialogVisible ||
    changePinDialogOpen ||
    pinLockActive;

  // === Data Loading Boundary ===
  /** Refreshes stats, recent backups slice, and audit logs. Never toggles full-page `loading` (avoids unmounting the UI). */
  const loadDashboardData = useCallback(async () => {
    try {
      const [statsData, backupsData, auditData, gdrive, health, redundancy] =
        await Promise.all([
          invoke<DatabaseStats>('get_database_stats'),
          invoke<BackupInfo[]>('get_backup_history', { limit: 10 }),
          invoke<AuditLog[]>('get_audit_logs', { limit: 20 }),
          invoke<GoogleDriveStatus>('google_drive_status', { userId }).catch(
            () =>
              normalizeGoogleDriveStatus({
                configured: false,
                connected: false,
                state: 'not_configured',
              })
          ),
          invoke<BackupHealthMetrics>('get_backup_health_metrics').catch(
            () => null
          ),
          invoke<BackupRedundancySettings>(
            'get_backup_redundancy_settings'
          ).catch(() => ({ enabled: false, secondaryPath: '' })),
        ]);

      setStats(statsData);
      setBackupHistory(Array.isArray(backupsData) ? backupsData : []);
      setAuditLogs(Array.isArray(auditData) ? auditData : []);
      setGoogleDriveStatus(normalizeGoogleDriveStatus(gdrive));
      if (health) {
        setBackupHealth(health);
      }
      if (redundancy) {
        setRedundancyForm(redundancy);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('Failed to load database management data');
    }
  }, [userId]);

  /** Full backup list (including live Google Drive `.enc` files); always hits the backend — no client cache. */
  const loadBackupHistory = useCallback(async () => {
    try {
      const history = await invoke<BackupInfo[]>('get_backup_history');
      setBackupHistory(Array.isArray(history) ? history : []);
    } catch (error) {
      console.error('Failed to load backup history:', error);
      toast.error('Failed to load backup history');
    }
  }, []);

  const handleSaveRedundancySettings = useCallback(async () => {
    setRedundancySaving(true);
    try {
      await invoke('set_backup_redundancy_settings', {
        input: {
          enabled: redundancyForm.enabled,
          secondaryPath: redundancyForm.secondaryPath.trim(),
        },
        userId,
      });
      toast.success('Backup redundancy settings saved');
      await loadDashboardData();
    } catch (err) {
      console.error(err);
      toast.error('Could not save redundancy settings');
    } finally {
      setRedundancySaving(false);
    }
  }, [userId, redundancyForm, loadDashboardData]);

  const loadBulkManageableTables = useCallback(async () => {
    try {
      const tables = await invoke<BulkManageableTable[]>(
        'get_bulk_manageable_tables'
      );
      const nextOptions =
        Array.isArray(tables) && tables.length > 0
          ? tables
          : DEFAULT_BULK_TABLE_OPTIONS;
      setBulkTableOptions(nextOptions);
      const available = new Set(nextOptions.map(t => t.name));
      setSelectedTable(prevSelected => {
        const currentSelectedTable = (prevSelected ?? '').trim();
        const saved =
          typeof window !== 'undefined'
            ? (
                window.localStorage.getItem(LAST_SELECTED_BULK_TABLE_KEY) ?? ''
              ).trim()
            : '';
        const desired =
          currentSelectedTable.length > 0 ? currentSelectedTable : saved;
        const resolved = available.has(desired)
          ? desired
          : (nextOptions[0]?.name ?? 'suppliers');
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_SELECTED_BULK_TABLE_KEY, resolved);
        }
        return resolved;
      });
    } catch (error) {
      console.error('Failed to load bulk-manageable tables:', error);
      setBulkTableOptions(DEFAULT_BULK_TABLE_OPTIONS);
    }
  }, []);

  // === User Action Boundary ===

  const loadHardDeletePinSettings = useCallback(async () => {
    try {
      const settings = await invoke<HardDeletePinSettings>(
        'get_hard_delete_pin_settings'
      );
      setPinSettings(settings);
    } catch (error) {
      console.error('Failed to load hard delete PIN settings:', error);
    }
  }, []);

  const isValidPin = (pin: string): boolean =>
    /^[0-9]{4,}$/.test((pin ?? '').trim());

  const handleToggleHardDeletePinEnabled = async (enabled: boolean) => {
    try {
      await invoke('set_hard_delete_pin_enabled', { enabled });
      await loadHardDeletePinSettings();
      toast.success(
        enabled
          ? 'Hard delete PIN protection enabled.'
          : 'Hard delete PIN protection disabled.'
      );
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleSetHardDeletePin = async () => {
    if (!isValidPin(setPinValue)) {
      toast.error('PIN must be numeric and at least 4 digits.');
      return;
    }
    if (setPinValue !== setPinConfirmValue) {
      toast.error('PIN and confirmation do not match.');
      return;
    }
    try {
      await invoke('set_hard_delete_pin', { pin: setPinValue });
      await loadHardDeletePinSettings();
      setSetPinDialogVisible(false);
      setSetPinValue('');
      setSetPinConfirmValue('');
      toast.success('Hard delete PIN set successfully.');
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleChangeHardDeletePin = async () => {
    if (!isValidPin(changePinNew)) {
      toast.error('New PIN must be numeric and at least 4 digits.');
      return;
    }
    if (changePinNew !== changePinConfirm) {
      toast.error('New PIN and confirmation do not match.');
      return;
    }
    try {
      await invoke('change_hard_delete_pin', {
        currentPin: changePinCurrent,
        newPin: changePinNew,
      });
      await loadHardDeletePinSettings();
      setChangePinDialogOpen(false);
      setChangePinCurrent('');
      setChangePinNew('');
      setChangePinConfirm('');
      toast.success('PIN updated successfully.');
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleSaveHardDeletePinThreshold = async (threshold: number) => {
    const next = Math.max(1, Math.floor(threshold || 1));
    try {
      await invoke('set_hard_delete_pin_threshold', { threshold: next });
      await loadHardDeletePinSettings();
      toast.success('Hard delete PIN threshold updated.');
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleVerifyPinForDelete = async () => {
    setPinDialogError(null);
    try {
      const result = await invoke<HardDeletePinVerifyResult>(
        'verify_hard_delete_pin',
        {
          pin: pinDialogValue,
        }
      );
      await loadHardDeletePinSettings();
      if (result.ok) {
        setPinVerifiedForCurrentPreview(true);
        setPinDialogOpen(false);
        setPinDialogValue('');
        toast.success('PIN verified.');
        return;
      }
      setPinDialogError(result.message || 'Invalid PIN');
      toast.error(result.message || 'Invalid PIN');
    } catch (error) {
      setPinDialogError(String(error));
      toast.error(String(error));
    }
  };

  useEffect(() => {
    if (!isTauriEnvironment) return;
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<DriveTransferProgressPayload>(
          'gdrive-transfer-progress',
          event => {
            setGdriveTransfer(event.payload);
          }
        );
      } catch (e) {
        console.warn('gdrive-transfer-progress listener failed:', e);
      }
    };
    void setup();
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauriEnvironment) return;
    let active = true;
    const unlistenFns: Array<() => void> = [];
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const reg = (unlisten: () => void) => {
          if (!active) {
            try {
              unlisten();
            } catch {
              /* ignore */
            }
            return false;
          }
          unlistenFns.push(unlisten);
          return true;
        };

        let u = await listen<BulkDeleteStartedPayload>(
          'bulk_delete_started',
          event => {
            bulkDeleteCompletionFromEventRef.current = false;
            setBulkDeleteInProgress(true);
            setBulkDeleteTotalCount(event.payload.totalCount);
            setBulkDeleteTotalBatches(event.payload.totalBatches);
            setBulkDeleteProcessedCount(0);
            setBulkDeleteCurrentBatch(0);
          }
        );
        if (!reg(u)) return;

        u = await listen<BulkDeleteProgressPayload>(
          'bulk_delete_progress',
          event => {
            const p = event.payload;
            setBulkDeleteProcessedCount(p.processedCount);
            setBulkDeleteTotalCount(p.totalCount);
            setBulkDeleteCurrentBatch(p.currentBatch);
            setBulkDeleteTotalBatches(p.totalBatches);
          }
        );
        if (!reg(u)) return;

        u = await listen<BulkDeleteCompletedPayload>(
          'bulk_delete_completed',
          event => {
            bulkDeleteCompletionFromEventRef.current = true;
            toast.success(
              `${event.payload.totalDeleted.toLocaleString()} records deleted successfully.`,
              { id: 'bulk-delete-complete' }
            );
            clearBulkDeleteProgressUi();
          }
        );
        if (!reg(u)) return;

        u = await listen<BulkDeleteRetryPayload>('bulk_delete_retry', event => {
          setBulkDeleteRetryHint(
            `Retrying batch ${event.payload.batchNumber}...`
          );
          if (bulkDeleteRetryClearTimeoutRef.current) {
            clearTimeout(bulkDeleteRetryClearTimeoutRef.current);
          }
          bulkDeleteRetryClearTimeoutRef.current = setTimeout(() => {
            setBulkDeleteRetryHint(null);
            bulkDeleteRetryClearTimeoutRef.current = null;
          }, 4000);
        });
        if (!reg(u)) return;
      } catch (e) {
        console.warn('bulk delete progress listeners failed:', e);
      }
    })();
    return () => {
      active = false;
      for (const u of unlistenFns) {
        try {
          u();
        } catch {
          /* ignore */
        }
      }
    };
  }, [clearBulkDeleteProgressUi]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      setLoading(true);
      try {
        await loadDashboardData();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void boot();
    void loadBackupHistory();
    void loadBackupSchedules();
    void loadUserRoles();
    void loadBulkManageableTables();
    void loadHardDeletePinSettings();
    return () => {
      cancelled = true;
    };
    // One-shot boot: roles/schedules loaders are not stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [
    loadDashboardData,
    loadBulkManageableTables,
    loadHardDeletePinSettings,
    loadBackupHistory,
  ]);

  useEffect(() => {
    if (activeTab !== 'backup') {
      return;
    }
    void loadBackupHistory();
  }, [activeTab, loadBackupHistory]);

  const loadTableData = useCallback(
    async (opts?: { page?: number }) => {
      const page =
        opts &&
        typeof opts === 'object' &&
        typeof opts.page === 'number' &&
        !Number.isNaN(opts.page)
          ? opts.page
          : currentPage;
      try {
        const data = await invoke<TableData>('browse_table_data', {
          tableName: selectedTable,
          page,
          pageSize: pageSize,
          includeDeleted: includeDeleted,
        });
        setTableData(normalizeTableData(data, selectedTable));
      } catch (error) {
        console.error('Failed to load table data:', error);
        toast.error(`Failed to load table data: ${error}`);
      }
    },
    [selectedTable, currentPage, pageSize, includeDeleted]
  );

  useEffect(() => {
    if (!selectAllActive) {
      return;
    }

    if (
      !selectionFilterSnapshot ||
      selectionIncludeDeletedSnapshot === null ||
      !selectionTableSnapshot
    ) {
      clearBulkSelectionState();
      toast.error(
        'Selection context is missing. Please re-run search and select records again.'
      );
      return;
    }

    const snapshotFilters = JSON.stringify(selectionFilterSnapshot);
    const currentFilters = JSON.stringify(bulkFilters);
    const contextChanged =
      snapshotFilters !== currentFilters ||
      selectionIncludeDeletedSnapshot !== includeDeleted ||
      selectionTableSnapshot !== selectedTable;

    if (contextChanged) {
      clearBulkSelectionState();
      toast.info(
        'Selection was reset because table or filter criteria changed.'
      );
    }
  }, [
    bulkFilters,
    clearBulkSelectionState,
    includeDeleted,
    selectAllActive,
    selectedTable,
    selectionFilterSnapshot,
    selectionIncludeDeletedSnapshot,
    selectionTableSnapshot,
  ]);

  useEffect(() => {
    return () => {
      clearUndoToastTimer();
    };
  }, [clearUndoToastTimer]);

  useEffect(() => {
    if (pinSettings?.threshold != null) {
      setPinThresholdInput(pinSettings.threshold);
    }
  }, [pinSettings?.threshold]);

  useEffect(() => {
    const lockUntilIso = pinSettings?.lockUntil;
    if (!lockUntilIso) {
      setPinLockActive(false);
      setPinLockRemainingSeconds(null);
      return;
    }
    const lockUntilMs = Date.parse(lockUntilIso);
    if (!Number.isFinite(lockUntilMs)) {
      setPinLockActive(false);
      setPinLockRemainingSeconds(null);
      return;
    }
    const computeRemaining = () =>
      Math.max(0, Math.ceil((lockUntilMs - Date.now()) / 1000));
    const initialRemaining = computeRemaining();
    if (initialRemaining <= 0) {
      setPinLockActive(false);
      setPinLockRemainingSeconds(null);
      return;
    }
    setPinLockActive(true);
    setPinLockRemainingSeconds(initialRemaining);
    const intervalId = window.setInterval(() => {
      const remaining = computeRemaining();
      if (remaining <= 0) {
        setPinLockActive(false);
        setPinLockRemainingSeconds(null);
        window.clearInterval(intervalId);
      } else {
        setPinLockRemainingSeconds(remaining);
      }
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [pinSettings?.lockUntil]);

  useEffect(() => {
    loadTableData();
  }, [loadTableData]);

  const formatBytes = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleConnectGoogleDrive = async () => {
    if (googleDriveStatus?.state === 'not_configured') {
      toast.error(
        'Google OAuth is not configured for this build (IMPORT_MANAGER_GOOGLE_CLIENT_ID). Use Local backups or rebuild with OAuth credentials.'
      );
      return;
    }
    try {
      toast.info('Complete sign-in in your browser…');
      await invoke('google_drive_connect', { userId });
      try {
        const s = await invoke<GoogleDriveStatus>('google_drive_status', {
          userId,
        });
        setGoogleDriveStatus(normalizeGoogleDriveStatus(s));
      } catch {
        /* status refresh best-effort */
      }
      try {
        await invoke('google_drive_refresh_profile', { userId });
      } catch {
        /* profile optional */
      }
      try {
        const s2 = await invoke<GoogleDriveStatus>('google_drive_status', {
          userId,
        });
        setGoogleDriveStatus(normalizeGoogleDriveStatus(s2));
      } catch {
        /* status after profile */
      }
      toast.success('Google Drive connected');
      await loadDashboardData();
    } catch (error) {
      console.error('Google Drive connect failed:', error);
      toast.error(friendlyInvokeError(error));
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    const ok = await confirmDestructive(
      'Disconnect Google Drive? You can reconnect anytime; backups already on Drive stay there.'
    );
    if (!ok) return;
    try {
      await invoke('google_drive_disconnect', { userId });
      toast.success('Disconnected from Google Drive');
      await loadDashboardData();
    } catch (error) {
      console.error('Google Drive disconnect failed:', error);
      toast.error(`Could not disconnect: ${error}`);
    }
  };

  const handleRefreshGoogleProfile = async () => {
    try {
      await invoke('google_drive_refresh_profile', { userId });
      await loadDashboardData();
      toast.success('Google account updated');
    } catch (error) {
      toast.error(friendlyInvokeError(error));
    }
  };

  const handleGdriveCancelTransfer = () => {
    try {
      void invoke('google_drive_cancel_operation');
    } catch {
      /* ignore */
    }
  };

  // === Progress Workflow Boundary: Backup execution ===
  const handleBackupNow = async () => {
    if (
      backupForm.destination === 'google_drive' &&
      gdriveCloudBlocked(googleDriveStatus)
    ) {
      toast.error(
        googleDriveStatus?.state === 'not_configured'
          ? 'This build is not configured for Google OAuth. Set IMPORT_MANAGER_GOOGLE_CLIENT_ID when building.'
          : 'Connect Google Drive before backing up to the cloud.'
      );
      return;
    }
    const toGdrive = backupForm.destination === 'google_drive';
    let progressInterval: ReturnType<typeof setInterval> | undefined;
    const backupUiStart = performance.now();
    try {
      setBackupInProgress(true);
      setBackupProgress(0);

      if (toGdrive && isTauriEnvironment) {
        try {
          await invoke('google_drive_reset_cancel');
        } catch {
          /* ignore */
        }
        setGdriveOpLabel('Uploading backup to Google Drive');
        setGdriveTransfer({
          phase: 'Starting…',
          percent: 0,
          bytesTransferred: 0,
          totalBytes: 0,
        });
      } else {
        progressInterval = setInterval(() => {
          setBackupProgress(prev => Math.min(prev + 10, 90));
        }, 200);
      }

      const result = await invoke<BackupInfo>('create_backup', {
        request: {
          destination: backupForm.destination,
          filename: backupForm.filename || undefined,
          include_wal: backupForm.include_wal,
          notes: backupForm.notes || undefined,
        },
        userId,
      });

      if (progressInterval) clearInterval(progressInterval);
      setBackupProgress(100);

      toast.success(`Backup created successfully: ${result.filename}`);
      logInfo(
        `Backup created: ${result.filename} (${result.destination})`,
        'backup'
      );
      logInfo(
        `Backup completed in ${((performance.now() - backupUiStart) / 1000).toFixed(2)} seconds`,
        'backup'
      );
      if (result.size_bytes != null && result.size_bytes > 0) {
        logInfo(
          `Backup size: ${(result.size_bytes / 1_000_000).toFixed(2)} MB`,
          'backup'
        );
      }

      await loadDashboardData();

      // Reset form
      setBackupForm({
        destination: 'local',
        filename: '',
        include_wal: true,
        notes: '',
      });
    } catch (error) {
      console.error('Backup failed:', error);
      logError(
        toGdrive
          ? friendlyInvokeError(error)
          : `Backup failed: ${invokeErrorMessage(error)}`,
        'backup'
      );
      toast.error(
        toGdrive
          ? friendlyInvokeError(error)
          : `Backup failed: ${invokeErrorMessage(error)}`
      );
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setTimeout(
        () => {
          setBackupInProgress(false);
          setBackupProgress(0);
          setGdriveOpLabel(null);
          setGdriveTransfer(null);
        },
        toGdrive ? 600 : 1000
      );
    }
  };

  // === Progress Workflow Boundary: Restore preview + execution ===
  const handleRestorePreview = async (backupPath: string) => {
    const gdrive = isGdriveBackupPath(backupPath);
    try {
      setSelectedBackup(backupPath);
      if (gdrive && isTauriEnvironment) {
        try {
          await invoke('google_drive_reset_cancel');
        } catch {
          /* ignore */
        }
        setGdriveOpLabel('Downloading backup from Google Drive');
        setGdriveTransfer({
          phase: 'Starting…',
          percent: 0,
          bytesTransferred: 0,
          totalBytes: 0,
        });
      }
      const preview = await invoke<RestorePreview>('preview_restore', {
        backupPath: backupPath,
      });
      setRestorePreview(preview);
    } catch (error) {
      console.error('Failed to preview restore:', error);
      logError(
        gdrive
          ? friendlyInvokeError(error)
          : `Failed to preview restore: ${invokeErrorMessage(error)}`,
        'restore-preview'
      );
      toast.error(
        gdrive
          ? friendlyInvokeError(error)
          : `Failed to preview restore: ${invokeErrorMessage(error)}`
      );
    } finally {
      if (gdrive) {
        setTimeout(() => {
          setGdriveOpLabel(null);
          setGdriveTransfer(null);
        }, 400);
      }
    }
  };

  const handleExportBackupKey = async () => {
    if (!isTauriEnvironment) {
      toast.error('Export is only available in the desktop app.');
      return;
    }
    try {
      await invoke('export_backup_key', { userId });
      toast.success('Backup key saved. Store the file in a safe place.');
      logInfo('Backup encryption key export completed', 'security');
    } catch (e) {
      logError(String(e), 'export-backup-key');
      toast.error(`Failed to export backup key: ${invokeErrorMessage(e)}`);
    }
  };

  const handleImportBackupKey = async () => {
    if (!isTauriEnvironment) {
      toast.error('Import is only available in the desktop app.');
      return;
    }
    try {
      const picked = await tauriOpenDialog({
        multiple: false,
        filters: [{ name: 'Import Manager key', extensions: ['imkey'] }],
        title: 'Select backup key file',
      });
      if (picked == null) return;
      const filePath = Array.isArray(picked) ? picked[0] : picked;
      if (!filePath) return;
      const hasKey = await invoke<boolean>('has_backup_key_in_keyring');
      let replaceConfirmed = false;
      if (hasKey) {
        const ok = await confirmDestructive(
          'A backup encryption key is already stored on this system. Replace it with the file you selected?'
        );
        if (!ok) return;
        replaceConfirmed = true;
      }
      await invoke('import_backup_key_from_path', {
        path: filePath,
        replaceConfirmed,
        userId,
      });
      toast.success(
        'Backup key imported. You can decrypt backups from your other device.'
      );
      logInfo('Backup encryption key import completed', 'security');
    } catch (e) {
      logError(String(e), 'import-backup-key');
      toast.error(`Failed to import backup key: ${invokeErrorMessage(e)}`);
    }
  };

  const handleRestoreDatabase = async () => {
    if (!selectedBackup) return;
    if (!restorePreview) {
      toast.error('Open a restore preview from a backup before restoring.');
      return;
    }

    const ok = await confirmDestructive(
      'Restoring this backup will overwrite the current database. Continue?'
    );
    if (!ok) return;

    const gdrive = isGdriveBackupPath(selectedBackup);
    const restoreUiStart = performance.now();
    try {
      setRestoreInProgress(true);
      if (gdrive && isTauriEnvironment) {
        try {
          await invoke('google_drive_reset_cancel');
        } catch {
          /* ignore */
        }
        setGdriveOpLabel('Downloading backup from Google Drive');
        setGdriveTransfer({
          phase: 'Starting…',
          percent: 0,
          bytesTransferred: 0,
          totalBytes: 0,
        });
      }

      const result = await invoke<RestoreResult>('restore_database', {
        backupPath: selectedBackup,
        userId,
      });

      if (result.success) {
        toast.success(
          `Database restored successfully! Pre-restore backup: ${result.backup_created}`
        );
        logInfo(
          `Database restored; pre-restore backup: ${result.backup_created ?? 'n/a'}`,
          'restore'
        );
        logInfo(
          `Restore completed in ${((performance.now() - restoreUiStart) / 1000).toFixed(2)} seconds`,
          'restore'
        );
        setRestorePreview(null);
        setSelectedBackup(null);
        await loadDashboardData();
      } else {
        logError(`Restore failed: ${result.message}`, 'restore');
        toast.error(`Restore failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Restore failed:', error);
      logError(
        gdrive
          ? friendlyInvokeError(error)
          : `Restore failed: ${invokeErrorMessage(error)}`,
        'restore'
      );
      toast.error(
        gdrive
          ? friendlyInvokeError(error)
          : `Restore failed: ${invokeErrorMessage(error)}`
      );
    } finally {
      setRestoreInProgress(false);
      if (gdrive) {
        setTimeout(() => {
          setGdriveOpLabel(null);
          setGdriveTransfer(null);
        }, 400);
      }
    }
  };

  // === Modal Workflow Boundary: key import/export + schedule + delete confirmation dialogs ===

  const isPlaywrightBuild = import.meta.env.VITE_PLAYWRIGHT === '1';

  /** E2E: trigger a real browser download of the JSON snapshot the stub stores for this backup. */
  const downloadPlaywrightBackupSnapshot = async (backupPath: string) => {
    if (!isPlaywrightBuild) return;
    try {
      const snapshotJson = await invoke<string>(
        'playwright_read_backup_snapshot',
        { backupPath }
      );
      const blob = new Blob([snapshotJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'import-manager-backup-snapshot.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download snapshot failed:', error);
      toast.error(`Download failed: ${error}`);
    }
  };

  /** E2E: register uploaded JSON with the Playwright stub, then open the same restore preview flow as production. */
  const handlePlaywrightRestoreFileSelected = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    if (!isPlaywrightBuild) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const snapshotJson = await file.text();
      const { backupPath } = await invoke<{ backupPath: string }>(
        'playwright_register_restore_snapshot',
        { snapshotJson }
      );
      await handleRestorePreview(backupPath);
      await loadBackupHistory();
    } catch (error) {
      console.error('Restore file registration failed:', error);
      toast.error(`Could not read backup file: ${error}`);
    }
  };

  const handleEditRecord = (
    recordId: string,
    recordData: Record<string, unknown>
  ) => {
    setEditingRecord({ id: recordId, data: recordData });
    setEditForm(recordData);
  };

  const handleUpdateRecord = async () => {
    if (!editingRecord) return;

    try {
      const result = await invoke<UpdateResult>('update_record', {
        tableName: selectedTable,
        recordId: editingRecord.id,
        updates: editForm,
        userId,
      });

      if (
        result &&
        typeof result === 'object' &&
        'success' in result &&
        result.success
      ) {
        toast.success('Record updated successfully');
        setEditingRecord(null);
        setEditForm({});
        await loadTableData();
        await loadDashboardData(); // Refresh stats
      } else {
        const msg =
          result &&
          typeof result === 'object' &&
          'message' in result &&
          typeof (result as { message?: unknown }).message === 'string'
            ? (result as { message: string }).message
            : 'Update failed';
        toast.error(`Update failed: ${msg}`);
      }
    } catch (error) {
      console.error('Update failed:', error);
      toast.error(`Update failed: ${error}`);
    }
  };

  const handleSoftDelete = async (recordId: string) => {
    try {
      await invoke('soft_delete_record', {
        tableName: selectedTable,
        recordId: recordId,
        userId,
      });

      toast.success('Record soft deleted successfully');
      await loadTableData();
      await loadDashboardData();
    } catch (error) {
      console.error('Soft delete failed:', error);
      toast.error(`Soft delete failed: ${error}`);
    }
  };

  // Bulk operations functions
  const handleBulkSearch = async (options?: {
    suppressSuccessToast?: boolean;
  }): Promise<TableData | null> => {
    try {
      setBulkOperationInProgress(true);
      const result = await invoke<TableData>('bulk_search_records', {
        tableName: selectedTable,
        filters: bulkFilters,
        pageSize: 1000, // Large page size for bulk operations
        includeDeleted,
      });

      const normalized = normalizeTableData(result, selectedTable);
      setBulkSearchResults(normalized);
      clearBulkSelectionState();

      if (!options?.suppressSuccessToast) {
        toast.success(
          `Found ${normalized.totalCount} records matching your criteria.`
        );
      }
      return normalized;
    } catch (error) {
      console.error('Bulk search failed:', error);
      toast.error(`Failed to search records: ${error}`);
      return null;
    } finally {
      setBulkOperationInProgress(false);
    }
  };

  const executeBulkDelete = async (deleteType: 'soft' | 'hard') => {
    let deleteInvokeSucceeded = false;
    bulkDeleteCompletionFromEventRef.current = false;
    try {
      setBulkOperationInProgress(true);
      if (selectAllActive) {
        if (
          !selectionFilterSnapshot ||
          selectionIncludeDeletedSnapshot === null ||
          !selectionTableSnapshot
        ) {
          toast.error(
            'Selection snapshot is missing. Please re-run search and select records again.'
          );
          return;
        }
      }

      const effectiveTableName = selectAllActive
        ? selectionTableSnapshot!
        : selectedTable;
      const effectiveFilters = selectAllActive
        ? selectionFilterSnapshot!
        : bulkFilters;
      const effectiveIncludeDeleted = selectAllActive
        ? selectionIncludeDeletedSnapshot!
        : includeDeleted;

      const result = selectAllActive
        ? await invoke<BulkDeleteResult>('bulk_delete_records_by_filter', {
            tableName: effectiveTableName,
            filters: effectiveFilters,
            includeDeleted: effectiveIncludeDeleted,
            excludedRecordIds: Array.from(excludedRecordIds),
            expectedSelectedCount: totalSelectedRecords,
            operationTimeoutMs: BULK_DELETE_OPERATION_TIMEOUT_MS,
            userId,
            deleteType,
          })
        : await invoke<BulkDeleteResult>('bulk_delete_records', {
            tableName: selectedTable,
            recordIds: Array.from(selectedRecords),
            userId,
            deleteType,
          });

      if (
        result &&
        typeof result === 'object' &&
        'success' in result &&
        result.success
      ) {
        deleteInvokeSucceeded = true;
        bulkDeleteLastDeletedCountRef.current = result.deleted_count;
        if (deleteType === 'soft') {
          logInfo('Soft delete completed after dependency review', 'delete');
          if (result.undo_token && result.expiration_timestamp) {
            const undoToken = result.undo_token;
            const expiresAtMs = Date.parse(result.expiration_timestamp);
            if (Number.isFinite(expiresAtMs)) {
              const toastId = `undo-delete-${undoToken}`;
              const renderUndoToast = () => {
                const remainingMs = Math.max(expiresAtMs - Date.now(), 0);
                const remainingSec = Math.floor(remainingMs / 1000);
                const mm = Math.floor(remainingSec / 60)
                  .toString()
                  .padStart(1, '0');
                const ss = (remainingSec % 60).toString().padStart(2, '0');
                const label = `Undo (${mm}:${ss})`;
                toast.message(
                  `${result.deleted_count.toLocaleString()} records deleted.`,
                  {
                    id: toastId,
                    duration: remainingMs > 0 ? remainingMs : 1000,
                    action:
                      remainingMs > 0
                        ? {
                            label,
                            onClick: async () => {
                              try {
                                const undoResult =
                                  await invoke<BulkDeleteResult>(
                                    'restore_deleted_records_using_token',
                                    {
                                      undoToken,
                                    }
                                  );
                                toast.success(undoResult.message);
                                clearUndoToastTimer();
                                toast.dismiss(toastId);
                                await loadTableData({ page: 1 });
                                await handleBulkSearch({
                                  suppressSuccessToast: true,
                                });
                                await loadDashboardData();
                              } catch (undoError) {
                                toast.error(`Undo failed: ${undoError}`);
                              }
                            },
                          }
                        : undefined,
                  }
                );
              };

              clearUndoToastTimer();
              renderUndoToast();
              undoToastIntervalRef.current = setInterval(() => {
                if (Date.now() >= expiresAtMs) {
                  clearUndoToastTimer();
                  toast.dismiss(toastId);
                  return;
                }
                renderUndoToast();
              }, 1000);
            }
          }
        }

        // Immediate UI reset so we never render stale rows while refresh runs.
        clearBulkSelectionState();
        setBulkSearchResults(
          normalizeTableData(
            { columns: [], rows: [], totalCount: 0, tableName: selectedTable },
            selectedTable
          )
        );

        try {
          setCurrentPage(1);
          await loadTableData({ page: 1 });
          const searchResult = await handleBulkSearch({
            suppressSuccessToast: true,
          });
          await loadDashboardData();

          if (searchResult === null) {
            setBulkSearchResults(
              normalizeTableData(
                {
                  columns: [],
                  rows: [],
                  totalCount: 0,
                  tableName: selectedTable,
                },
                selectedTable
              )
            );
            toast.error('Refresh Warning', {
              description:
                'Data was deleted, but reloading search results failed.',
            });
          } else if (searchResult.totalCount === 0) {
            setBulkSearchResults(null);
          }
        } catch (refreshError) {
          console.error('Bulk refresh failed:', refreshError);
          toast.error('Refresh Warning', {
            description:
              'Data was deleted, but refreshing the view encountered an issue.',
          });
          setBulkSearchResults(
            normalizeTableData(
              {
                columns: [],
                rows: [],
                totalCount: 0,
                tableName: selectedTable,
              },
              selectedTable
            )
          );
        }
      } else {
        const msg =
          result &&
          typeof result === 'object' &&
          'message' in result &&
          typeof (result as { message?: unknown }).message === 'string'
            ? (result as { message: string }).message
            : 'Bulk delete did not succeed.';
        clearBulkDeleteProgressUi();
        toast.error(msg);
      }
    } catch (error) {
      clearBulkDeleteProgressUi();
      const raw = String(error);
      let friendly = raw;
      if (raw.includes('Cannot hard delete')) {
        friendly = raw;
        logInfo(
          'Hard delete blocked — dependencies detected (server)',
          'delete'
        );
      } else {
        try {
          const o = JSON.parse(raw) as { type?: string };
          if (o?.type === 'DEPENDENCY_EXISTS') {
            friendly =
              'Cannot hard delete — record is referenced in other modules.';
            logInfo('Hard delete blocked — dependencies detected', 'delete');
          }
        } catch {
          if (
            raw.toLowerCase().includes('foreign key') &&
            !raw.startsWith('{')
          ) {
            logError('Bulk hard delete: underlying SQLite (FK)', 'delete');
            friendly =
              'Cannot hard delete — record is referenced in other modules.';
          }
        }
      }
      console.error('Bulk delete failed:', error);
      toast.error(`Failed to delete records: ${friendly}`);
    } finally {
      setBulkOperationInProgress(false);
      if (deleteInvokeSucceeded) {
        window.setTimeout(() => {
          if (!bulkDeleteCompletionFromEventRef.current) {
            toast.success(
              `${bulkDeleteLastDeletedCountRef.current.toLocaleString()} records deleted successfully.`,
              { id: 'bulk-delete-complete' }
            );
            clearBulkDeleteProgressUi();
          }
          bulkDeleteCompletionFromEventRef.current = false;
        }, 150);
      } else {
        bulkDeleteCompletionFromEventRef.current = false;
      }
    }
  };

  const handleBulkDelete = async () => {
    if (totalSelectedRecords === 0) {
      toast.error('Please select records to delete.');
      return;
    }

    if (bulkDeleteType === 'hard') {
      setDeletePreviewOpen(true);
      setDeletePreview(null);
      setDeleteImpactPreview(null);
      setHardDeleteConfirmInput('');
      setPinVerifiedForCurrentPreview(false);
      setDeletePreviewLoading(true);
      try {
        let allIds: string[] = [];
        if (selectAllActive) {
          if (
            !selectionFilterSnapshot ||
            selectionIncludeDeletedSnapshot === null ||
            !selectionTableSnapshot
          ) {
            toast.error(
              'Selection snapshot is missing. Please re-run search and select records again.'
            );
            setDeletePreviewOpen(false);
            return;
          }
          const matchedIds = await invoke<string[]>(
            'bulk_get_matching_record_ids',
            {
              tableName: selectionTableSnapshot,
              filters: selectionFilterSnapshot,
              includeDeleted: selectionIncludeDeletedSnapshot,
            }
          );
          const excluded = excludedRecordIds;
          allIds = (Array.isArray(matchedIds) ? matchedIds : []).filter(
            id => !excluded.has(id)
          );
        } else {
          allIds = Array.from(selectedRecords);
        }

        let p: PreviewDeleteDependencies;
        if (allIds.length > PREVIEW_DELETE_CHUNK_SIZE) {
          const parts: PreviewDeleteDependencies[] = [];
          for (let i = 0; i < allIds.length; i += PREVIEW_DELETE_CHUNK_SIZE) {
            const recordIds = allIds.slice(i, i + PREVIEW_DELETE_CHUNK_SIZE);
            const part = await invoke<PreviewDeleteDependencies>(
              'preview_delete_dependencies',
              {
                tableName: selectedTable,
                recordIds,
              }
            );
            parts.push(part);
            await new Promise<void>(resolve => {
              setTimeout(resolve, 0);
            });
          }
          p = mergeDeletePreviewChunks(parts);
        } else {
          p = await invoke<PreviewDeleteDependencies>(
            'preview_delete_dependencies',
            {
              tableName: selectedTable,
              recordIds: allIds,
            }
          );
        }
        setDeletePreview(p);
        const impact = await invoke<HardDeleteImpactPreview>(
          'preview_hard_delete_impact',
          {
            tableName: selectedTable,
            recordIds: allIds,
          }
        );
        setDeleteImpactPreview(impact);
        logInfo(
          `Delete preview: table=${selectedTable} total_records=${p.total_records} can_hard_delete=${p.can_hard_delete}`,
          'delete'
        );
        if (!p.can_hard_delete) {
          logInfo('Hard delete blocked — dependencies detected', 'delete');
        }
        if (p.scan_timed_out) {
          logInfo(
            'Delete preview: reference scan timed out (safe fallback)',
            'delete'
          );
        }
      } catch (e) {
        console.error('Delete preview failed:', e);
        toast.error(`Delete preview failed: ${e}`);
        setDeletePreviewOpen(false);
      } finally {
        setDeletePreviewLoading(false);
      }
      return;
    }

    const confirmMessage = selectAllActive
      ? `Are you sure you want to soft delete ${totalSelectedRecords} records?\n\nDeleting records matching the original filter selection.`
      : `Are you sure you want to soft delete ${totalSelectedRecords} records?`;
    if (!(await confirmDestructive(confirmMessage))) {
      return;
    }
    await executeBulkDelete('soft');
  };

  const handleSelectAll = async () => {
    if (!bulkSearchResults) return;

    if (selectAllActive || selectedRecords.size > 0) {
      // Deselect all
      clearBulkSelectionState();
    } else {
      try {
        setSelectAllInProgress(true);
        if (bulkSearchResults.totalCount > AUTO_SELECT_ALL_MODE_THRESHOLD) {
          setSelectAllActive(true);
          setExcludedRecordIds(new Set());
          setSelectedRecords(new Set());
          setSelectionFilterSnapshot({ ...bulkFilters });
          setSelectionIncludeDeletedSnapshot(includeDeleted);
          setSelectionTableSnapshot(selectedTable);
          toast.warning(
            `Large dataset detected (${bulkSearchResults.totalCount.toLocaleString()} records). Select All Mode enabled with exclusions for better performance.`
          );
          return;
        }

        const allIds = await invoke<string[]>('bulk_get_matching_record_ids', {
          tableName: selectedTable,
          filters: bulkFilters,
          includeDeleted,
        });
        setSelectAllActive(false);
        setExcludedRecordIds(new Set());
        setSelectionFilterSnapshot(null);
        setSelectionIncludeDeletedSnapshot(null);
        setSelectionTableSnapshot(null);
        setSelectedRecords(new Set(Array.isArray(allIds) ? allIds : []));

        if (Array.isArray(allIds)) {
          if (allIds.length > LARGE_SELECTION_WARNING_THRESHOLD) {
            toast.warning(
              `Selected ${allIds.length.toLocaleString()} records. Large operations are processed in batches and may take longer.`
            );
          } else {
            toast.success(
              `Selected all ${allIds.length.toLocaleString()} matching records.`
            );
          }
        }
      } catch (error) {
        console.error('Select all failed:', error);
        toast.error(`Failed to select all records: ${error}`);
      } finally {
        setSelectAllInProgress(false);
      }
    }
  };

  // Backup Schedule Management Functions
  const loadBackupSchedules = async () => {
    try {
      const schedules = await invoke<BackupSchedule[]>('get_backup_schedules');
      setBackupSchedules(Array.isArray(schedules) ? schedules : []);
    } catch (error) {
      console.error('Failed to load backup schedules:', error);
      toast.error('Failed to load backup schedules');
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (
      !(await confirmDestructive(
        'Are you sure you want to delete this backup schedule?'
      ))
    )
      return;

    try {
      await invoke('delete_backup_schedule', {
        scheduleId,
        userId,
      });

      toast.success('Backup schedule deleted successfully');
      loadBackupSchedules();
    } catch (error) {
      console.error('Failed to delete backup schedule:', error);
      toast.error('Failed to delete backup schedule');
    }
  };

  const handleRunSchedule = async (scheduleId: number) => {
    try {
      const backupInfo = await invoke<BackupInfo>('run_scheduled_backup', {
        scheduleId,
        userId,
      });

      toast.success(`Scheduled backup completed: ${backupInfo.filename}`);
      await loadDashboardData();
      await loadBackupSchedules();
    } catch (error) {
      console.error('Failed to run scheduled backup:', error);
      toast.error(`Failed to run scheduled backup: ${error}`);
    }
  };

  const openCreateSchedule = () => {
    setEditingScheduleId(null);
    setScheduleForm(defaultScheduleForm());
    setScheduleDialogOpen(true);
  };

  const openEditSchedule = (schedule: BackupSchedule) => {
    setEditingScheduleId(schedule.id ?? null);
    setScheduleForm({
      ...defaultScheduleForm(),
      name: schedule.name,
      preset: 'custom',
      customCron: schedule.cron_expr?.trim() || '0 0 2 * * *',
      destination:
        schedule.destination === 'google_drive' ? 'google_drive' : 'local',
      retention_count: schedule.retention_count ?? 5,
      retention_days: schedule.retention_days ?? 30,
      enabled: schedule.enabled,
      notes: schedule.notes || '',
    });
    setScheduleDialogOpen(true);
  };

  const saveSchedule = async () => {
    const name = scheduleForm.name.trim();
    if (!name) {
      toast.error('Please enter a schedule name.');
      return;
    }
    if (
      scheduleForm.destination === 'google_drive' &&
      gdriveCloudBlocked(googleDriveStatus)
    ) {
      toast.error(
        googleDriveStatus?.state === 'not_configured'
          ? 'Google Drive is not configured for this build.'
          : 'Connect Google Drive before scheduling cloud backups.'
      );
      return;
    }
    let cron: string;
    try {
      cron = buildCronExpr(scheduleForm);
      if (!cron) {
        toast.error('Enter a valid cron expression.');
        return;
      }
    } catch {
      toast.error('Could not build schedule from the form.');
      return;
    }

    try {
      if (editingScheduleId != null) {
        await invoke('update_backup_schedule', {
          scheduleId: editingScheduleId,
          name,
          cronExpr: cron,
          destination: scheduleForm.destination,
          retentionCount: scheduleForm.retention_count,
          retentionDays: scheduleForm.retention_days,
          enabled: scheduleForm.enabled,
          timeZone: APP_TIMEZONE,
          notes: scheduleForm.notes.trim() || undefined,
          userId,
        });
        toast.success('Schedule updated');
      } else {
        await invoke('create_backup_schedule', {
          name,
          cronExpr: cron,
          destination: scheduleForm.destination,
          retentionCount: scheduleForm.retention_count,
          retentionDays: scheduleForm.retention_days,
          enabled: scheduleForm.enabled,
          timeZone: APP_TIMEZONE,
          notes: scheduleForm.notes.trim() || undefined,
          userId,
        });
        toast.success('Schedule created');
      }
      setScheduleDialogOpen(false);
      await loadBackupSchedules();
      await loadDashboardData();
    } catch (error) {
      console.error('Save schedule failed:', error);
      toast.error(`Save failed: ${error}`);
    }
  };

  // User Role Management Functions
  const loadUserRoles = async () => {
    try {
      const roles = await invoke<UserRole[]>('get_user_roles', {
        callerUserId: userId,
      });
      setUserRoles(Array.isArray(roles) ? roles : []);
    } catch (error) {
      console.error('Failed to load user roles:', error);
      toast.error('Failed to load user roles');
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (
      !(await confirmDestructive(
        'Are you sure you want to delete this user role?'
      ))
    )
      return;

    try {
      await invoke('delete_user_role', {
        role_id: roleId,
        deleted_by: 'admin',
      });

      toast.success('User role deleted successfully');
      loadUserRoles();
    } catch (error) {
      console.error('Failed to delete user role:', error);
      toast.error('Failed to delete user role');
    }
  };

  const handleSelectRecord = (recordId: string) => {
    if (selectAllActive) {
      const updated = new Set(excludedRecordIds);
      if (updated.has(recordId)) {
        updated.delete(recordId);
      } else {
        updated.add(recordId);
      }
      setExcludedRecordIds(updated);
      return;
    }

    const newSelection = new Set(selectedRecords);
    if (newSelection.has(recordId)) {
      newSelection.delete(recordId);
    } else {
      newSelection.add(recordId);
    }
    setSelectedRecords(newSelection);
  };

  if (loading) {
    return (
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'Database Management']} />
        <PageHeader
          title="Database Management"
          subtitle="Loading database management..."
        />
        <div className="im-dashboard-body flex h-96 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <span className="ml-2" style={{ color: 'var(--color-im-muted)' }}>
            Loading database management...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Database Management']} />
      <PageHeader
        title="Database Management"
        subtitle="Comprehensive database management, backup, and restore operations"
        actions={
          <button
            type="button"
            className="im-btn im-btn--primary im-btn--sm"
            onClick={() => {
              loadDashboardData();
              loadBackupHistory();
              loadBackupSchedules();
              loadUserRoles();
            }}
          >
            <RefreshCw
              style={{
                marginRight: 6,
                width: 14,
                height: 14,
                display: 'inline',
              }}
            />
            Refresh Data
          </button>
        }
      />

      <div
        className="im-dashboard-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <DatabaseSummaryStrip
          stats={stats}
          formatBytes={formatBytes}
          isTauriEnvironment={isTauriEnvironment}
          onExportBackupKey={handleExportBackupKey}
          onImportBackupKey={handleImportBackupKey}
        />

        {/* Main Content Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="im-tabs" style={{ flexShrink: 0 }}>
            <button
              type="button"
              className={
                'im-tab' + (activeTab === 'overview' ? ' is-active' : '')
              }
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={
                'im-tab' + (activeTab === 'browse' ? ' is-active' : '')
              }
              onClick={() => setActiveTab('browse')}
            >
              Browse &amp; Edit
            </button>
            <button
              type="button"
              className={'im-tab' + (activeTab === 'bulk' ? ' is-active' : '')}
              onClick={() => setActiveTab('bulk')}
            >
              Bulk Operations
            </button>
            <button
              type="button"
              className={
                'im-tab' + (activeTab === 'backup' ? ' is-active' : '')
              }
              onClick={() => setActiveTab('backup')}
            >
              Backup &amp; Restore
            </button>
            <button
              type="button"
              className={
                'im-tab' + (activeTab === 'schedules' ? ' is-active' : '')
              }
              onClick={() => setActiveTab('schedules')}
            >
              Backup Schedules
            </button>
            <button
              type="button"
              className={'im-tab' + (activeTab === 'roles' ? ' is-active' : '')}
              onClick={() => setActiveTab('roles')}
            >
              User Roles
            </button>
            <button
              type="button"
              className={'im-tab' + (activeTab === 'audit' ? ' is-active' : '')}
              onClick={() => setActiveTab('audit')}
            >
              Audit Logs
            </button>
            <button
              type="button"
              className={
                'im-tab' + (activeTab === 'settings' ? ' is-active' : '')
              }
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </div>

          {activeTab === 'overview' && (
            <DatabaseOverviewTab
              stats={stats}
              auditLogs={auditLogs}
              renderActionIcon={databaseAuditActionIcon}
            />
          )}

          {activeTab === 'browse' && (
            <DatabaseBrowseEditTab
              selectedTable={selectedTable}
              bulkTableOptions={bulkTableOptions}
              pinDialogOpen={pinDialogOpen}
              onTableChange={handleBrowseTableChange}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              includeDeleted={includeDeleted}
              onIncludeDeletedChange={setIncludeDeleted}
              onRefreshTable={loadTableData}
              tableData={tableData}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onEditRecord={handleEditRecord}
              onSoftDelete={handleSoftDelete}
            />
          )}

          {activeTab === 'bulk' && (
            <DatabaseBulkOperationsTab
              selectedTable={selectedTable}
              bulkTableOptions={bulkTableOptions}
              bulkBulkControlsDisabled={bulkBulkControlsDisabled}
              onBulkTableChange={handleBulkTableChange}
              includeDeleted={includeDeleted}
              onIncludeDeletedChange={setIncludeDeleted}
              onBulkSearch={() => void handleBulkSearch()}
              bulkOperationInProgress={bulkOperationInProgress}
              bulkFilters={bulkFilters}
              onBulkFiltersChange={setBulkFilters}
              bulkSearchResults={bulkSearchResults}
              totalSelectedRecords={totalSelectedRecords}
              selectAllActive={selectAllActive}
              excludedRecordIds={excludedRecordIds}
              selectedRecords={selectedRecords}
              bulkDeleteType={bulkDeleteType}
              onBulkDeleteTypeChange={setBulkDeleteType}
              onSelectAll={handleSelectAll}
              onBulkDelete={handleBulkDelete}
              onSelectRecord={handleSelectRecord}
            />
          )}

          {activeTab === 'backup' && (
            <DatabaseBackupRestoreTab
              isPlaywrightBuild={isPlaywrightBuild}
              onPlaywrightRestoreFileChange={
                handlePlaywrightRestoreFileSelected
              }
              backupHealth={backupHealth}
              redundancyForm={redundancyForm}
              setRedundancyForm={setRedundancyForm}
              redundancySaving={redundancySaving}
              onSaveRedundancySettings={handleSaveRedundancySettings}
              backupInProgress={backupInProgress}
              backupProgress={backupProgress}
              backupForm={backupForm}
              setBackupForm={setBackupForm}
              googleDriveStatus={googleDriveStatus}
              onRefreshGoogleProfile={handleRefreshGoogleProfile}
              onDisconnectGoogleDrive={handleDisconnectGoogleDrive}
              onConnectGoogleDrive={handleConnectGoogleDrive}
              onBackupNow={handleBackupNow}
              backupHistory={backupHistory}
              formatBytes={formatBytes}
              onRestorePreview={handleRestorePreview}
              onDownloadPlaywrightSnapshot={downloadPlaywrightBackupSnapshot}
            />
          )}

          {activeTab === 'schedules' && (
            <DatabaseSchedulesTab
              backupSchedules={backupSchedules}
              onCreateSchedule={openCreateSchedule}
              onRunSchedule={handleRunSchedule}
              onEditSchedule={openEditSchedule}
              onDeleteSchedule={handleDeleteSchedule}
            />
          )}

          {activeTab === 'roles' && (
            <DatabaseRolesTab
              userRoles={userRoles}
              onDeleteRole={handleDeleteRole}
            />
          )}

          {activeTab === 'audit' && (
            <DatabaseAuditTab
              auditLogs={auditLogs}
              renderActionIcon={databaseAuditActionIcon}
            />
          )}

          {activeTab === 'settings' && (
            <DatabaseSettingsTab
              pinSettings={pinSettings}
              pinLockActive={pinLockActive}
              pinLockRemainingSeconds={pinLockRemainingSeconds}
              pinThresholdInput={pinThresholdInput}
              onPinThresholdInputChange={setPinThresholdInput}
              onPinThresholdBlur={() =>
                void handleSaveHardDeletePinThreshold(pinThresholdInput)
              }
              onToggleHardDeletePinEnabled={handleToggleHardDeletePinEnabled}
              onOpenSetPin={() => setSetPinDialogVisible(true)}
              onOpenChangePin={() => setChangePinDialogOpen(true)}
            />
          )}
        </div>

        {/* Restore Preview Dialog */}
        {restorePreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="restore-preview-title"
              className="bg-background max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg p-6 shadow-lg"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="restore-preview-title" className="text-2xl font-bold">
                  Restore Preview
                </h2>
                <button
                  type="button"
                  className="im-btn"
                  onClick={() => {
                    setRestorePreview(null);
                    setSelectedBackup(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                {/* Backup Information */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span className="im-section__label">
                      Backup Information
                    </span>
                  </div>
                  <div className="im-section__body">
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 16,
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          Filename
                        </p>
                        <p style={{ color: 'var(--color-im-muted)' }}>
                          {restorePreview.backup_info.filename}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>Created</p>
                        <p style={{ color: 'var(--color-im-muted)' }}>
                          {formatAppDateTime(
                            restorePreview.backup_info.created_at
                          )}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          Size (recorded)
                        </p>
                        <p style={{ color: 'var(--color-im-muted)' }}>
                          {restorePreview.backup_info.size_bytes
                            ? formatBytes(restorePreview.backup_info.size_bytes)
                            : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          Backup file size (on disk)
                        </p>
                        <p style={{ color: 'var(--color-im-muted)' }}>
                          {restorePreview.backup_file_size_bytes > 0
                            ? formatBytes(restorePreview.backup_file_size_bytes)
                            : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          Estimated restore time
                        </p>
                        <p style={{ color: 'var(--color-im-muted)' }}>
                          ~{restorePreview.estimated_restore_seconds.toFixed(3)}{' '}
                          s
                          <span style={{ marginLeft: 4, fontSize: 11 }}>
                            (informational: size in MB × 0.02 s)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>Status</p>
                        <span
                          className={`im-badge ${restorePreview.backup_info.status === 'completed' ? 'is-good' : 'is-bad'}`}
                        >
                          {restorePreview.backup_info.status}
                        </span>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          Checksum (database)
                        </p>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          {(() => {
                            if (restorePreview.recorded_hash_match === false) {
                              return (
                                <span style={{ color: 'var(--color-im-bad)' }}>
                                  Checksum: FAILED
                                </span>
                              );
                            }
                            if (restorePreview.recorded_hash_match === true) {
                              return (
                                <span style={{ color: 'var(--color-im-good)' }}>
                                  Checksum: Verified
                                </span>
                              );
                            }
                            if (
                              restorePreview.backup_info.sha256 &&
                              restorePreview.backup_info.sha256.trim() !== ''
                            ) {
                              return (
                                <span
                                  style={{
                                    color: 'var(--color-im-muted)',
                                    fontSize: 13,
                                    fontWeight: 'normal',
                                  }}
                                >
                                  (Could not assess)
                                </span>
                              );
                            }
                            return (
                              <span
                                style={{
                                  color: 'var(--color-im-muted)',
                                  fontSize: 13,
                                  fontWeight: 'normal',
                                }}
                              >
                                No SHA-256 stored in library for this file
                              </span>
                            );
                          })()}
                        </p>
                        <p
                          style={{
                            color: 'var(--color-im-muted)',
                            marginTop: 4,
                            fontSize: 11,
                          }}
                        >
                          Sidecar:{' '}
                          {restorePreview.checksum_status === 'valid'
                            ? 'file matches .sha256'
                            : restorePreview.checksum_status === 'missing'
                              ? 'no .sha256 file next to backup (older backups are OK if DB hash verified)'
                              : 'sidecar does not match file'}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          Backup type
                        </p>
                        <p style={{ color: 'var(--color-im-muted)' }}>
                          {backupTypeLabel(restorePreview.backup_info)}
                        </p>
                      </div>
                      {backupTypeLabel(restorePreview.backup_info) ===
                        'Google Drive' && (
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 500 }}>
                            Google Drive file name
                          </p>
                          <p style={{ color: 'var(--color-im-muted)' }}>
                            {restorePreview.backup_info.filename}
                          </p>
                        </div>
                      )}
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          Stored validation
                        </p>
                        <p
                          style={{
                            color: 'var(--color-im-muted)',
                            fontSize: 11,
                          }}
                        >
                          {restorePreview.backup_info.validation_status ?? '—'}
                          {restorePreview.backup_info.validation_checked_at
                            ? ` • ${formatAppDateTime(
                                restorePreview.backup_info.validation_checked_at
                              )}`
                            : ''}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500 }}>
                          Restore simulation
                        </p>
                        <p
                          style={{
                            color: 'var(--color-im-muted)',
                            fontSize: 11,
                          }}
                        >
                          {restorePreview.backup_info
                            .restore_simulation_status ?? '—'}
                          {restorePreview.backup_info
                            .restore_simulation_checked_at
                            ? ` • ${formatAppDateTime(
                                restorePreview.backup_info
                                  .restore_simulation_checked_at
                              )}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Integrity Check */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span className="im-section__label">Integrity Check</span>
                  </div>
                  <div className="im-section__body">
                    <div
                      style={{
                        padding: '8px 12px',
                        border: '1px solid var(--color-im-rule)',
                        background: 'var(--color-im-panel)',
                        fontSize: 12,
                        color: 'var(--color-im-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>{restorePreview.integrity_check}</span>
                    </div>
                  </div>
                </div>

                {/* Schema Compatibility */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span className="im-section__label">
                      Schema Compatibility
                    </span>
                  </div>
                  <div className="im-section__body">
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      {restorePreview.schema_compatibility ? (
                        <CheckCircle
                          className="h-4 w-4"
                          style={{ color: 'var(--color-im-good)' }}
                        />
                      ) : (
                        <XCircle
                          className="h-4 w-4"
                          style={{ color: 'var(--color-im-bad)' }}
                        />
                      )}
                      <span
                        style={{
                          color: restorePreview.schema_compatibility
                            ? 'var(--color-im-good)'
                            : 'var(--color-im-bad)',
                        }}
                      >
                        {restorePreview.schema_compatibility
                          ? 'Schema is compatible'
                          : 'Schema compatibility issues detected'}
                      </span>
                    </div>
                    <p
                      style={{
                        color: 'var(--color-im-muted)',
                        marginTop: 12,
                        fontSize: 13,
                      }}
                    >
                      This app migration head:{' '}
                      {restorePreview.embedded_migration_head_version}
                      {restorePreview.backup_migration_max_version != null
                        ? ` — backup reports max version: ${restorePreview.backup_migration_max_version}`
                        : ''}
                    </p>
                    {restorePreview.missing_core_tables.length > 0 ? (
                      <p
                        style={{
                          color: 'var(--color-im-bad)',
                          marginTop: 8,
                          fontSize: 13,
                        }}
                      >
                        Missing core tables:{' '}
                        {restorePreview.missing_core_tables.join(', ')}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Estimated Changes */}
                {Object.keys(restorePreview.estimated_changes).length > 0 && (
                  <div className="im-section">
                    <div className="im-section__header">
                      <span className="im-section__label">
                        Estimated Changes
                      </span>
                      <span className="im-section__sub">
                        Records that will be added/removed by table
                      </span>
                    </div>
                    <div
                      className="im-section__body"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {Object.entries(restorePreview.estimated_changes).map(
                        ([table, change]) => (
                          <div
                            key={table}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                textTransform: 'capitalize',
                              }}
                            >
                              {table.replace(/_/g, ' ')}
                            </span>
                            <span
                              className={`im-badge ${change > 0 ? 'is-good' : 'is-bad'}`}
                            >
                              {change > 0 ? '+' : ''}
                              {change.toLocaleString()}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {restorePreview.warnings.length > 0 && (
                  <div className="im-section">
                    <div className="im-section__header">
                      <span className="im-section__label">Warnings</span>
                    </div>
                    <div
                      className="im-section__body"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {restorePreview.warnings.map((warning, index) => (
                        <div
                          key={index}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid var(--color-im-rule)',
                            background: 'var(--color-im-panel)',
                            fontSize: 12,
                            color: 'var(--color-im-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <AlertTriangle className="h-4 w-4" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 16,
                  }}
                >
                  <button
                    type="button"
                    className="im-btn"
                    onClick={() => {
                      setRestorePreview(null);
                      setSelectedBackup(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="im-btn im-btn--danger"
                    onClick={handleRestoreDatabase}
                    disabled={
                      restoreInProgress ||
                      !restorePreview.schema_compatibility ||
                      restorePreview.checksum_status === 'invalid' ||
                      restorePreview.recorded_hash_match === false
                    }
                    data-testid="restore-database-confirm-button"
                  >
                    {restoreInProgress ? (
                      <>
                        <RefreshCw
                          style={{
                            marginRight: 6,
                            width: 14,
                            height: 14,
                            display: 'inline',
                          }}
                          className="animate-spin"
                        />
                        Restoring...
                      </>
                    ) : (
                      <>
                        <Upload
                          style={{
                            marginRight: 6,
                            width: 14,
                            height: 14,
                            display: 'inline',
                          }}
                        />
                        Restore Database
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingScheduleId != null
                  ? 'Edit backup schedule'
                  : 'New backup schedule'}
              </DialogTitle>
              <DialogDescription>
                Times use six-field cron in{' '}
                <strong>IST (Asia/Kolkata, UTC+05:30)</strong> (sec min hour day
                month weekday). The app checks every minute and runs due
                schedules automatically.
              </DialogDescription>
            </DialogHeader>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                paddingTop: 8,
                paddingBottom: 8,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Name</p>
                <input
                  id="sched-name"
                  className="im-input"
                  value={scheduleForm.name}
                  onChange={e =>
                    setScheduleForm(prev => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Nightly backup"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Destination</p>
                <div className="im-select-wrap">
                  <select
                    className="im-select"
                    value={scheduleForm.destination}
                    onChange={e =>
                      setScheduleForm(prev => ({
                        ...prev,
                        destination: e.target.value as 'local' | 'google_drive',
                      }))
                    }
                  >
                    <option value="local">Local Storage</option>
                    <option value="google_drive">Google Drive</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Frequency</p>
                <div className="im-select-wrap">
                  <select
                    className="im-select"
                    value={scheduleForm.preset}
                    onChange={e =>
                      setScheduleForm(prev => ({
                        ...prev,
                        preset: e.target.value as SchedulePreset,
                      }))
                    }
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom (cron)</option>
                  </select>
                </div>
              </div>
              {scheduleForm.preset !== 'custom' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 12,
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <p className="im-field-label">Hour (IST)</p>
                    <input
                      id="sched-hour"
                      className="im-input"
                      type="number"
                      min={0}
                      max={23}
                      value={scheduleForm.hour}
                      onChange={e =>
                        setScheduleForm(prev => ({
                          ...prev,
                          hour: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <p className="im-field-label">Minute</p>
                    <input
                      id="sched-min"
                      className="im-input"
                      type="number"
                      min={0}
                      max={59}
                      value={scheduleForm.minute}
                      onChange={e =>
                        setScheduleForm(prev => ({
                          ...prev,
                          minute: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
              )}
              {scheduleForm.preset === 'weekly' && (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <p className="im-field-label">Weekday (IST)</p>
                  <div className="im-select-wrap">
                    <select
                      className="im-select"
                      value={String(scheduleForm.dayOfWeek)}
                      onChange={e =>
                        setScheduleForm(prev => ({
                          ...prev,
                          dayOfWeek: Number(e.target.value),
                        }))
                      }
                    >
                      <option value="0">Sunday</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                    </select>
                  </div>
                </div>
              )}
              {scheduleForm.preset === 'monthly' && (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <p className="im-field-label">Day of month (1–31)</p>
                  <input
                    id="sched-dom"
                    className="im-input"
                    type="number"
                    min={1}
                    max={31}
                    value={scheduleForm.dayOfMonth}
                    onChange={e =>
                      setScheduleForm(prev => ({
                        ...prev,
                        dayOfMonth: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              )}
              {scheduleForm.preset === 'custom' && (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <p className="im-field-label">Cron expression</p>
                  <input
                    id="sched-cron"
                    className="im-input"
                    value={scheduleForm.customCron}
                    onChange={e =>
                      setScheduleForm(prev => ({
                        ...prev,
                        customCron: e.target.value,
                      }))
                    }
                    placeholder="0 30 9 * * *"
                  />
                  <p style={{ color: 'var(--color-im-muted)', fontSize: 11 }}>
                    Six fields: second minute hour day-of-month month
                    day-of-week. Times are in IST (Asia/Kolkata).
                  </p>
                </div>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 12,
                }}
              >
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <p className="im-field-label">Keep last N backups</p>
                  <input
                    id="sched-ret-n"
                    className="im-input"
                    type="number"
                    min={1}
                    value={scheduleForm.retention_count}
                    onChange={e =>
                      setScheduleForm(prev => ({
                        ...prev,
                        retention_count: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <p className="im-field-label">Retention (days)</p>
                  <input
                    id="sched-ret-d"
                    className="im-input"
                    type="number"
                    min={1}
                    value={scheduleForm.retention_days}
                    onChange={e =>
                      setScheduleForm(prev => ({
                        ...prev,
                        retention_days: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  border: '1px solid var(--color-im-rule)',
                  padding: 12,
                }}
              >
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500 }}>Enabled</p>
                  <p style={{ color: 'var(--color-im-muted)', fontSize: 11 }}>
                    Disabled schedules are skipped by the scheduler.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={scheduleForm.enabled}
                  onChange={e =>
                    setScheduleForm(prev => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: 'var(--color-im-accent)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Notes</p>
                <textarea
                  id="sched-notes"
                  className="im-textarea"
                  value={scheduleForm.notes}
                  onChange={e =>
                    setScheduleForm(prev => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter style={{ gap: 8 }}>
              <button
                type="button"
                className="im-btn"
                onClick={() => setScheduleDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => void saveSchedule()}
              >
                Save
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Google Drive transfer progress (upload / download) */}
        {isTauriEnvironment && (gdriveOpLabel || gdriveTransfer) && (
          <div
            className="z-60 fixed inset-0 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gdrive-transfer-title"
          >
            <div
              style={{
                background: 'var(--color-im-surface)',
                width: '100%',
                maxWidth: 448,
                border: '1px solid var(--color-im-rule)',
                padding: 24,
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              }}
            >
              <h2
                id="gdrive-transfer-title"
                style={{ fontSize: 16, fontWeight: 600 }}
              >
                {gdriveOpLabel ?? 'Google Drive'}
              </h2>
              <p
                style={{
                  color: 'var(--color-im-muted)',
                  marginTop: 4,
                  fontSize: 12,
                }}
              >
                {gdriveTransfer?.phase ?? 'Working…'}
              </p>
              {gdriveTransfer?.message ? (
                <p
                  style={{
                    color: 'var(--color-im-muted)',
                    marginTop: 4,
                    fontSize: 11,
                  }}
                >
                  {gdriveTransfer.message}
                </p>
              ) : null}
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ height: 4, background: 'var(--color-im-rule)' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, gdriveTransfer?.percent ?? 0)}%`,
                      background: 'var(--color-im-accent)',
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
                <div
                  style={{
                    color: 'var(--color-im-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                  }}
                >
                  <span>
                    {gdriveTransfer?.percent ?? 0}%
                    {gdriveTransfer?.attempt != null &&
                    gdriveTransfer.attempt > 1
                      ? ` · Retry ${gdriveTransfer.attempt} of 3`
                      : null}
                  </span>
                  <span>
                    {formatBytes(Number(gdriveTransfer?.bytesTransferred ?? 0))}
                    {Number(gdriveTransfer?.totalBytes ?? 0) > 0
                      ? ` / ${formatBytes(Number(gdriveTransfer?.totalBytes ?? 0))}`
                      : ''}
                  </span>
                </div>
              </div>
              <div
                style={{
                  marginTop: 24,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="im-btn"
                  onClick={handleGdriveCancelTransfer}
                >
                  Cancel transfer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Record Modal */}
        {editingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
              style={{
                background: 'var(--color-im-surface)',
                maxHeight: '90vh',
                width: '100%',
                maxWidth: 896,
                overflowY: 'auto',
                padding: 24,
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              }}
            >
              <div
                style={{
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Edit Record</h2>
                <button
                  type="button"
                  className="im-btn"
                  onClick={() => {
                    setEditingRecord(null);
                    setEditForm({});
                  }}
                >
                  Close
                </button>
              </div>

              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 16,
                  }}
                >
                  {Object.entries(editForm).map(([key, value]) => {
                    // Skip system fields
                    if (
                      ['id', 'created_at', 'updated_at', 'deleted_at'].includes(
                        key
                      )
                    ) {
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          <p
                            className="im-field-label"
                            style={{ color: 'var(--color-im-muted)' }}
                          >
                            {key.replace(/_/g, ' ')} (Read-only)
                          </p>
                          <input
                            id={key}
                            className="im-input"
                            value={value?.toString() || ''}
                            disabled
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <p className="im-field-label">
                          {key.replace(/_/g, ' ')}
                          {editingRecord.data[key] !== value && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                color: 'var(--color-im-accent)',
                              }}
                            >
                              (Modified)
                            </span>
                          )}
                        </p>
                        {key.includes('description') ||
                        key.includes('notes') ||
                        key.includes('comment') ? (
                          <textarea
                            id={key}
                            className="im-textarea"
                            value={value?.toString() || ''}
                            onChange={e =>
                              setEditForm(prev => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            rows={3}
                          />
                        ) : (
                          <input
                            id={key}
                            className="im-input"
                            value={value?.toString() || ''}
                            onChange={e =>
                              setEditForm(prev => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 16,
                  }}
                >
                  <button
                    type="button"
                    className="im-btn"
                    onClick={() => {
                      setEditingRecord(null);
                      setEditForm({});
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="im-btn im-btn--primary"
                    onClick={handleUpdateRecord}
                  >
                    <CheckCircle
                      style={{
                        marginRight: 6,
                        width: 14,
                        height: 14,
                        display: 'inline',
                      }}
                    />
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Dialog
          open={setPinDialogVisible}
          onOpenChange={open => {
            setSetPinDialogVisible(open);
            if (!open) {
              setSetPinValue('');
              setSetPinConfirmValue('');
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Set Hard Delete PIN</DialogTitle>
              <DialogDescription>
                PIN must be numeric and at least 4 digits.
              </DialogDescription>
            </DialogHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label">New PIN</p>
                <input
                  id="set-pin-new"
                  className="im-input"
                  type="password"
                  inputMode="numeric"
                  value={setPinValue}
                  onChange={e => setSetPinValue(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label">Confirm PIN</p>
                <input
                  id="set-pin-confirm"
                  className="im-input"
                  type="password"
                  inputMode="numeric"
                  value={setPinConfirmValue}
                  onChange={e => setSetPinConfirmValue(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                className="im-btn"
                onClick={() => setSetPinDialogVisible(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => void handleSetHardDeletePin()}
              >
                Save PIN
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={changePinDialogOpen}
          onOpenChange={open => {
            setChangePinDialogOpen(open);
            if (!open) {
              setChangePinCurrent('');
              setChangePinNew('');
              setChangePinConfirm('');
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Hard Delete PIN</DialogTitle>
              <DialogDescription>
                Verify current PIN and set a new one.
              </DialogDescription>
            </DialogHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label">Current PIN</p>
                <input
                  id="change-pin-current"
                  className="im-input"
                  type="password"
                  inputMode="numeric"
                  value={changePinCurrent}
                  onChange={e => setChangePinCurrent(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label">New PIN</p>
                <input
                  id="change-pin-new"
                  className="im-input"
                  type="password"
                  inputMode="numeric"
                  value={changePinNew}
                  onChange={e => setChangePinNew(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="im-field-label">Confirm New PIN</p>
                <input
                  id="change-pin-confirm"
                  className="im-input"
                  type="password"
                  inputMode="numeric"
                  value={changePinConfirm}
                  onChange={e => setChangePinConfirm(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                className="im-btn"
                onClick={() => setChangePinDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => void handleChangeHardDeletePin()}
              >
                Update PIN
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={pinDialogOpen}
          onOpenChange={open => {
            setPinDialogOpen(open);
            if (!open) {
              setPinDialogValue('');
              setPinDialogError(null);
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Enter PIN to confirm hard delete</DialogTitle>
              <DialogDescription>
                This operation requires PIN verification.
              </DialogDescription>
            </DialogHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">PIN</p>
              <input
                id="hard-delete-pin-input"
                className="im-input"
                type="password"
                inputMode="numeric"
                value={pinDialogValue}
                onChange={e => setPinDialogValue(e.target.value)}
              />
              {pinDialogError && (
                <p style={{ fontSize: 12, color: 'var(--color-im-bad)' }}>
                  {pinDialogError}
                </p>
              )}
              {pinLockActive && (
                <p style={{ color: 'var(--color-im-muted)', fontSize: 11 }}>
                  Too many incorrect attempts. Try again in{' '}
                  {pinLockRemainingSeconds ?? 0} seconds.
                </p>
              )}
            </div>
            <DialogFooter>
              <button
                type="button"
                className="im-btn"
                onClick={() => setPinDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="im-btn im-btn--primary"
                disabled={pinLockActive}
                onClick={() => void handleVerifyPinForDelete()}
              >
                Confirm
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={deletePreviewOpen}
          onOpenChange={open => {
            setDeletePreviewOpen(open);
            if (!open) {
              setDeletePreview(null);
              setDeleteImpactPreview(null);
              setHardDeleteConfirmInput('');
              setPinVerifiedForCurrentPreview(false);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Preview</DialogTitle>
              <DialogDescription>
                {deletePreviewLoading
                  ? 'Checking references…'
                  : `Number of records selected: ${totalSelectedRecords}`}
              </DialogDescription>
            </DialogHeader>
            {deletePreviewLoading ? (
              <div
                style={{
                  color: 'var(--color-im-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingTop: 16,
                  paddingBottom: 16,
                  fontSize: 12,
                }}
              >
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Scanning foreign key references…</span>
              </div>
            ) : (
              deletePreview && (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <p style={{ fontSize: 12, fontWeight: 500 }}>
                    Blocked Records: {deletePreview.blocked_records} of{' '}
                    {deletePreview.total_records}
                  </p>
                  {deletePreview.scan_timed_out && (
                    <div
                      style={{
                        padding: '8px 12px',
                        border: '1px solid var(--color-im-rule)',
                        background: 'var(--color-im-panel)',
                        fontSize: 12,
                        color: 'var(--color-im-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      <span>
                        Reference scan did not finish in time. Hard delete is
                        disabled for safety. Try fewer selected records or
                        retry.
                      </span>
                    </div>
                  )}
                  {!deletePreview.scan_timed_out &&
                    !deletePreview.can_hard_delete && (
                      <div
                        style={{
                          padding: '8px 12px',
                          border: '1px solid var(--color-im-rule)',
                          background: 'var(--color-im-panel)',
                          fontSize: 12,
                          color: 'var(--color-im-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <span>This data is referenced in other modules.</span>
                      </div>
                    )}
                  {!deletePreview.scan_timed_out &&
                  deletePreview.dependency_summary.length > 0 ? (
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500 }}>
                        Referenced In:
                      </p>
                      <ul
                        style={{ marginTop: 4, paddingLeft: 20, fontSize: 12 }}
                      >
                        {deletePreview.dependency_summary.map(d => (
                          <li key={d.table}>
                            {formatTableLabel(d.table)}: {d.total_references}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : !deletePreview.scan_timed_out ? (
                    <p style={{ fontSize: 12, color: 'var(--color-im-faint)' }}>
                      No foreign key references from other tables were found for
                      the selected rows.
                    </p>
                  ) : null}
                  {deleteImpactPreview && (
                    <div
                      style={{
                        border: '1px solid var(--color-im-rule)',
                        padding: 12,
                        fontSize: 12,
                      }}
                    >
                      <p style={{ fontWeight: 500 }}>
                        Total records affected (including dependencies):{' '}
                        {deleteImpactPreview.total_with_dependencies.toLocaleString()}
                      </p>
                      <ul
                        style={{
                          color: 'var(--color-im-muted)',
                          marginTop: 8,
                          paddingLeft: 20,
                        }}
                      >
                        {deleteImpactPreview.by_table.slice(0, 6).map(row => (
                          <li key={row.table}>
                            {formatTableLabel(row.table)}:{' '}
                            {row.records.toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {deleteImpactPreview &&
                    deleteImpactPreview.total_with_dependencies > 5000 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            padding: '8px 12px',
                            border: '1px solid var(--color-im-rule)',
                            background: 'var(--color-im-panel)',
                            fontSize: 12,
                            color: 'var(--color-im-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <AlertTriangle className="h-4 w-4" />
                          <span>
                            This operation will delete{' '}
                            {deleteImpactPreview.total_with_dependencies.toLocaleString()}{' '}
                            records including dependencies.
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          <p className="im-field-label">
                            Type DELETE to confirm
                          </p>
                          <input
                            id="hard-delete-confirm"
                            className="im-input"
                            value={hardDeleteConfirmInput}
                            onChange={e =>
                              setHardDeleteConfirmInput(e.target.value)
                            }
                            placeholder="DELETE"
                          />
                        </div>
                      </div>
                    )}
                </div>
              )
            )}
            <DialogFooter style={{ flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="im-btn"
                onClick={() => {
                  setDeletePreviewOpen(false);
                  setDeletePreview(null);
                  setDeleteImpactPreview(null);
                  setHardDeleteConfirmInput('');
                }}
              >
                Cancel
              </button>
              {deletePreview && !deletePreview.can_hard_delete && (
                <button
                  type="button"
                  className="im-btn im-btn--primary"
                  onClick={async () => {
                    setDeletePreviewOpen(false);
                    setDeletePreview(null);
                    setBulkDeleteType('soft');
                    const ok = await confirmDestructive(
                      `Soft delete ${totalSelectedRecords} record(s)?`
                    );
                    if (ok) {
                      void executeBulkDelete('soft');
                    }
                  }}
                >
                  Soft Delete Instead
                </button>
              )}
              {deletePreview && (
                <button
                  type="button"
                  className="im-btn im-btn--danger"
                  disabled={pinLockActive}
                  onClick={async () => {
                    const totalAffected =
                      deleteImpactPreview?.total_with_dependencies ??
                      totalSelectedRecords;
                    const requiresPin =
                      !!pinSettings?.enabled &&
                      !!pinSettings?.hasPin &&
                      totalAffected >= (pinSettings?.threshold ?? 10);
                    if (pinLockActive) {
                      toast.error(
                        'Too many incorrect attempts. Try again later.'
                      );
                      setPinDialogOpen(true);
                      return;
                    }
                    if (requiresPin && !pinVerifiedForCurrentPreview) {
                      setPinDialogOpen(true);
                      return;
                    }
                    if (
                      deleteImpactPreview &&
                      deleteImpactPreview.total_with_dependencies > 5000 &&
                      hardDeleteConfirmInput !== 'DELETE'
                    ) {
                      toast.error(
                        'Type DELETE exactly to confirm this large hard delete operation.'
                      );
                      return;
                    }
                    const ok = await confirmDestructive(
                      deleteImpactPreview &&
                        deleteImpactPreview.total_with_dependencies > 5000
                        ? `This operation will delete ${deleteImpactPreview.total_with_dependencies.toLocaleString()} records including dependencies. Continue?`
                        : `Permanently delete ${totalSelectedRecords} record(s)? This cannot be undone.`
                    );
                    if (!ok) {
                      return;
                    }
                    logInfo(
                      `Hard delete confirmation accepted for table=${selectedTable} affected=${deleteImpactPreview?.total_with_dependencies ?? totalSelectedRecords}`,
                      'delete'
                    );
                    setDeletePreviewOpen(false);
                    setDeletePreview(null);
                    setDeleteImpactPreview(null);
                    setHardDeleteConfirmInput('');
                    setPinVerifiedForCurrentPreview(false);
                    void executeBulkDelete('hard');
                  }}
                >
                  Hard Delete
                </button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {(bulkDeleteInProgress || bulkDeleteTotalCount > 0) && (
          <div
            style={{
              background: 'var(--color-im-panel)',
              position: 'fixed',
              inset: '0 0 auto 0',
              borderTop: '1px solid var(--color-im-rule)',
              padding: 12,
              boxShadow: '0 -2px 8px rgba(0,0,0,0.4)',
              zIndex: 100,
            }}
            role="status"
            aria-live="polite"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <span>
                  {bulkDeleteProcessedCount === 0
                    ? 'Deleting records...'
                    : `Deleting records: ${bulkDeleteProcessedCount.toLocaleString()} / ${bulkDeleteTotalCount.toLocaleString()} (Batch ${bulkDeleteCurrentBatch} of ${bulkDeleteTotalBatches})`}
                </span>
                {bulkDeleteRetryHint ? (
                  <span style={{ color: 'var(--color-im-accent)' }}>
                    {bulkDeleteRetryHint}
                  </span>
                ) : null}
              </div>
              <div style={{ height: 4, background: 'var(--color-im-rule)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${bulkDeleteTotalCount > 0 ? Math.min(100, (bulkDeleteProcessedCount / bulkDeleteTotalCount) * 100) : 0}%`,
                    background: 'var(--color-im-accent)',
                    transition: 'width 0.2s',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DatabaseManagement() {
  return (
    <ErrorBoundary componentName="DatabaseManagement">
      <DatabaseManagementContent />
    </ErrorBoundary>
  );
}
