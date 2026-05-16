import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import {
  fetchUserActivityLogs,
  type UserActivityAuditLog,
} from '@/lib/user-activity-audit';
import { useUser, useHasPermission } from '@/lib/user-context';
import { AppBar } from '@/components/shared/im';

function UserActivityDetailsCell({ raw }: { raw: string | null }) {
  if (!raw) return <>—</>;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const cid =
      typeof o.correlationId === 'string' ? o.correlationId : undefined;
    const sid = typeof o.sessionId === 'string' ? o.sessionId : undefined;
    if (cid || sid) {
      return (
        <span className="font-mono text-[11px]" title={raw}>
          {[cid ? `cid:${cid}` : null, sid ? `sess:${sid.slice(0, 8)}…` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      );
    }
  } catch {
    /* fall through */
  }
  return <span title={raw}>{raw}</span>;
}

export default function AdminUserActivityPage() {
  const { user } = useUser();
  const isAdmin = useHasPermission('admin.user_activity');

  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);
  const [rows, setRows] = useState<UserActivityAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = pageIndex * pageSize;
      const uid = user?.id?.trim();
      if (!uid) {
        setRows([]);
        return;
      }
      const data = await fetchUserActivityLogs(pageSize, offset, uid);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [pageIndex, pageSize, user?.id]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Administration', 'User Activity']} />
      <div
        className="im-dashboard-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
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
            User Activity Audit Log
          </h1>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 11.5,
              color: 'var(--color-im-faint)',
            }}
          >
            Audit trail from{' '}
            <code style={{ fontSize: 11 }}>user_activity_audit_logs</code> —
            tracks important user and system actions. Paged by newest first.
          </p>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Pagination</span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="al-page-size" className="im-field-label">
                Page size
              </label>
              <input
                id="al-page-size"
                className="im-input"
                type="number"
                min={1}
                max={2000}
                value={pageSize}
                onChange={e => {
                  setPageSize(
                    Math.min(2000, Math.max(1, Number(e.target.value) || 50))
                  );
                  setPageIndex(0);
                }}
              />
            </div>
            <div
              style={{
                gridColumn: 'span 3',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <button
                type="button"
                className="im-btn im-btn--sm"
                onClick={() => setPageIndex(i => Math.max(0, i - 1))}
                disabled={loading || pageIndex === 0}
              >
                Previous
              </button>
              <button
                type="button"
                className="im-btn im-btn--sm"
                onClick={() => setPageIndex(i => i + 1)}
                disabled={loading || rows.length < pageSize}
              >
                Next
              </button>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Refresh page'}
              </button>
              <span className="im-badge is-neutral">
                Page {pageIndex + 1} · {rows.length} row(s) this page
              </span>
            </div>
          </div>
        </div>

        {error && (
          <p
            style={{ color: 'var(--color-im-bad)', fontSize: 12.5 }}
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Log entries</span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            <div className="im-table-scroll">
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th" style={{ whiteSpace: 'nowrap' }}>
                      Timestamp
                    </th>
                    <th className="im-th">User ID</th>
                    <th className="im-th">Action</th>
                    <th className="im-th">Entity Type</th>
                    <th className="im-th">Entity ID</th>
                    <th className="im-th">Details / correlation</th>
                    <th className="im-th">Severity</th>
                    <th className="im-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className="im-tr">
                      <td
                        className="im-td"
                        colSpan={8}
                        style={{
                          textAlign: 'center',
                          color: 'var(--color-im-muted)',
                        }}
                      >
                        No rows. Adjust filters and apply.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                      >
                        <td
                          className="im-td"
                          style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}
                        >
                          {r.timestamp}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 140,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11.5,
                          }}
                        >
                          {r.userId || 'System'}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 160,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11.5,
                          }}
                        >
                          {r.actionName}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11.5,
                          }}
                        >
                          {r.entityType || '-'}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 140,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11.5,
                          }}
                        >
                          {r.entityId || '-'}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 280,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11.5,
                          }}
                        >
                          <UserActivityDetailsCell raw={r.detailsJson} />
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 100,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11.5,
                          }}
                        >
                          {r.severity ?? 'INFO'}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11.5,
                          }}
                        >
                          {r.status}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
