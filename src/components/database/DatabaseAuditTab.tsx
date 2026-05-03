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
import type { AuditLog } from '@/components/database/types';
import { auditLogKey } from '@/components/database/types';

export interface DatabaseAuditTabProps {
  auditLogs: AuditLog[];
  renderActionIcon: (action: string) => ReactNode;
}

export const DatabaseAuditTab = memo(function DatabaseAuditTab({
  auditLogs,
  renderActionIcon,
}: DatabaseAuditTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Trail</CardTitle>
        <CardDescription>Complete log of database operations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {auditLogs.map((log, idx) => (
            <div
              key={auditLogKey(log, idx)}
              className="flex items-start space-x-3 rounded-lg border p-3"
            >
              {renderActionIcon(log.action)}
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    {log.action}
                  </Badge>
                  <span className="text-sm font-medium">{log.table_name}</span>
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
            <p className="text-muted-foreground text-sm">No audit logs found</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
