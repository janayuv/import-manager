import { safeInvoke as invoke } from '@/lib/ipc-safe';

export type BackgroundTaskDurations = {
  lastFastTickUnixMs: number | null;
  fastTickTotalMs: number | null;
  backupSchedulesMs: number | null;
  dashboardMaintenanceMs: number | null;
  governanceMs: number | null;
  lastHeavyTickUnixMs: number | null;
  heavyTickTotalMs: number | null;
  boeMaintenanceMs: number | null;
  integrityCheckMs: number | null;
  lastBoeMaintenanceError: string | null;
  lastIntegrityError: string | null;
};

export type HealthSummary = {
  overall: string;
  warnings: string[];
};

/** Matches Rust `migrations::SchemaHealth` (camelCase). */
export type SchemaHealth = {
  state: string;
  expectedVersion: number;
  appliedVersion: number;
  pendingMigrationRows: number;
  integrityError: string | null;
};

export type SystemHealthMetrics = {
  /** Semver from the native binary; should match Help → About and `package.json` at build time. */
  appVersion: string;
  databaseSizeBytes: number;
  databasePageCount: number;
  databasePageSize: number;
  lastBackupTime: string | null;
  lastSnapshotTime: string | null;
  lastDashboardSnapshotRebuildAt: string | null;
  backgroundTaskDurations: BackgroundTaskDurations;
  activeWorkflowCount: number;
  healthSummary: HealthSummary;
  schemaHealth: SchemaHealth;
};

export async function getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
  return invoke<SystemHealthMetrics>('get_system_health_metrics');
}
