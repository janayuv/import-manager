import { invoke } from '@tauri-apps/api/core';
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
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-blue-600">
          Invoice Entry Wizard
        </h1>
        <p className="text-muted-foreground mt-1">
          Step-by-step invoice creation and processing workflow
        </p>
      </div>
      <InvoiceWizard
        shipments={shipments}
        items={items}
        suppliers={suppliers}
        invoices={invoices}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
