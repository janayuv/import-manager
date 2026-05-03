import { memo, type ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatAppDateTime } from '@/lib/app-timezone';
import type { AuditLog, DatabaseStats } from '@/components/database/types';
import { auditLogKey, safeTableCounts } from '@/components/database/types';

export interface DatabaseOverviewTabProps {
  stats: DatabaseStats | null;
  auditLogs: AuditLog[];
  renderActionIcon: (action: string) => ReactNode;
}

export const DatabaseOverviewTab = memo(function DatabaseOverviewTab({
  stats,
  auditLogs,
  renderActionIcon,
}: DatabaseOverviewTabProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Table Statistics</CardTitle>
          <CardDescription>Record counts by table</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(safeTableCounts(stats)).map(([table, count]) => (
              <div key={table} className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">
                  {table.replace(/_/g, ' ')}
                </span>
                <Badge variant="outline">
                  {(typeof count === 'number' ? count : 0).toLocaleString()}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
                {renderActionIcon(log.action)}
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
  );
});
