import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { Loader2 } from 'lucide-react';

import * as React from 'react';

import { InvoiceWizard } from '@/components/invoice/wizard/InvoiceWizard';
import type { Invoice } from '@/types/invoice';
import type { Item } from '@/types/item';
import type { Shipment } from '@/types/shipment';
import type { Supplier } from '@/types/supplier';

export default function InvoiceWizardPage() {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<Item[]>([]);
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [itm, shp, sup, inv] = await Promise.all([
        invoke<Item[]>('get_items'),
        invoke<Shipment[]>('get_unfinalized_shipments'),
        invoke<Supplier[]>('get_suppliers'),
        invoke<Invoice[]>('get_invoices'),
      ]);
      setItems(itm);
      setShipments(shp);
      setSuppliers(sup);
      setInvoices(inv);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (invoiceData: Omit<Invoice, 'id'>) => {
    // Delegates to backend command already used in other invoice flows
    await invoke('add_invoice', {
      payload: {
        shipmentId: invoiceData.shipmentId,
        status: invoiceData.status,
        lineItems:
          invoiceData.lineItems?.map(li => ({
            itemId: li.itemId,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
          })) || [],
      },
    });
    // After invoice save, navigate to invoice page
    window.location.assign('/invoice');
  };

  if (loading) {
    return (
      <div
        className="im-page"
        style={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <Loader2
          style={{ width: 32, height: 32, color: 'var(--color-im-accent)' }}
          className="animate-spin"
        />
      </div>
    );
  }

  return (
    <div className="im-page">
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--color-im-rule)',
          flexShrink: 0,
          background: 'var(--color-im-sub)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-im-mono)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--color-im-accent)',
            textTransform: 'uppercase',
          }}
        >
          Invoice Entry Wizard
        </h1>
        <p
          style={{ fontSize: 12, color: 'var(--color-im-faint)', marginTop: 2 }}
        >
          Step-by-step invoice creation and processing workflow
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <InvoiceWizard
          shipments={shipments}
          items={items}
          suppliers={suppliers}
          invoices={invoices}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
