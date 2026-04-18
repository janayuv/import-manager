import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
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
  Download,
  Upload,
  Settings,
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
  cron_expr: string;
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
}

interface BulkSearchFilters {
  [key: string]: unknown;
}

export default function DatabaseManagement() {
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

  // Browse/Edit state
  const [selectedTable, setSelectedTable] = useState<string>('suppliers');
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editingRecord, setEditingRecord] = useState<{
    id: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  // Bulk operations state
  const [bulkFilters, setBulkFilters] = useState<BulkSearchFilters>({});
  const [bulkSearchResults, setBulkSearchResults] = useState<TableData | null>(
    null
  );
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(
    new Set()
  );
  const [bulkDeleteType, setBulkDeleteType] = useState<'soft' | 'hard'>('soft');
  const [bulkOperationInProgress, setBulkOperationInProgress] = useState(false);

  // Backup schedule state
  const [backupSchedules, setBackupSchedules] = useState<BackupSchedule[]>([]);

  // User roles state
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);

  // Backup form state
  const [backupForm, setBackupForm] = useState({
    destination: 'local',
    filename: '',
    include_wal: true,
    notes: '',
  });

  useEffect(() => {
    loadDashboardData();
    loadBackupHistory();
    loadBackupSchedules();
    loadUserRoles();
  }, []);

  const loadTableData = useCallback(async () => {
    try {
      const data = await invoke<TableData>('browse_table_data', {
        tableName: selectedTable,
        page: currentPage,
        pageSize: pageSize,
        includeDeleted: includeDeleted,
      });
      setTableData(data);
    } catch (error) {
      console.error('Failed to load table data:', error);
      toast.error(`Failed to load table data: ${error}`);
    }
  }, [selectedTable, currentPage, pageSize, includeDeleted]);

  useEffect(() => {
    loadTableData();
  }, [loadTableData]);

  const loadBackupHistory = async () => {
    try {
      const history = await invoke<BackupInfo[]>('get_backup_history');
      setBackupHistory(history);
    } catch (error) {
      console.error('Failed to load backup history:', error);
      toast.error('Failed to load backup history');
    }
  };

  const loadDashboardData = async (opts?: { soft?: boolean }) => {
    const soft = opts?.soft === true;
    try {
      if (!soft) {
        setLoading(true);
      }
      const [statsData, backupsData, auditData] = await Promise.all([
        invoke<DatabaseStats>('get_database_stats'),
        invoke<BackupInfo[]>('get_backup_history', { limit: 10 }),
        invoke<AuditLog[]>('get_audit_logs', { limit: 20 }),
      ]);

      setStats(statsData);
      setBackupHistory(backupsData);
      setAuditLogs(auditData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('Failed to load database management data');
    } finally {
      if (!soft) {
        setLoading(false);
      }
    }
  };

  const formatBytes = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const handleBackupNow = async () => {
    try {
      setBackupInProgress(true);
      setBackupProgress(0);

      // Simulate progress for UI feedback
      const progressInterval = setInterval(() => {
        setBackupProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const result = await invoke<BackupInfo>('create_backup', {
        request: {
          destination: backupForm.destination,
          filename: backupForm.filename || undefined,
          include_wal: backupForm.include_wal,
          notes: backupForm.notes || undefined,
        },
        user_id: 'current_user', // TODO: Get from auth context
      });

      clearInterval(progressInterval);
      setBackupProgress(100);

      toast.success(`Backup created successfully: ${result.filename}`);

      // Refresh data without full-page loading (would remount Tabs and jump away from Backup).
      await loadDashboardData({ soft: true });

      // Reset form
      setBackupForm({
        destination: 'local',
        filename: '',
        include_wal: true,
        notes: '',
      });
    } catch (error) {
      console.error('Backup failed:', error);
      toast.error(`Backup failed: ${error}`);
    } finally {
      setTimeout(() => {
        setBackupInProgress(false);
        setBackupProgress(0);
      }, 1000);
    }
  };

  const handleRestorePreview = async (backupPath: string) => {
    try {
      setSelectedBackup(backupPath);
      const preview = await invoke<RestorePreview>('preview_restore', {
        backupPath: backupPath,
      });
      setRestorePreview(preview);
    } catch (error) {
      console.error('Failed to preview restore:', error);
      toast.error(`Failed to preview restore: ${error}`);
    }
  };

  const handleRestoreDatabase = async () => {
    if (!selectedBackup) return;

    try {
      setRestoreInProgress(true);

      const result = await invoke<RestoreResult>('restore_database', {
        backupPath: selectedBackup,
        userId: 'current_user', // TODO: Get from auth context
      });

      if (result.success) {
        toast.success(
          `Database restored successfully! Pre-restore backup: ${result.backup_created}`
        );
        setRestorePreview(null);
        setSelectedBackup(null);
        await loadDashboardData({ soft: true });
      } else {
        toast.error(`Restore failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Restore failed:', error);
      toast.error(`Restore failed: ${error}`);
    } finally {
      setRestoreInProgress(false);
    }
  };

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
        userId: 'current_user', // TODO: Get from auth context
      });

      if (result.success) {
        toast.success('Record updated successfully');
        setEditingRecord(null);
        setEditForm({});
        await loadTableData();
        await loadDashboardData(); // Refresh stats
      } else {
        toast.error(`Update failed: ${result.message}`);
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
        userId: 'current_user', // TODO: Get from auth context
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
  const handleBulkSearch = async () => {
    try {
      setBulkOperationInProgress(true);
      const result = await invoke<TableData>('bulk_search_records', {
        tableName: selectedTable,
        filters: bulkFilters,
        pageSize: 1000, // Large page size for bulk operations
        includeDeleted,
      });

      setBulkSearchResults(result);
      setSelectedRecords(new Set()); // Clear selections

      toast.success(
        `Found ${result.totalCount} records matching your criteria.`
      );
    } catch (error) {
      console.error('Bulk search failed:', error);
      toast.error(`Failed to search records: ${error}`);
    } finally {
      setBulkOperationInProgress(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecords.size === 0) {
      toast.error('Please select records to delete.');
      return;
    }

    const confirmMessage =
      bulkDeleteType === 'hard'
        ? `Are you sure you want to permanently delete ${selectedRecords.size} records? This action cannot be undone.`
        : `Are you sure you want to soft delete ${selectedRecords.size} records?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setBulkOperationInProgress(true);
      const result = await invoke<BulkDeleteResult>('bulk_delete_records', {
        tableName: selectedTable,
        recordIds: Array.from(selectedRecords),
        userId: 'current_user', // TODO: Get from user context
        deleteType: bulkDeleteType,
      });

      if (result.success) {
        toast.success(result.message);

        // Clear selections and refresh data
        setSelectedRecords(new Set());
        loadTableData();
        handleBulkSearch(); // Refresh bulk search results
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Bulk delete failed:', error);
      toast.error(`Failed to delete records: ${error}`);
    } finally {
      setBulkOperationInProgress(false);
    }
  };

  const handleSelectAll = () => {
    if (!bulkSearchResults) return;

    if (selectedRecords.size === bulkSearchResults.rows.length) {
      // Deselect all
      setSelectedRecords(new Set());
    } else {
      // Select all, but limit to 100 records
      const allIds = bulkSearchResults.rows
        .map(row => row[0]?.toString() || '')
        .slice(0, 100); // Limit to first 100 records
      setSelectedRecords(new Set(allIds));

      if (bulkSearchResults.rows.length > 100) {
        toast.warning(
          'Only the first 100 records were selected due to bulk operation limits.'
        );
      }
    }
  };

  // Backup Schedule Management Functions
  const loadBackupSchedules = async () => {
    try {
      const schedules = await invoke<BackupSchedule[]>('get_backup_schedules');
      setBackupSchedules(schedules);
    } catch (error) {
      console.error('Failed to load backup schedules:', error);
      toast.error('Failed to load backup schedules');
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!confirm('Are you sure you want to delete this backup schedule?'))
      return;

    try {
      await invoke('delete_backup_schedule', {
        schedule_id: scheduleId,
        userId: 'admin',
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
        schedule_id: scheduleId,
        userId: 'admin',
      });

      toast.success(`Scheduled backup completed: ${backupInfo.filename}`);
      loadBackupSchedules();
    } catch (error) {
      console.error('Failed to run scheduled backup:', error);
      toast.error('Failed to run scheduled backup');
    }
  };

  // User Role Management Functions
  const loadUserRoles = async () => {
    try {
      const roles = await invoke<UserRole[]>('get_user_roles');
      setUserRoles(roles);
    } catch (error) {
      console.error('Failed to load user roles:', error);
      toast.error('Failed to load user roles');
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('Are you sure you want to delete this user role?')) return;

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
    const newSelection = new Set(selectedRecords);
    if (newSelection.has(recordId)) {
      newSelection.delete(recordId);
    } else {
      // Check if we're already at the limit
      if (newSelection.size >= 100) {
        toast.warning(
          'Cannot select more than 100 records at once. Please deselect some records first.'
        );
        return;
      }
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
              {stats ? formatBytes(stats.db_size_bytes) : '0 Bytes'}
            </div>
            <p className="text-muted-foreground text-xs">
              {stats
                ? Object.values(stats.table_counts).reduce((a, b) => a + b, 0)
                : 0}{' '}
              total records
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
                ? formatDate(stats.last_backup).split(' ')[0]
                : 'Never'}
            </div>
            <p className="text-muted-foreground text-xs">
              {stats?.last_backup
                ? formatDate(stats.last_backup).split(' ')[1]
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
                ? formatDate(stats.next_scheduled_backup).split(' ')[0]
                : 'None'}
            </div>
            <p className="text-muted-foreground text-xs">
              {stats?.next_scheduled_backup
                ? formatDate(stats.next_scheduled_backup).split(' ')[1]
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
                  stats?.encryption_status === 'Encrypted'
                    ? 'default'
                    : 'secondary'
                }
              >
                {stats?.encryption_status || 'None'}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">Encryption status</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
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
                  {stats?.table_counts &&
                    Object.entries(stats.table_counts).map(([table, count]) => (
                      <div
                        key={table}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm font-medium capitalize">
                          {table.replace(/_/g, ' ')}
                        </span>
                        <Badge variant="outline">
                          {count.toLocaleString()}
                        </Badge>
                      </div>
                    ))}
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
                  {auditLogs.slice(0, 5).map(log => (
                    <div key={log.id} className="flex items-center space-x-3">
                      {getActionIcon(log.action)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {log.action} on {log.table_name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatDate(log.created_at)}
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
                      onValueChange={setSelectedTable}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suppliers">Suppliers</SelectItem>
                        <SelectItem value="shipments">Shipments</SelectItem>
                        <SelectItem value="items">Items</SelectItem>
                        <SelectItem value="invoices">Invoices</SelectItem>
                        <SelectItem value="expenses">Expenses</SelectItem>
                        <SelectItem value="notifications">
                          Notifications
                        </SelectItem>
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
                      onChange={e => setIncludeDeleted(e.target.checked)}
                    />
                    <Label htmlFor="include-deleted">Include Deleted</Label>
                  </div>

                  <Button onClick={loadTableData} variant="outline" size="sm">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Data Table */}
            {tableData && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {tableData.tableName.charAt(0).toUpperCase() +
                      tableData.tableName.slice(1)}
                    ({tableData.totalCount.toLocaleString()} records)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {tableData.columns.map(column => (
                            <TableHead key={column}>
                              {column.replace(/_/g, ' ')}
                            </TableHead>
                          ))}
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.rows.map((row, rowIndex) => {
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
                      Showing {(tableData.page - 1) * tableData.pageSize + 1} to{' '}
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
                        {Math.ceil(tableData.totalCount / tableData.pageSize)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={
                          currentPage >=
                          Math.ceil(tableData.totalCount / tableData.pageSize)
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
                      onValueChange={value => {
                        setSelectedTable(value);
                        setBulkSearchResults(null);
                        setSelectedRecords(new Set());
                        setBulkFilters({});
                      }}
                    >
                      <SelectTrigger id="bulk-table-select" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suppliers">Suppliers</SelectItem>
                        <SelectItem value="shipments">Shipments</SelectItem>
                        <SelectItem value="items">Items</SelectItem>
                        <SelectItem value="invoices">Invoices</SelectItem>
                        <SelectItem value="boe_details">BOE Details</SelectItem>
                        <SelectItem value="expenses">Expenses</SelectItem>
                        <SelectItem value="audit_logs">Audit Logs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="bulk-include-deleted"
                      checked={includeDeleted}
                      onCheckedChange={(checked: boolean) => {
                        setIncludeDeleted(checked as boolean);
                      }}
                    />
                    <Label htmlFor="bulk-include-deleted">
                      Include Deleted
                    </Label>
                  </div>

                  <Button
                    onClick={handleBulkSearch}
                    disabled={bulkOperationInProgress}
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
                        {selectedRecords.size > 0 &&
                          ` • ${selectedRecords.size} selected`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                      >
                        {selectedRecords.size === bulkSearchResults.rows.length
                          ? 'Deselect All'
                          : 'Select All'}
                      </Button>
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="delete-type">Delete Type:</Label>
                        <Select
                          value={bulkDeleteType}
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
                          selectedRecords.size === 0 || bulkOperationInProgress
                        }
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Selected ({selectedRecords.size})
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
                                selectedRecords.size ===
                                  bulkSearchResults.rows.length &&
                                bulkSearchResults.rows.length > 0
                              }
                              onCheckedChange={handleSelectAll}
                            />
                          </th>
                          {bulkSearchResults.columns.map((column, index) => (
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
                        {bulkSearchResults.rows.map((row, rowIndex) => {
                          const recordId = row[0]?.toString() || '';
                          return (
                            <tr key={rowIndex} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-3 py-2">
                                <Checkbox
                                  checked={selectedRecords.has(recordId)}
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
                                  {cell ? cell.toString() : '-'}
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
                {backupInProgress && (
                  <Alert>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <AlertDescription>
                      Creating backup... {backupProgress}%
                      <Progress value={backupProgress} className="mt-2" />
                    </AlertDescription>
                  </Alert>
                )}

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
                        <SelectItem value="s3" disabled>
                          AWS S3 (Coming Soon)
                        </SelectItem>
                        <SelectItem value="gdrive" disabled>
                          Google Drive (Coming Soon)
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
                    disabled={backupInProgress}
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
                      key={backup.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(backup.status)}
                        <div>
                          <p className="text-sm font-medium">
                            {backup.filename}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {formatDate(backup.created_at)} •{' '}
                            {backup.size_bytes
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
            <Button
              onClick={() =>
                toast.info('Schedule creation feature coming soon')
              }
              useAccentColor
            >
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
                          {schedule.cron_expr} • {schedule.destination}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Last run: {schedule.last_run || 'Never'} • Next run:{' '}
                          {schedule.next_run || 'Not scheduled'}
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
                          onClick={() =>
                            toast.info('Schedule editing feature coming soon')
                          }
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
                {auditLogs.map(log => (
                  <div
                    key={log.id}
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
                        {formatDate(log.created_at)}
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
            <CardContent>
              <Alert>
                <Settings className="h-4 w-4" />
                <AlertDescription>
                  Advanced settings and backup scheduling will be available in
                  the next update.
                </AlertDescription>
              </Alert>
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
                        {formatDate(restorePreview.backup_info.created_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Size</p>
                      <p className="text-muted-foreground">
                        {restorePreview.backup_info.size_bytes
                          ? formatBytes(restorePreview.backup_info.size_bytes)
                          : 'Unknown'}
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
                    restoreInProgress || !restorePreview.schema_compatibility
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
    </div>
  );
}
