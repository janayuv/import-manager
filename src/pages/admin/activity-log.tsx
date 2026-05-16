import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import {
  queryDashboardActivityLog,
  type DashboardActivityRow,
} from '@/lib/dashboard-activity';
import { useCurrentUserId, useHasPermission } from '@/lib/user-context';
import { AppBar } from '@/components/shared/im';

export default function AdminActivityLogPage() {
  const isAdmin = useHasPermission('admin.activity_log');

  const [userId, setUserId] = useState('');
  const [actionType, setActionType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);
  const callerUserId = useCurrentUserId();
  const [rows, setRows] = useState<DashboardActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = useCallback(
    async (pageIdx: number) => {
      setLoading(true);
      setError(null);
      try {
        const uid = callerUserId.trim();
        if (!uid) {
          setRows([]);
          return;
        }
        const data = await queryDashboardActivityLog(
          {
            userId: userId.trim() || undefined,
            actionType: actionType.trim() || undefined,
            dateFrom: dateFrom.trim() || undefined,
            dateTo: dateTo.trim() || undefined,
            search: search.trim() || undefined,
            limit: pageSize,
            offset: pageIdx * pageSize,
          },
          uid
        );
        setRows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [userId, actionType, dateFrom, dateTo, search, pageSize, callerUserId]
  );

  useEffect(() => {
    if (!isAdmin) return;
    void runQuery(pageIndex);
  }, [isAdmin, pageIndex, pageSize, runQuery]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Administration', 'Activity Log']} />
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
            Activity Log
          </h1>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 11.5,
              color: 'var(--color-im-faint)',
            }}
          >
            Application and ERP-style events from{' '}
            <code style={{ fontSize: 11 }}>dashboard_activity_log</code>{' '}
            (paginated). Security-sensitive auth and operator actions are also
            listed under <strong>User activity</strong>.
          </p>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Filters</span>
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
              <label htmlFor="al-user" className="im-field-label">
                User ID
              </label>
              <input
                id="al-user"
                className="im-input"
                value={userId}
                onChange={e => setUserId(e.target.value)}
                placeholder="Exact match"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="al-action" className="im-field-label">
                Action type
              </label>
              <input
                id="al-action"
                className="im-input"
                value={actionType}
                onChange={e => setActionType(e.target.value)}
                placeholder="e.g. dashboard_viewed"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="al-limit" className="im-field-label">
                Page size
              </label>
              <input
                id="al-limit"
                className="im-input"
                type="number"
                min={1}
                max={2000}
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value) || 100);
                  setPageIndex(0);
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="al-from" className="im-field-label">
                Date from
              </label>
              <input
                id="al-from"
                className="im-input"
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="al-to" className="im-field-label">
                Date to
              </label>
              <input
                id="al-to"
                className="im-input"
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: 'span 3',
              }}
            >
              <label htmlFor="al-search" className="im-field-label">
                Search
              </label>
              <input
                id="al-search"
                className="im-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Matches details, module, record ref, navigation, context"
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
                Previous page
              </button>
              <button
                type="button"
                className="im-btn im-btn--sm"
                onClick={() => setPageIndex(i => i + 1)}
                disabled={loading || rows.length < pageSize}
              >
                Next page
              </button>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => {
                  setPageIndex(0);
                  void runQuery(0);
                }}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Apply filters'}
              </button>
              <span className="im-badge is-neutral">
                Page {pageIndex + 1} · {rows.length} row(s)
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
                    <th className="im-th">User</th>
                    <th className="im-th">Action</th>
                    <th className="im-th">Module</th>
                    <th className="im-th">Record ref</th>
                    <th className="im-th">Navigation</th>
                    <th className="im-th">Context</th>
                    <th className="im-th">Details</th>
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
                          {r.userId}
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
                          {r.actionType}
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
                          {r.moduleName}
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
                          {r.recordReference}
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
                          {r.navigationTarget}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11.5,
                          }}
                        >
                          {r.actionContext}
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
                          {r.details}
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
