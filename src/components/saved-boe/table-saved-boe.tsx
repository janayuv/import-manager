import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileSpreadsheet, FileText, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { exportSavedBoeToExcel } from '@/lib/export-boe-excel';
import { exportSavedBoeToPdf } from '@/lib/export-boe-pdf';
import type {
  BoeDetails,
  BoeStatus,
  SavedBoe,
  Shipment,
} from '@/types/boe-entry';

import './table-saved-boe.css';

interface SavedBoeTableProps {
  savedBoes: SavedBoe[];
  allBoes: BoeDetails[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const ITEMS_PER_PAGE = 50;

const BOE_STATUSES: BoeStatus[] = [
  'Awaiting BOE Data',
  'Reconciled',
  'Discrepancy Found',
  'Investigation',
  'Closed',
];

function pillClass(status: BoeStatus): string {
  const map: Record<BoeStatus, string> = {
    'Awaiting BOE Data': 'im-pill im-pill--blue',
    Reconciled: 'im-pill im-pill--green',
    'Discrepancy Found': 'im-pill im-pill--amber',
    Investigation: 'im-pill im-pill--red',
    Closed: 'im-pill im-pill--gray',
  };
  return map[status] ?? 'im-pill im-pill--gray';
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = months[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd}-${mmm}-${yyyy}`;
}

function totalAssessableValue(boe: SavedBoe): number {
  return boe.calculationResult.calculatedItems.reduce(
    (sum, item) => sum + item.assessableValue,
    0
  );
}

export function SavedBoeTable({
  savedBoes,
  allBoes,
  onView,
  onEdit,
  onDelete,
}: SavedBoeTableProps) {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'' | BoeStatus>('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null
  );

  function lookupBeNumber(boeId?: string): string {
    if (!boeId) return '—';
    const found = allBoes.find(b => b.id === boeId);
    return found?.beNumber ?? '—';
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return savedBoes.filter(boe => {
      if (q) {
        const found = boe.boeId ? allBoes.find(b => b.id === boe.boeId) : null;
        const beNumber = (found?.beNumber ?? '—').toLowerCase();
        const matchSearch =
          boe.invoiceNumber.toLowerCase().includes(q) ||
          boe.supplierName.toLowerCase().includes(q) ||
          beNumber.includes(q);
        if (!matchSearch) return false;
      }
      if (statusFilter && boe.status !== statusFilter) return false;
      if (dateFrom) {
        const created = boe.createdAt.slice(0, 10);
        if (created < dateFrom) return false;
      }
      if (dateTo) {
        const created = boe.createdAt.slice(0, 10);
        if (created > dateTo) return false;
      }
      return true;
    });
  }, [savedBoes, search, statusFilter, dateFrom, dateTo, allBoes]);

  const total = savedBoes.length;
  const filteredTotal = filtered.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedBoes = filtered.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );
  const selectedCount = selectedIds.size;

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExcelExport(boe: SavedBoe) {
    try {
      await exportSavedBoeToExcel(boe);
      toast.success('Excel exported successfully');
    } catch {
      toast.error('Failed to export Excel');
    }
  }

  async function handlePdfExport(boe: SavedBoe) {
    try {
      const allShipments = await invoke<Shipment[]>(
        'get_shipments_for_boe_summary'
      );
      const shipment = Array.isArray(allShipments)
        ? allShipments.find(s => s.id === boe.shipmentId)
        : null;
      if (!shipment) {
        toast.error('Shipment data not found for PDF export');
        return;
      }
      const boeDetails = boe.boeId
        ? allBoes.find(b => b.id === boe.boeId)
        : undefined;
      await exportSavedBoeToPdf(boe, boeDetails, shipment);
      toast.success('PDF exported successfully');
    } catch {
      toast.error('Failed to export PDF');
    }
  }

  return (
    <div className="im-table-shell">
      <div className="im-page-header">
        <div className="im-page-header__title">
          <h1>SAVED BOE CALCULATIONS</h1>
          <span className="im-record-badge">{total}</span>
        </div>
        <div className="im-page-header__actions">
          <button
            className="im-hdr-btn im-hdr-btn--primary"
            onClick={() => navigate('/boe-entry/new')}
          >
            + NEW CALCULATION
          </button>
        </div>
      </div>

      <div
        className="im-table-toolbar"
        style={{
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 8,
          paddingTop: 10,
          paddingBottom: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div className="im-table-search-wrap" style={{ width: 320 }}>
            <svg
              className="im-table-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="im-table-search"
              placeholder="Search invoice, supplier, BE number…"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="im-table-status-filter">
            <button
              className={`im-table-filter-btn${statusFilter === '' ? 'is-active' : ''}`}
              onClick={() => {
                setStatusFilter('');
                setCurrentPage(1);
              }}
            >
              All
            </button>
            {BOE_STATUSES.map(s => (
              <button
                key={s}
                className={`im-table-filter-btn${statusFilter === s ? 'is-active' : ''}`}
                onClick={() => {
                  setStatusFilter(s);
                  setCurrentPage(1);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: 11,
              color: 'var(--im-muted)',
            }}
          >
            From
            <input
              type="date"
              value={dateFrom}
              onChange={e => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                background: 'var(--im-sub)',
                border: '1px solid var(--im-rule)',
                color: 'var(--im-text)',
                fontFamily: 'inherit',
                fontSize: 11,
                padding: '4px 8px',
                outline: 'none',
              }}
            />
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: 11,
              color: 'var(--im-muted)',
            }}
          >
            To
            <input
              type="date"
              value={dateTo}
              onChange={e => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                background: 'var(--im-sub)',
                border: '1px solid var(--im-rule)',
                color: 'var(--im-text)',
                fontFamily: 'inherit',
                fontSize: 11,
                padding: '4px 8px',
                outline: 'none',
              }}
            />
          </label>
          <button className="im-hdr-btn" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </div>

      <div className="im-table-scroll">
        <table className="im-table" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th className="im-th" style={{ width: 64 }}>
                #
              </th>
              <th className="im-th">INVOICE NO</th>
              <th className="im-th">SUPPLIER</th>
              <th className="im-th">BE NUMBER</th>
              <th className="im-th" style={{ width: 120 }}>
                EXCHANGE RATE
              </th>
              <th className="im-th" style={{ width: 110, textAlign: 'right' }}>
                ASSESS. VALUE
              </th>
              <th className="im-th" style={{ width: 90, textAlign: 'right' }}>
                BCD
              </th>
              <th className="im-th" style={{ width: 90, textAlign: 'right' }}>
                SWS
              </th>
              <th className="im-th" style={{ width: 90, textAlign: 'right' }}>
                IGST
              </th>
              <th className="im-th" style={{ width: 110, textAlign: 'right' }}>
                TOTAL DUTY
              </th>
              <th className="im-th" style={{ width: 130 }}>
                STATUS
              </th>
              <th className="im-th" style={{ width: 90 }}>
                CREATED
              </th>
              <th className="im-th" style={{ width: 112 }}>
                ACTIONS
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedBoes.length === 0 ? (
              <tr>
                <td className="im-td-empty" colSpan={13}>
                  <div className="im-empty-state">
                    <div className="im-empty-state__title">
                      No records found
                    </div>
                    <div className="im-empty-state__body">
                      No saved BOE calculations match your current filters.
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedBoes.map((boe, i) => {
                const isSelected = selectedIds.has(boe.id);
                const beNumber = lookupBeNumber(boe.boeId);
                const isBeLinked = !!boe.boeId && beNumber !== '—';
                const rowBg = i % 2 === 0 ? '#101010' : '#0C0C0B';

                return (
                  <tr
                    key={boe.id}
                    className={`im-tr${i % 2 === 1 ? 'is-alt' : ''}${isSelected ? 'is-selected' : ''}`}
                    style={{ background: isSelected ? undefined : rowBg }}
                    onClick={() => toggleSelect(boe.id)}
                  >
                    <td className="im-td im-td-id" style={{ width: 64 }}>
                      {boe.id.slice(-6)}
                    </td>
                    <td className="im-td" style={{ fontWeight: 600 }}>
                      {boe.invoiceNumber}
                    </td>
                    <td className="im-td">{boe.supplierName}</td>
                    <td className="im-td">
                      {isBeLinked ? (
                        <span
                          style={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 11.5,
                          }}
                        >
                          {beNumber}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--im-faint)' }}>—</span>
                      )}
                    </td>
                    <td
                      className="im-td"
                      style={{
                        fontFamily: 'Consolas, "Courier New", monospace',
                        fontSize: 11.5,
                      }}
                    >
                      1 USD = ₹{boe.formValues.exchangeRate}
                    </td>
                    <td className="im-td" style={{ textAlign: 'right' }}>
                      ₹{formatAmount(totalAssessableValue(boe))}
                    </td>
                    <td className="im-td" style={{ textAlign: 'right' }}>
                      ₹{formatAmount(boe.calculationResult.bcdTotal)}
                    </td>
                    <td className="im-td" style={{ textAlign: 'right' }}>
                      ₹{formatAmount(boe.calculationResult.swsTotal)}
                    </td>
                    <td className="im-td" style={{ textAlign: 'right' }}>
                      ₹{formatAmount(boe.calculationResult.igstTotal)}
                    </td>
                    <td
                      className="im-td"
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: 'var(--im-accent)',
                      }}
                    >
                      ₹{formatAmount(boe.calculationResult.customsDutyTotal)}
                    </td>
                    <td className="im-td">
                      <span className={pillClass(boe.status)}>
                        {boe.status.toUpperCase()}
                      </span>
                    </td>
                    <td
                      className="im-td"
                      style={{
                        fontFamily: 'Consolas, "Courier New", monospace',
                        fontSize: 11.5,
                      }}
                    >
                      {formatDate(boe.createdAt)}
                    </td>
                    <td className="im-td" onClick={e => e.stopPropagation()}>
                      <div className="im-row-actions">
                        <button
                          className="im-row-act-btn"
                          title="View"
                          onClick={() => onView(boe.id)}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          className="im-row-act-btn"
                          title="Edit"
                          onClick={() => onEdit(boe.id)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="im-row-act-btn im-row-act-btn--danger"
                          title="Delete"
                          onClick={() => setConfirmDeleteId(boe.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                        <button
                          className="im-row-act-btn"
                          title="Export Excel"
                          onClick={() => handleExcelExport(boe)}
                        >
                          <FileSpreadsheet size={13} />
                        </button>
                        <button
                          className="im-row-act-btn"
                          title="Export PDF"
                          onClick={() => handlePdfExport(boe)}
                        >
                          <FileText size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmDeleteId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            style={{
              background: 'var(--im-panel, #0D0D0B)',
              border: '1px solid var(--im-rule)',
              padding: '28px 32px',
              minWidth: 320,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--im-text)',
                letterSpacing: '0.04em',
              }}
            >
              DELETE RECORD?
            </div>
            <div
              style={{
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: 11,
                color: 'var(--im-muted)',
              }}
            >
              This action cannot be undone.
            </div>
            <div
              style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}
            >
              <button
                className="im-hdr-btn"
                onClick={() => setConfirmDeleteId(null)}
              >
                CANCEL
              </button>
              <button
                className="im-hdr-btn im-row-act-btn--danger"
                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="im-table-statusbar">
        <span>
          Total: <strong>{total}</strong>
        </span>
        <span className="im-sb-sep">·</span>
        <span className={selectedCount > 0 ? 'is-accent' : ''}>
          Selected: <strong>{selectedCount}</strong>
        </span>
        <span className="im-sb-sep">·</span>
        <span>
          Loaded: <strong>{paginatedBoes.length}</strong>
        </span>
        <div className="im-sb-right">
          <span>
            Page {safePage} of {totalPages}
          </span>
          <button
            className="im-page-btn"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            ←
          </button>
          <button
            className="im-page-btn"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
