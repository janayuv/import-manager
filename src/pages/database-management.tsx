import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Database,
  Shield,
  Clock,
  HardDrive,
  Cloud,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  RefreshCw,
  Trash2,
  Edit3,
  AlertTriangle,
  Plus,
  Calendar,
  Play,
  Users,
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

interface DatabaseStats {
  db_size_bytes: number;
  table_counts: Record<string, number>;
  last_backup?: string;
  next_scheduled_backup?: string;
  encryption_status: string;
}

interface BackupInfo {
  id?: number;
  filename: string;
  path: string;
  destination: string;
  size_bytes?: number;
  sha256?: string;
  created_by?: string;
  created_at: string;
  retention_until?: string;
  notes?: string;
  status: string;
  error_message?: string;
}

interface AuditLog {
  id?: number;
  table_name: string;
  row_id?: string;
  action: string;
  user_id?: string;
  before_json?: string;
  after_json?: string;
  metadata?: string;
  created_at: string;
}

interface RestorePreview {
  backup_info: BackupInfo;
  current_db_stats: DatabaseStats;
  /** Byte length of the backup file on disk at preview time */
  backup_file_size_bytes: number;
  /** Informational: (size MB × 0.02) s */
  estimated_restore_seconds: number;
  /** `missing` | `valid` | `invalid` */
  checksum_status: string;
  /** `null` = no SHA-256 in backups row; `true`/`false` = file vs. recorded */
  recorded_hash_match: boolean | null;
  integrity_check: string;
  schema_compatibility: boolean;
  estimated_changes: Record<string, number>;
  warnings: string[];
}

interface RestoreResult {
  success: boolean;
  message: string;
  backup_created?: string;
  integrity_check: string;
  tables_affected: string[];
}

interface TableData {
  tableName: string;
  columns: string[];
  rows: Array<Array<unknown>>;
  totalCount: number;
  page: number;
  pageSize: number;
}

interface UpdateResult {
  success: boolean;
  message: string;
  changes: Record<string, unknown>;
  audit_id?: number;
}

