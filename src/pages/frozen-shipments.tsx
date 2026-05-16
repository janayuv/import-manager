import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';

import { useEffect, useState } from 'react';

import { AppBar, PageHeader } from '@/components/shared/im';
import type { Shipment } from '@/types/shipment';

const FrozenShipmentsPage = () => {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setLoading(true);
      const all: Shipment[] = await invoke('get_shipments');
      setShipments(all.filter(s => s.isFrozen));
    } catch (e) {
      console.error(e);
      toast.error('Failed to load frozen shipments');
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
      console.error(e);
      toast.error('Failed to unfreeze');
    }
  };

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Frozen Shipments']} />
      <PageHeader
        title="Frozen Shipments"
        subtitle="Manage locked shipments and resolve processing issues"
        count={shipments.length}
      />
      <div className="im-dashboard-body">
        <div className="im-section">
          <div className="im-section__body" style={{ padding: 0 }}>
            {loading ? (
              <div
                style={{
                  padding: 24,
                  color: 'var(--color-im-muted)',
                  fontSize: 13,
                }}
              >
                Loading...
              </div>
            ) : (
              <div className="im-table-scroll">
                <table className="im-table">
                  <thead>
                    <tr>
                      <th className="im-th">Invoice #</th>
                      <th className="im-th">Status</th>
                      <th className="im-th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.length ? (
                      shipments.map((s, idx) => (
                        <tr
                          key={s.id}
                          className={`im-tr${idx % 2 === 1 ? 'is-alt' : ''}`}
                        >
                          <td className="im-td">{s.invoiceNumber}</td>
                          <td className="im-td">{s.status}</td>
                          <td className="im-td">
                            <button
                              type="button"
                              className="im-btn im-btn--sm"
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FrozenShipmentsPage;
