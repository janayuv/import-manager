import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ipcErrorMessage, parseIpcError } from '@/lib/ipc-error';
import { rebuildDashboardSnapshots } from '@/lib/ops-admin';
import { useUser } from '@/lib/user-context';

export default function AdminSystemToolsPage() {
  const { user } = useUser();
  const isAdmin = user?.role?.toLowerCase().includes('admin') ?? false;
  const [rebuilding, setRebuilding] = useState(false);

  const runRebuild = useCallback(async () => {
    const uid = user?.id?.trim();
    if (!uid) {
      toast.error('Not signed in.');
      return;
    }
    setRebuilding(true);
    try {
      const r = await rebuildDashboardSnapshots(uid);
      const ok = r.kpiOk && r.exceptionOk && r.workflowOk;
      const cidLine = `Correlation: ${r.correlationId}`;
      if (ok && r.warnings.length === 0) {
        toast.success('Dashboard cache cleared and snapshots rebuilt.', {
          description: cidLine,
        });
      } else if (ok) {
        toast.success('Rebuild finished with warnings.', {
          description: [r.warnings.join('\n'), cidLine]
            .filter(Boolean)
            .join('\n'),
        });
      } else {
        toast.error('Rebuild completed with errors.', {
          description: [r.warnings.join('\n'), cidLine]
            .filter(Boolean)
            .join('\n'),
        });
      }
    } catch (e) {
      const ipc = parseIpcError(e);
      const msg = ipcErrorMessage(e);
      const suffix =
        ipc?.correlationId != null && ipc.correlationId !== ''
          ? ` (correlation: ${ipc.correlationId})`
          : '';
      toast.error(`${msg}${suffix}`);
    } finally {
      setRebuilding(false);
    }
  }, [user?.id]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System tools</h1>
        <p className="text-muted-foreground text-sm">
          Operational controls for cache recovery. Rebuild runs on the backend
          and does not block the UI thread.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Dashboard snapshot rebuild
          </CardTitle>
          <p className="text-muted-foreground text-sm font-normal">
            Clears in-memory dashboard metrics cache rows and regenerates KPI,
            exception, and workflow snapshots. Only one rebuild runs at a time.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void runRebuild()}
            disabled={rebuilding}
            data-testid="admin-rebuild-dashboard-snapshots"
          >
            {rebuilding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rebuilding…
              </>
            ) : (
              'Rebuild dashboard cache'
            )}
          </Button>
          <Badge variant="outline" className="font-normal">
            Admin only
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
