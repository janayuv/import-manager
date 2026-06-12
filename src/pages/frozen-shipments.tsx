import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';

import { useEffect, useState } from 'react';

import { ipcErrorMessage } from '@/lib/ipc-error';
import type { Shipment } from '@/types/shipment';

function shipmentStatusPill(status: string): React.ReactNode {
  const s = (status ?? '').toUpperCase();
  const cls =
    s === 'DOCS RCVD'
      ? 'im-status-pill im-status-pill--teal'
      : s === 'IN TRANSIT'
        ? 'im-status-pill im-status-pill--blue'
        : s === 'CUSTOMS'
          ? 'im-status-pill im-status-pill--purple'
          : s === 'READY'
            ? 'im-status-pill im-status-pill--amber'
            : s === 'DELIVERED'
              ? 'im-status-pill im-status-pill--green'
              : 'im-status-pill im-status-pill--gray';
  return <span className={cls}>{s || '—'}</span>;
}

const FrozenShipmentsPage = () => {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setLoading(true);
      const all: Shipment[] = await invoke('get_shipments');
      setShipments(all.filter(s => s.isFrozen));
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to load frozen shipments'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleUnfreeze = async (id: string) => {
    try {
      await invoke('freeze_shipment', { shipmentId: id, frozen: false });
      toast.success('Shipment unfrozen');
      await refresh();
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to unfreeze shipment'));
    }
  };

  return (
    <div className="im-table-shell">
      <div className="im-page-header">
        <div className="im-page-header__title">
          <h1>FROZEN SHIPMENTS</h1>
          {!loading && (
            <span className="im-record-badge">{shipments.length}</span>
          )}
        </div>
      </div>

      <div className="im-table-scroll">
        <table className="im-table" aria-rowcount={shipments.length}>
          <thead>
            <tr>
              <th className="im-th">INVOICE #</th>
              <th className="im-th">STATUS</th>
              <th className="im-th">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={3}
                  className="im-td-empty"
                  style={{ color: '#56544E', fontFamily: 'monospace' }}
                >
                  Loading…
                </td>
              </tr>
            ) : shipments.length ? (
              shipments.map((s, idx) => (
                <tr
                  key={s.id}
                  className={['im-tr', idx % 2 !== 0 ? 'is-alt' : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-rowindex={idx + 1}
                >
                  <td className="im-td">{s.invoiceNumber}</td>
                  <td className="im-td">
                    {shipmentStatusPill(s.status ?? '')}
                  </td>
                  <td className="im-td">
                    <button
                      type="button"
                      className="im-hdr-btn"
                      onClick={() => handleUnfreeze(s.id)}
                    >
                      Unfreeze
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr className="im-tr">
                <td
                  className="im-td"
                  colSpan={3}
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-im-muted)',
                  }}
                >
                  No frozen shipments
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="im-status-bar">
        <span>Total: {shipments.length}</span>
      </div>
    </div>
  );
};

export default FrozenShipmentsPage;
