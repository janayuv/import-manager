/** Shared types and pure helpers for database management UI (extracted panels). */

export interface DatabaseStats {
  db_size_bytes: number;
  table_counts: Record<string, number>;
  last_backup?: string;
  next_scheduled_backup?: string;
  encryption_status: string;
}

export interface AuditLog {
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

export interface UserRole {
  id?: number;
  user_id: string;
  role: string;
  permissions?: string;
  created_at: string;
  updated_at: string;
}

export function safeTableCounts(
  stats: DatabaseStats | null | undefined
): Record<string, number> {
  const tc = stats?.table_counts;
  if (!tc || typeof tc !== 'object' || Array.isArray(tc)) {
    return {};
  }
  return tc as Record<string, number>;
}

export function totalRecordsFromStats(
  stats: DatabaseStats | null | undefined
): number {
  return Object.values(safeTableCounts(stats)).reduce(
    (a, b) => a + (typeof b === 'number' && !Number.isNaN(b) ? b : 0),
    0
  );
}

export function auditLogKey(log: AuditLog, index: number): string {
  if (log.id != null) return String(log.id);
  return `${log.created_at ?? 'unknown'}-${log.table_name ?? 'table'}-${log.row_id ?? index}`;
}

export interface TableData {
  tableName: string;
  columns: string[];
  rows: Array<Array<unknown>>;
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface BulkManageableTable {
  name: string;
  label: string;
}

export interface BulkSearchFilters {
  [key: string]: unknown;
}

export function formatBulkCell(cell: unknown): string {
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

export interface BackupInfo {
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
  validation_status?: string | null;
  validation_checked_at?: string | null;
  validation_message?: string | null;
  restore_simulation_status?: string | null;
  restore_simulation_checked_at?: string | null;
  restore_simulation_message?: string | null;
}

export interface BackupHealthMetrics {
  lastBackupTime?: string | null;
  latestLocalBackupId?: number | null;
  latestLocalBackupFilename?: string | null;
  latestLocalBackupCreatedAt?: string | null;
  latestLocalBackupSizeBytes?: number | null;
  backupAgeHours?: number | null;
  lastValidationStatus?: string | null;
  lastValidationAt?: string | null;
  lastRestoreSimulationStatus?: string | null;
  lastRestoreSimulationAt?: string | null;
  alerts: string[];
  secondaryRedundancyEnabled: boolean;
  secondaryRedundancyPath: string;
  sizeTrendNote?: string | null;
}

export interface BackupRedundancySettings {
  enabled: boolean;
  secondaryPath: string;
}

export interface GoogleDriveStatus {
  configured: boolean;
  connected: boolean;
  state: string;
  email?: string | null;
}

export interface BackupSchedule {
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

export interface HardDeletePinSettings {
  enabled: boolean;
  threshold: number;
  hasPin: boolean;
  failedAttempts: number;
  lockUntil: string | null;
  lockActive: boolean;
}

export interface RestorePreview {
  backup_info: BackupInfo;
  current_db_stats: DatabaseStats;
  backup_file_size_bytes: number;
  estimated_restore_seconds: number;
  checksum_status: string;
  recorded_hash_match: boolean | null;
  integrity_check: string;
  schema_compatibility: boolean;
  embedded_migration_head_version: number;
  backup_migration_max_version: number | null;
  missing_core_tables: string[];
  estimated_changes: Record<string, number>;
  warnings: string[];
}
