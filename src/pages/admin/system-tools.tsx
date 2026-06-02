import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ipcErrorMessage, parseIpcError } from '@/lib/ipc-error';
import { rebuildDashboardSnapshots } from '@/lib/ops-admin';
import { useUser, useHasPermission } from '@/lib/user-context';
import { AppBar } from '@/components/shared/im';
import { ExpenseDataManagerAdminPanel } from '@/components/expenses/expense-data-manager-admin';
import { ExpenseDebugPanel } from '@/components/expenses/expense-debug';

export default function AdminSystemToolsPage() {
  const { user } = useUser();
  const isAdmin = useHasPermission('admin.system_tools');
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
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Administration', 'System Tools']} />
      <div
        className="im-dashboard-body"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          style={{
            padding: '14px 24px 12px',
            borderBottom: '1px solid var(--color-im-rule)',
            flexShrink: 0,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--color-im-text)',
              fontFamily: 'var(--font-im-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            System Tools
          </h1>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 11.5,
              color: 'var(--color-im-faint)',
            }}
          >
            Operational controls for cache recovery and expense diagnostics.
            Rebuild runs on the backend and does not block the UI thread.
          </p>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Dashboard snapshot rebuild
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: 'var(--color-im-muted)',
              }}
            >
              Clears in-memory dashboard metrics cache rows and regenerates KPI,
              exception, and workflow snapshots. Only one rebuild runs at a
              time.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => void runRebuild()}
                disabled={rebuilding}
                data-testid="admin-rebuild-dashboard-snapshots"
              >
                {rebuilding ? (
                  <>
                    <Loader2
                      style={{
                        display: 'inline',
                        width: 14,
                        height: 14,
                        marginRight: 6,
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    Rebuilding…
                  </>
                ) : (
                  'Rebuild dashboard cache'
                )}
              </button>
              <span className="im-badge is-neutral">Admin only</span>
            </div>
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Expense diagnostics</span>
          </div>
          <div className="im-section__body">
            <ExpenseDebugPanel />
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Expense data management
            </span>
          </div>
          <div className="im-section__body">
            <ExpenseDataManagerAdminPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