interface BackupSchedule {
  id?: number;
  name: string;
  cron_expr?: string;
  time_zone?: string;
  destination: string;
  retention_count?: number;
  retention_days?: number;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  created_by?: string;
  created_at: string;
  notes?: string;
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

interface GoogleDriveStatus {
  configured: boolean;
  connected: boolean;
  /** not_configured | not_connected | connected */
  state: string;
  email?: string | null;
}

interface DriveTransferProgressPayload {
  phase: string;
  percent: number;
  bytesTransferred: number;
  totalBytes: number;
  attempt?: number;
  message?: string;
}

function normalizeGoogleDriveStatus(
  raw: Partial<GoogleDriveStatus> | null | undefined
): GoogleDriveStatus {
  const configured = Boolean(raw?.configured);
  const connected = Boolean(raw?.connected);
  let state = raw?.state;
  if (!state) {
    if (!configured) state = 'not_configured';
    else if (!connected) state = 'not_connected';
    else state = 'connected';
  }
  return {
    configured,
    connected,
    state,
    email: raw?.email ?? null,
  };
}

function invokeErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
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

function isGdriveBackupPath(path: string): boolean {
  return path.startsWith('gdrive:');
}

function gdriveCloudBlocked(status: GoogleDriveStatus | null): boolean {
  if (!status) return true;
  return status.state === 'not_configured' || status.state === 'not_connected';
}

function gdriveStatusIndicator(status: GoogleDriveStatus | null): string {
  if (!status) return '● Loading…';
  if (status.state === 'not_configured') return '● Not Configured';
  if (status.state === 'not_connected') return '● Not Connected';
  return `● Connected${status.email ? ` (${status.email})` : ''}`;
}

function backupTypeLabel(backup: BackupInfo): 'Google Drive' | 'Local' {
  return backup.destination === 'google_drive' ||
    backup.path.startsWith('gdrive:')
    ? 'Google Drive'
    : 'Local';
}

interface UserRole {
  id?: number;
  user_id: string;
  role: string;
  permissions?: string;
  created_at: string;
  updated_at: string;
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

interface BulkManageableTable {
  name: string;
  label: string;
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

interface HardDeletePinSettings {
  enabled: boolean;
  threshold: number;
  hasPin: boolean;
  failedAttempts: number;
  lockUntil: string | null;
  lockActive: boolean;
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

interface BulkSearchFilters {
  [key: string]: unknown;
}

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

function formatBulkCell(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object') {
    try {
      return JSON.stringify(cell);
    } catch {
      return '[object]';
    }
  }
  return String(cell);
}

/** Avoids render crashes when stats exist but table_counts is missing or wrong shape. */
function safeTableCounts(
  stats: DatabaseStats | null | undefined
): Record<string, number> {
  const tc = stats?.table_counts;
  if (!tc || typeof tc !== 'object' || Array.isArray(tc)) {
    return {};
  }
  return tc as Record<string, number>;
}

function totalRecordsFromStats(
  stats: DatabaseStats | null | undefined
): number {
  return Object.values(safeTableCounts(stats)).reduce(
    (a, b) => a + (typeof b === 'number' && !Number.isNaN(b) ? b : 0),
    0
  );
}

function auditLogKey(log: AuditLog, index: number): string {
  if (log.id != null) return String(log.id);
  return `${log.created_at ?? 'unknown'}-${log.table_name ?? 'table'}-${log.row_id ?? index}`;
}

function DatabaseManagementContent() {
  useEffect(() => {
    console.log('[Bulk] Component mounted');
  }, []);

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
  const [pageSize, setPageSize] = useState(50);
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
      console.log('[Bulk] Table changed:', newTable);
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
      console.log('[Bulk] Table changed:', newTable);
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
      const [statsData, backupsData, auditData, gdrive] = await Promise.all([
        invoke<DatabaseStats>('get_database_stats'),
        invoke<BackupInfo[]>('get_backup_history', { limit: 10 }),
        invoke<AuditLog[]>('get_audit_logs', { limit: 20 }),
        invoke<GoogleDriveStatus>('google_drive_status').catch(() =>
          normalizeGoogleDriveStatus({
            configured: false,
            connected: false,
            state: 'not_configured',
          })
        ),
      ]);

      setStats(statsData);
      setBackupHistory(Array.isArray(backupsData) ? backupsData : []);
      setAuditLogs(Array.isArray(auditData) ? auditData : []);
      setGoogleDriveStatus(normalizeGoogleDriveStatus(gdrive));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('Failed to load database management data');
    }
  }, []);

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
    try {
      toast.info('Complete sign-in in your browser…');
      await invoke('google_drive_connect', { userId });
      try {
        const s = await invoke<GoogleDriveStatus>('google_drive_status');
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
        const s2 = await invoke<GoogleDriveStatus>('google_drive_status');
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
      toast.error(
        e instanceof Error ? e.message : 'Failed to export backup key.'
      );
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
      toast.error(
        e instanceof Error ? e.message : 'Failed to import backup key.'
      );
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
      const roles = await invoke<UserRole[]>('get_user_roles');
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionIcon = (action: string) => {
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
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading database management...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-blue-600">
            Database Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive database management, backup, and restore operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            useAccentColor
            onClick={() => {
              loadDashboardData();
              loadBackupHistory();
              loadBackupSchedules();
              loadUserRoles();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database Size</CardTitle>
            <HardDrive className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats
                ? formatBytes(Number(stats.db_size_bytes ?? 0))
                : '0 Bytes'}
            </div>
            <p className="text-muted-foreground text-xs">
              {stats ? totalRecordsFromStats(stats) : 0} total records
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Backup</CardTitle>
            <Download className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.last_backup
                ? formatAppDateTime(stats.last_backup).split(' ')[0]
                : 'Never'}
            </div>
            <p className="text-muted-foreground text-xs">
              {stats?.last_backup
                ? formatAppDateTime(stats.last_backup).split(' ')[1]
                : 'No backups yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Backup</CardTitle>
            <Clock className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.next_scheduled_backup
                ? formatAppDateTime(stats.next_scheduled_backup).split(' ')[0]
                : 'None'}
            </div>
            <p className="text-muted-foreground text-xs">
              {stats?.next_scheduled_backup
                ? formatAppDateTime(stats.next_scheduled_backup).split(' ')[1]
                : 'No schedules'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security</CardTitle>
            <Shield className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge
                variant={
                  stats?.encryption_status === 'Encrypted' ||
                  stats?.encryption_status === 'AES-256 Enabled'
                    ? 'default'
                    : 'secondary'
                }
              >
                {stats?.encryption_status || 'None'}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              Backups: AES-256-GCM (key in system keyring)
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleExportBackupKey();
                }}
                disabled={!isTauriEnvironment}
                title="Save backup_key.imkey for disaster recovery or new PC"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export Backup Key
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleImportBackupKey();
                }}
                disabled={!isTauriEnvironment}
                title="Restore a key you exported on another device"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import Backup Key
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="browse">Browse & Edit</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Operations</TabsTrigger>
          <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
          <TabsTrigger value="schedules">Backup Schedules</TabsTrigger>
          <TabsTrigger value="roles">User Roles</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Table Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Table Statistics</CardTitle>
                <CardDescription>Record counts by table</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(safeTableCounts(stats)).map(
                    ([table, count]) => (
                      <div
                        key={table}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm font-medium capitalize">
                          {table.replace(/_/g, ' ')}
                        </span>
                        <Badge variant="outline">
                          {(typeof count === 'number'
                            ? count
                            : 0
                          ).toLocaleString()}
                        </Badge>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest database operations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {auditLogs.slice(0, 5).map((log, idx) => (
                    <div
                      key={auditLogKey(log, idx)}
                      className="flex items-center space-x-3"
                    >
                      {getActionIcon(log.action)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {log.action} on {log.table_name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatAppDateTime(log.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      No recent activity
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="browse" className="space-y-4">
          <div className="space-y-4">
            {/* Table Selection and Controls */}
            <Card>
              <CardHeader>
                <CardTitle>Browse & Edit Records</CardTitle>
                <CardDescription>
                  Select a table to view and edit records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="table-select">Table:</Label>
                    <Select
                      value={selectedTable}
                      disabled={pinDialogOpen}
                      onValueChange={handleBrowseTableChange}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {bulkTableOptions.map(option => (
                          <SelectItem key={option.name} value={option.name}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Label htmlFor="page-size">Page Size:</Label>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={value => setPageSize(Number(value))}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="include-deleted"
                      checked={includeDeleted}
                      disabled={pinDialogOpen}
                      onChange={e => setIncludeDeleted(e.target.checked)}
                    />
                    <Label htmlFor="include-deleted">Include Deleted</Label>
                  </div>

                  <Button
                    onClick={() => void loadTableData()}
                    variant="outline"
                    size="sm"
                    disabled={pinDialogOpen}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Data Table */}
            {tableData &&
              Array.isArray(tableData.columns) &&
              Array.isArray(tableData.rows) && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {(tableData.tableName || '').charAt(0).toUpperCase() +
                        (tableData.tableName || '').slice(1)}
                      ({Number(tableData.totalCount ?? 0).toLocaleString()}{' '}
                      records)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {tableData.columns.map(column => (
                              <TableHead key={column}>
                                {String(column).replace(/_/g, ' ')}
                              </TableHead>
                            ))}
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.rows.map((row, rowIndex) => {
                            if (!Array.isArray(row)) return null;
                            const recordId = row[0]?.toString() || '';
                            const recordData: Record<string, unknown> = {};
                            tableData.columns.forEach((column, colIndex) => {
                              recordData[column] = row[colIndex];
                            });

                            return (
                              <TableRow key={rowIndex}>
                                {row.map((cell, cellIndex) => (
                                  <TableCell key={cellIndex}>
                                    {cell === null ? (
                                      <span className="text-muted-foreground">
                                        null
                                      </span>
                                    ) : typeof cell === 'string' &&
                                      cell.length > 50 ? (
                                      <span title={cell}>
                                        {cell.substring(0, 50)}...
                                      </span>
                                    ) : (
                                      cell?.toString() || ''
                                    )}
                                  </TableCell>
                                ))}
                                <TableCell>
                                  <div className="flex space-x-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handleEditRecord(recordId, recordData)
                                      }
                                    >
                                      <Edit3 className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleSoftDelete(recordId)}
                                      className="text-orange-600 hover:text-orange-700"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        Showing {(tableData.page - 1) * tableData.pageSize + 1}{' '}
                        to{' '}
                        {Math.min(
                          tableData.page * tableData.pageSize,
                          tableData.totalCount
                        )}{' '}
                        of {tableData.totalCount} records
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCurrentPage(Math.max(1, currentPage - 1))
                          }
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="px-3 py-1 text-sm">
                          Page {currentPage} of{' '}
                          {Math.ceil(
                            tableData.totalCount /
                              Math.max(1, tableData.pageSize || 1)
                          )}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={
                            currentPage >=
                            Math.ceil(
                              tableData.totalCount /
                                Math.max(1, tableData.pageSize || 1)
                            )
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-4">
          <div className="space-y-4">
            {/* Bulk Search Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Bulk Search & Delete</CardTitle>
                <CardDescription>
                  Search for multiple records and perform bulk operations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Table Selection */}
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="bulk-table-select">Table:</Label>
                    <Select
                      value={selectedTable}
                      disabled={bulkBulkControlsDisabled}
                      onValueChange={handleBulkTableChange}
                    >
                      <SelectTrigger id="bulk-table-select" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {bulkTableOptions.map(option => (
                          <SelectItem key={option.name} value={option.name}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="bulk-include-deleted"
                      checked={includeDeleted}
                      disabled={bulkBulkControlsDisabled}
                      onCheckedChange={(checked: boolean) => {
                        setIncludeDeleted(checked as boolean);
                      }}
                    />
                    <Label htmlFor="bulk-include-deleted">
                      Include Deleted
                    </Label>
                  </div>

                  <Button
                    onClick={() => void handleBulkSearch()}
                    disabled={bulkBulkControlsDisabled}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4 ${bulkOperationInProgress ? 'animate-spin' : ''}`}
                    />
                    Search
                  </Button>
                </div>

                {/* Search Filters */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="filter-name">Name Filter</Label>
                    <Input
                      id="filter-name"
                      placeholder="Search by name..."
                      value={String(bulkFilters.name ?? '')}
                      disabled={bulkBulkControlsDisabled}
                      onChange={e => {
                        setBulkFilters(prev => ({
                          ...prev,
                          name: e.target.value || null,
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filter-status">Status Filter</Label>
                    <Input
                      id="filter-status"
                      placeholder="Search by status..."
                      value={String(bulkFilters.status ?? '')}
                      disabled={bulkBulkControlsDisabled}
                      onChange={e => {
                        setBulkFilters(prev => ({
                          ...prev,
                          status: e.target.value || null,
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filter-description">
                      Description Filter
                    </Label>
                    <Input
                      id="filter-description"
                      placeholder="Search by description..."
                      value={String(bulkFilters.description ?? '')}
                      disabled={bulkBulkControlsDisabled}
                      onChange={e => {
                        setBulkFilters(prev => ({
                          ...prev,
                          description: e.target.value || null,
                        }));
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bulk Operations Results */}
            {bulkSearchResults && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Search Results</CardTitle>
                      <CardDescription>
                        Found {bulkSearchResults.totalCount} records
                        {totalSelectedRecords > 0 &&
                          ` • ${totalSelectedRecords} selected`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleSelectAll()}
                        disabled={bulkBulkControlsDisabled}
                      >
                        {selectAllActive || totalSelectedRecords > 0
                          ? 'Deselect All'
                          : 'Select All'}
                      </Button>
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="delete-type">Delete Type:</Label>
                        <Select
                          value={bulkDeleteType}
                          disabled={bulkBulkControlsDisabled}
                          onValueChange={(value: 'soft' | 'hard') =>
                            setBulkDeleteType(value)
                          }
                        >
                          <SelectTrigger id="delete-type" className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="soft">Soft Delete</SelectItem>
                            <SelectItem value="hard">Hard Delete</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={
                          totalSelectedRecords === 0 || bulkBulkControlsDisabled
                        }
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Selected ({totalSelectedRecords})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 px-3 py-2 text-left">
                            <Checkbox
                              checked={
                                bulkSearchResults.totalCount > 0 &&
                                totalSelectedRecords ===
                                  bulkSearchResults.totalCount
                              }
                              disabled={bulkBulkControlsDisabled}
                              onCheckedChange={() => void handleSelectAll()}
                            />
                          </th>
                          {(Array.isArray(bulkSearchResults.columns)
                            ? bulkSearchResults.columns
                            : []
                          ).map((column, index) => (
                            <th
                              key={index}
                              className="border border-gray-300 px-3 py-2 text-left font-medium"
                            >
                              {column.charAt(0).toUpperCase() + column.slice(1)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(bulkSearchResults.rows)
                          ? bulkSearchResults.rows
                          : []
                        ).map((row, rowIndex) => {
                          if (!Array.isArray(row)) return null;
                          const recordId = row[0]?.toString() || '';
                          return (
                            <tr key={rowIndex} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-3 py-2">
                                <Checkbox
                                  checked={
                                    selectAllActive
                                      ? !excludedRecordIds.has(recordId)
                                      : selectedRecords.has(recordId)
                                  }
                                  disabled={bulkBulkControlsDisabled}
                                  onCheckedChange={() =>
                                    handleSelectRecord(recordId)
                                  }
                                />
                              </td>
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={cellIndex}
                                  className="border border-gray-300 px-3 py-2"
                                >
                                  {formatBulkCell(cell)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="backup" className="space-y-4">
          {isPlaywrightBuild && (
            <div className="sr-only">
              <label htmlFor="database-restore-file-input">
                Upload backup JSON for restore (Playwright)
              </label>
              <input
                id="database-restore-file-input"
                type="file"
                accept=".json,application/json"
                data-testid="database-restore-file-input"
                onChange={e => void handlePlaywrightRestoreFileSelected(e)}
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Create Backup */}
            <Card>
              <CardHeader>
                <CardTitle>Create Backup</CardTitle>
                <CardDescription>Create a new database backup</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {backupInProgress &&
                  backupForm.destination !== 'google_drive' && (
                    <Alert>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <AlertDescription>
                        Creating backup... {backupProgress}%
                        <Progress value={backupProgress} className="mt-2" />
                      </AlertDescription>
                    </Alert>
                  )}

                {googleDriveStatus?.state === 'not_configured' && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Google Drive requires OAuth credentials at build time (
                      <code className="text-xs">
                        IMPORT_MANAGER_GOOGLE_CLIENT_ID
                      </code>
                      ). Local backups work without this.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      <Cloud className="mr-1 inline h-4 w-4" />
                      Google Drive
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {googleDriveStatus?.state === 'connected' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Refresh account email"
                          onClick={() => void handleRefreshGoogleProfile()}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                      {googleDriveStatus?.configured ? (
                        googleDriveStatus.state === 'connected' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDisconnectGoogleDrive()}
                          >
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleConnectGoogleDrive()}
                          >
                            Connect
                          </Button>
                        )
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm font-medium">
                    {gdriveStatusIndicator(googleDriveStatus)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {googleDriveStatus?.state === 'not_configured'
                      ? 'Not available in this build.'
                      : googleDriveStatus?.state === 'connected'
                        ? 'You can back up to Google Drive or restore from cloud backups below. Retry and cancel are shown during upload or download.'
                        : 'Connect once to upload encrypted backups to your own Drive (app-created files only).'}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="destination">Destination</Label>
                    <Select
                      value={backupForm.destination}
                      onValueChange={value =>
                        setBackupForm(prev => ({ ...prev, destination: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local Storage</SelectItem>
                        <SelectItem value="google_drive">
                          Google Drive
                        </SelectItem>
                        <SelectItem value="s3" disabled>
                          AWS S3 (Coming Soon)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="filename">Filename (optional)</Label>
                    <Input
                      id="filename"
                      placeholder="Auto-generated if empty"
                      value={backupForm.filename}
                      onChange={e =>
                        setBackupForm(prev => ({
                          ...prev,
                          filename: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Optional backup notes"
                      value={backupForm.notes}
                      onChange={e =>
                        setBackupForm(prev => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <Button
                    onClick={handleBackupNow}
                    disabled={
                      backupInProgress ||
                      (backupForm.destination === 'google_drive' &&
                        gdriveCloudBlocked(googleDriveStatus))
                    }
                    className="w-full"
                    useAccentColor
                  >
                    {backupInProgress ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Creating Backup...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Create Backup Now
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Backup History */}
            <Card>
              <CardHeader>
                <CardTitle>Backup History</CardTitle>
                <CardDescription>Recent database backups</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {backupHistory.map(backup => (
                    <div
                      key={backup.id ?? backup.path}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(backup.status)}
                        <div>
                          <p className="text-sm font-medium">
                            {backup.filename}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Type: {backupTypeLabel(backup)}
                          </p>
                          {backupTypeLabel(backup) === 'Google Drive' && (
                            <p className="text-muted-foreground text-xs">
                              Google Drive file name: {backup.filename}
                            </p>
                          )}
                          <p className="text-muted-foreground text-xs">
                            {formatAppDateTime(backup.created_at)}
                            {' • '}
                            {backup.size_bytes != null
                              ? formatBytes(backup.size_bytes)
                              : 'Unknown size'}
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {isPlaywrightBuild && (
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={() =>
                              void downloadPlaywrightBackupSnapshot(backup.path)
                            }
                          >
                            <Download className="mr-1 h-4 w-4" />
                            Download snapshot
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestorePreview(backup.path)}
                          disabled={backup.status !== 'completed'}
                        >
                          <Upload className="mr-1 h-4 w-4" />
                          Preview Restore
                        </Button>
                      </div>
                    </div>
                  ))}
                  {backupHistory.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      No backups found
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Backup Schedules</h2>
              <p className="text-muted-foreground">
                Manage automated backup schedules
              </p>
            </div>
            <Button onClick={openCreateSchedule} useAccentColor>
              <Plus className="mr-2 h-4 w-4" />
              Create Schedule
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Active Schedules</CardTitle>
              <CardDescription>
                {backupSchedules.length} backup schedules configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              {backupSchedules.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  <Calendar className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No backup schedules configured</p>
                  <p className="text-sm">
                    Create your first schedule to automate backups
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {backupSchedules.map(schedule => (
                    <div
                      key={schedule.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{schedule.name}</h3>
                          <Badge
                            variant={schedule.enabled ? 'default' : 'secondary'}
                          >
                            {schedule.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {schedule.cron_expr ?? '—'} •{' '}
                          {schedule.destination === 'google_drive'
                            ? 'Google Drive'
                            : 'Local'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Last run:{' '}
                          {schedule.last_run
                            ? formatAppDateTime(schedule.last_run)
                            : 'Never'}{' '}
                          • Next run:{' '}
                          {schedule.next_run
                            ? formatAppDateTime(schedule.next_run)
                            : 'Not set'}
                        </p>
                        {schedule.notes && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {schedule.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunSchedule(schedule.id!)}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditSchedule(schedule)}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteSchedule(schedule.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">User Roles</h2>
              <p className="text-muted-foreground">
                Manage user roles and permissions
              </p>
            </div>
            <Button
              onClick={() => toast.info('Role creation feature coming soon')}
              useAccentColor
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Role
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>User Roles</CardTitle>
              <CardDescription>
                {userRoles.length} user roles configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userRoles.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No user roles configured</p>
                  <p className="text-sm">
                    Create roles to manage user permissions
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {userRoles.map(role => (
                    <div
                      key={role.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{role.user_id}</h3>
                          <Badge variant="outline">{role.role}</Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          Created:{' '}
                          {new Date(role.created_at).toLocaleDateString()}
                        </p>
                        {role.permissions && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            Custom permissions: {role.permissions}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            toast.info('Role editing feature coming soon')
                          }
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteRole(role.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>
                Complete log of database operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditLogs.map((log, idx) => (
                  <div
                    key={auditLogKey(log, idx)}
                    className="flex items-start space-x-3 rounded-lg border p-3"
                  >
                    {getActionIcon(log.action)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {log.action}
                        </Badge>
                        <span className="text-sm font-medium">
                          {log.table_name}
                        </span>
                        {log.row_id && (
                          <span className="text-muted-foreground text-xs">
                            #{log.row_id}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {formatAppDateTime(log.created_at)}
                        {log.user_id && ` • by ${log.user_id}`}
                      </p>
                      {log.metadata && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          {log.metadata}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No audit logs found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Database Settings</CardTitle>
              <CardDescription>
                Configure backup schedules and security settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Hard Delete Protection
                  </CardTitle>
                  <CardDescription>
                    Protect hard delete operations with a numeric PIN.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        Enable Hard Delete PIN
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Require PIN when affected records exceed threshold.
                      </p>
                    </div>
                    <Switch
                      checked={!!pinSettings?.enabled}
                      onCheckedChange={checked =>
                        void handleToggleHardDeletePinEnabled(checked)
                      }
                      disabled={!pinSettings?.hasPin}
                    />
                  </div>
                  {!pinSettings?.hasPin && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        PIN is not set. Set a PIN to enable protection.
                      </AlertDescription>
                    </Alert>
                  )}
                  {pinLockActive && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Too many incorrect attempts. Try again in{' '}
                        {pinLockRemainingSeconds ?? 0} seconds.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pin-threshold">
                        Require PIN when deleting more than:
                      </Label>
                      <Input
                        id="pin-threshold"
                        type="number"
                        min={1}
                        value={pinThresholdInput}
                        onChange={e =>
                          setPinThresholdInput(Number(e.target.value))
                        }
                        onBlur={() =>
                          void handleSaveHardDeletePinThreshold(
                            pinThresholdInput
                          )
                        }
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button onClick={() => setSetPinDialogVisible(true)}>
                        Set PIN
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setChangePinDialogOpen(true)}
                        disabled={!pinSettings?.hasPin}
                      >
                        Change PIN
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
              <Button
                variant="outline"
                onClick={() => {
                  setRestorePreview(null);
                  setSelectedBackup(null);
                }}
              >
                Close
              </Button>
            </div>

            <div className="space-y-6">
              {/* Backup Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Backup Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium">Filename</p>
                      <p className="text-muted-foreground">
                        {restorePreview.backup_info.filename}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Created</p>
                      <p className="text-muted-foreground">
                        {formatAppDateTime(
                          restorePreview.backup_info.created_at
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Size (recorded)</p>
                      <p className="text-muted-foreground">
                        {restorePreview.backup_info.size_bytes
                          ? formatBytes(restorePreview.backup_info.size_bytes)
                          : 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Backup file size (on disk)
                      </p>
                      <p className="text-muted-foreground">
                        {restorePreview.backup_file_size_bytes > 0
                          ? formatBytes(restorePreview.backup_file_size_bytes)
                          : 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Estimated restore time
                      </p>
                      <p className="text-muted-foreground">
                        ~{restorePreview.estimated_restore_seconds.toFixed(3)} s
                        <span className="ml-1 text-xs">
                          (informational: size in MB × 0.02 s)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Status</p>
                      <Badge
                        variant={
                          restorePreview.backup_info.status === 'completed'
                            ? 'default'
                            : 'destructive'
                        }
                      >
                        {restorePreview.backup_info.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Checksum (database)</p>
                      <p className="text-sm font-medium">
                        {(() => {
                          if (restorePreview.recorded_hash_match === false) {
                            return (
                              <span className="text-destructive">
                                Checksum: FAILED
                              </span>
                            );
                          }
                          if (restorePreview.recorded_hash_match === true) {
                            return (
                              <span className="text-green-600">
                                Checksum: Verified
                              </span>
                            );
                          }
                          if (
                            restorePreview.backup_info.sha256 &&
                            restorePreview.backup_info.sha256.trim() !== ''
                          ) {
                            return (
                              <span className="text-muted-foreground text-sm font-normal">
                                (Could not assess)
                              </span>
                            );
                          }
                          return (
                            <span className="text-muted-foreground text-sm font-normal">
                              No SHA-256 stored in library for this file
                            </span>
                          );
                        })()}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Sidecar:{' '}
                        {restorePreview.checksum_status === 'valid'
                          ? 'file matches .sha256'
                          : restorePreview.checksum_status === 'missing'
                            ? 'no .sha256 file next to backup (older backups are OK if DB hash verified)'
                            : 'sidecar does not match file'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Backup type</p>
                      <p className="text-muted-foreground">
                        {backupTypeLabel(restorePreview.backup_info)}
                      </p>
                    </div>
                    {backupTypeLabel(restorePreview.backup_info) ===
                      'Google Drive' && (
                      <div>
                        <p className="text-sm font-medium">
                          Google Drive file name
                        </p>
                        <p className="text-muted-foreground">
                          {restorePreview.backup_info.filename}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Integrity Check */}
              <Card>
                <CardHeader>
                  <CardTitle>Integrity Check</CardTitle>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      {restorePreview.integrity_check}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              {/* Schema Compatibility */}
              <Card>
                <CardHeader>
                  <CardTitle>Schema Compatibility</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    {restorePreview.schema_compatibility ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span
                      className={
                        restorePreview.schema_compatibility
                          ? 'text-green-600'
                          : 'text-red-600'
                      }
                    >
                      {restorePreview.schema_compatibility
                        ? 'Schema is compatible'
                        : 'Schema compatibility issues detected'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Estimated Changes */}
              {Object.keys(restorePreview.estimated_changes).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Estimated Changes</CardTitle>
                    <CardDescription>
                      Records that will be added/removed by table
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(restorePreview.estimated_changes).map(
                        ([table, change]) => (
                          <div
                            key={table}
                            className="flex items-center justify-between"
                          >
                            <span className="text-sm font-medium capitalize">
                              {table.replace(/_/g, ' ')}
                            </span>
                            <Badge
                              variant={change > 0 ? 'default' : 'destructive'}
                            >
                              {change > 0 ? '+' : ''}
                              {change.toLocaleString()}
                            </Badge>
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Warnings */}
              {restorePreview.warnings.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Warnings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {restorePreview.warnings.map((warning, index) => (
                        <Alert key={index}>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{warning}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRestorePreview(null);
                    setSelectedBackup(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRestoreDatabase}
                  disabled={
                    restoreInProgress ||
                    !restorePreview.schema_compatibility ||
                    restorePreview.checksum_status === 'invalid' ||
                    restorePreview.recorded_hash_match === false
                  }
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="restore-database-confirm-button"
                >
                  {restoreInProgress ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Restore Database
                    </>
                  )}
                </Button>
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
              month weekday). The app checks every minute and runs due schedules
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sched-name">Name</Label>
              <Input
                id="sched-name"
                value={scheduleForm.name}
                onChange={e =>
                  setScheduleForm(prev => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Nightly backup"
              />
            </div>
            <div className="space-y-2">
              <Label>Destination</Label>
              <Select
                value={scheduleForm.destination}
                onValueChange={v =>
                  setScheduleForm(prev => ({
                    ...prev,
                    destination: v as 'local' | 'google_drive',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Storage</SelectItem>
                  <SelectItem value="google_drive">Google Drive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={scheduleForm.preset}
                onValueChange={v =>
                  setScheduleForm(prev => ({
                    ...prev,
                    preset: v as SchedulePreset,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom (cron)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleForm.preset !== 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sched-hour">Hour (IST)</Label>
                  <Input
                    id="sched-hour"
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
                <div className="space-y-2">
                  <Label htmlFor="sched-min">Minute</Label>
                  <Input
                    id="sched-min"
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
              <div className="space-y-2">
                <Label>Weekday (IST)</Label>
                <Select
                  value={String(scheduleForm.dayOfWeek)}
                  onValueChange={v =>
                    setScheduleForm(prev => ({
                      ...prev,
                      dayOfWeek: Number(v),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {scheduleForm.preset === 'monthly' && (
              <div className="space-y-2">
                <Label htmlFor="sched-dom">Day of month (1–31)</Label>
                <Input
                  id="sched-dom"
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
              <div className="space-y-2">
                <Label htmlFor="sched-cron">Cron expression</Label>
                <Input
                  id="sched-cron"
                  value={scheduleForm.customCron}
                  onChange={e =>
                    setScheduleForm(prev => ({
                      ...prev,
                      customCron: e.target.value,
                    }))
                  }
                  placeholder="0 30 9 * * *"
                />
                <p className="text-muted-foreground text-xs">
                  Six fields: second minute hour day-of-month month day-of-week.
                  Times are in IST (Asia/Kolkata).
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sched-ret-n">Keep last N backups</Label>
                <Input
                  id="sched-ret-n"
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
              <div className="space-y-2">
                <Label htmlFor="sched-ret-d">Retention (days)</Label>
                <Input
                  id="sched-ret-d"
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
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-muted-foreground text-xs">
                  Disabled schedules are skipped by the scheduler.
                </p>
              </div>
              <Switch
                checked={scheduleForm.enabled}
                onCheckedChange={checked =>
                  setScheduleForm(prev => ({ ...prev, enabled: checked }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-notes">Notes</Label>
              <Textarea
                id="sched-notes"
                value={scheduleForm.notes}
                onChange={e =>
                  setScheduleForm(prev => ({ ...prev, notes: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              type="button"
              onClick={() => setScheduleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveSchedule()}
              useAccentColor
            >
              Save
            </Button>
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
          <div className="bg-background w-full max-w-md rounded-lg border p-6 shadow-lg">
            <h2 id="gdrive-transfer-title" className="text-lg font-semibold">
              {gdriveOpLabel ?? 'Google Drive'}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {gdriveTransfer?.phase ?? 'Working…'}
            </p>
            {gdriveTransfer?.message ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {gdriveTransfer.message}
              </p>
            ) : null}
            <div className="mt-4 space-y-2">
              <Progress value={Math.min(100, gdriveTransfer?.percent ?? 0)} />
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>
                  {gdriveTransfer?.percent ?? 0}%
                  {gdriveTransfer?.attempt != null && gdriveTransfer.attempt > 1
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
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleGdriveCancelTransfer}
              >
                Cancel transfer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Edit Record</h2>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingRecord(null);
                  setEditForm({});
                }}
              >
                Close
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Object.entries(editForm).map(([key, value]) => {
                  // Skip system fields
                  if (
                    ['id', 'created_at', 'updated_at', 'deleted_at'].includes(
                      key
                    )
                  ) {
                    return (
                      <div key={key} className="space-y-2">
                        <Label
                          htmlFor={key}
                          className="text-sm font-medium text-gray-500"
                        >
                          {key.replace(/_/g, ' ')} (Read-only)
                        </Label>
                        <Input
                          id={key}
                          value={value?.toString() || ''}
                          disabled
                          className="bg-gray-50"
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>
                        {key.replace(/_/g, ' ')}
                        {editingRecord.data[key] !== value && (
                          <span className="ml-2 text-xs text-blue-600">
                            (Modified)
                          </span>
                        )}
                      </Label>
                      {key.includes('description') ||
                      key.includes('notes') ||
                      key.includes('comment') ? (
                        <Textarea
                          id={key}
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
                        <Input
                          id={key}
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

              <div className="flex justify-end space-x-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingRecord(null);
                    setEditForm({});
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleUpdateRecord}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
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
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="set-pin-new">New PIN</Label>
              <Input
                id="set-pin-new"
                type="password"
                inputMode="numeric"
                value={setPinValue}
                onChange={e => setSetPinValue(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="set-pin-confirm">Confirm PIN</Label>
              <Input
                id="set-pin-confirm"
                type="password"
                inputMode="numeric"
                value={setPinConfirmValue}
                onChange={e => setSetPinConfirmValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSetPinDialogVisible(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSetHardDeletePin()}>
              Save PIN
            </Button>
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
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="change-pin-current">Current PIN</Label>
              <Input
                id="change-pin-current"
                type="password"
                inputMode="numeric"
                value={changePinCurrent}
                onChange={e => setChangePinCurrent(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="change-pin-new">New PIN</Label>
              <Input
                id="change-pin-new"
                type="password"
                inputMode="numeric"
                value={changePinNew}
                onChange={e => setChangePinNew(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="change-pin-confirm">Confirm New PIN</Label>
              <Input
                id="change-pin-confirm"
                type="password"
                inputMode="numeric"
                value={changePinConfirm}
                onChange={e => setChangePinConfirm(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChangePinDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleChangeHardDeletePin()}>
              Update PIN
            </Button>
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
          <div className="space-y-2">
            <Label htmlFor="hard-delete-pin-input">PIN</Label>
            <Input
              id="hard-delete-pin-input"
              type="password"
              inputMode="numeric"
              value={pinDialogValue}
              onChange={e => setPinDialogValue(e.target.value)}
            />
            {pinDialogError && (
              <p className="text-sm text-red-600">{pinDialogError}</p>
            )}
            {pinLockActive && (
              <p className="text-muted-foreground text-xs">
                Too many incorrect attempts. Try again in{' '}
                {pinLockRemainingSeconds ?? 0} seconds.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pinLockActive}
              onClick={() => void handleVerifyPinForDelete()}
            >
              Confirm
            </Button>
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
            <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Scanning foreign key references…</span>
            </div>
          ) : (
            deletePreview && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  Blocked Records: {deletePreview.blocked_records} of{' '}
                  {deletePreview.total_records}
                </p>
                {deletePreview.scan_timed_out && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Reference scan did not finish in time. Hard delete is
                      disabled for safety. Try fewer selected records or retry.
                    </AlertDescription>
                  </Alert>
                )}
                {!deletePreview.scan_timed_out &&
                  !deletePreview.can_hard_delete && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        This data is referenced in other modules.
                      </AlertDescription>
                    </Alert>
                  )}
                {!deletePreview.scan_timed_out &&
                deletePreview.dependency_summary.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium">Referenced In:</p>
                    <ul className="mt-1 list-inside list-disc text-sm">
                      {deletePreview.dependency_summary.map(d => (
                        <li key={d.table}>
                          {formatTableLabel(d.table)}: {d.total_references}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : !deletePreview.scan_timed_out ? (
                  <p className="text-muted-foreground text-sm">
                    No foreign key references from other tables were found for
                    the selected rows.
                  </p>
                ) : null}
                {deleteImpactPreview && (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      Total records affected (including dependencies):{' '}
                      {deleteImpactPreview.total_with_dependencies.toLocaleString()}
                    </p>
                    <ul className="text-muted-foreground mt-2 list-inside list-disc">
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
                    <div className="space-y-2">
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          This operation will delete{' '}
                          {deleteImpactPreview.total_with_dependencies.toLocaleString()}{' '}
                          records including dependencies.
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-1">
                        <Label htmlFor="hard-delete-confirm">
                          Type DELETE to confirm
                        </Label>
                        <Input
                          id="hard-delete-confirm"
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
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setDeletePreviewOpen(false);
                setDeletePreview(null);
                setDeleteImpactPreview(null);
                setHardDeleteConfirmInput('');
              }}
            >
              Cancel
            </Button>
            {deletePreview && !deletePreview.can_hard_delete && (
              <Button
                variant="default"
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
              </Button>
            )}
            {deletePreview && (
              <Button
                variant="destructive"
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
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(bulkDeleteInProgress || bulkDeleteTotalCount > 0) && (
        <div
          className="bg-background/95 supports-backdrop-filter:bg-background/80 z-100 fixed inset-x-0 bottom-0 border-t p-3 shadow-lg backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <div className="container mx-auto space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {bulkDeleteProcessedCount === 0
                  ? 'Deleting records...'
                  : `Deleting records: ${bulkDeleteProcessedCount.toLocaleString()} / ${bulkDeleteTotalCount.toLocaleString()} (Batch ${bulkDeleteCurrentBatch} of ${bulkDeleteTotalBatches})`}
              </span>
              {bulkDeleteRetryHint ? (
                <span className="text-amber-600 dark:text-amber-500">
                  {bulkDeleteRetryHint}
                </span>
              ) : null}
            </div>
            <Progress
              value={
                bulkDeleteTotalCount > 0
                  ? Math.min(
                      100,
                      (bulkDeleteProcessedCount / bulkDeleteTotalCount) * 100
                    )
                  : 0
              }
            />
          </div>
        </div>
      )}
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
