// src/pages/invoice/index.tsx (MODIFIED - Type definitions corrected)

import * as React from 'react';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';
import type { Invoice, FlattenedInvoiceLine } from '@/types/invoice';
import type { Shipment } from '@/types/shipment';
import type { Item } from '@/types/item';
import type { Supplier } from '@/types/supplier';
import { getInvoiceColumns } from '@/components/invoice/columns';
import { DataTable } from '@/components/invoice/data-table';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { InvoiceForm } from '@/components/invoice/form';
import { InvoiceViewDialog } from '@/components/invoice/view';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"


const InvoicePage = () => {
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [unfinalizedShipments, setUnfinalizedShipments] = React.useState<Shipment[]>([]);
  const [items, setItems] = React.useState<Item[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const [invoiceToEdit, setInvoiceToEdit] = React.useState<Invoice | null>(null);
  const [invoiceToView, setInvoiceToView] = React.useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = React.useState<{id: string, number: string} | null>(null);
  
  const [globalFilter, setGlobalFilter] = React.useState(''); 

  const fetchData = async () => {
    setLoading(true);
    try {
        const [inv, shp, unfinalizedShp, itm, sup] = await Promise.all([
            invoke<Invoice[]>('get_invoices'),
            invoke<Shipment[]>('get_shipments'),
            invoke<Shipment[]>('get_unfinalized_shipments'),
            invoke<Item[]>('get_items'),
            invoke<Supplier[]>('get_suppliers')
        ]);
        setInvoices(inv);
        setShipments(shp);
        setUnfinalizedShipments(unfinalizedShp);
        setItems(itm);
        setSuppliers(sup);
    } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to load initial data. Please try again.");
    } finally {
        setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  const availableShipmentsForForm = React.useMemo(() => {
    if (invoiceToEdit) {
        const currentShipment = shipments.find(s => s.id === invoiceToEdit.shipmentId);
        if (currentShipment && !unfinalizedShipments.some(us => us.id === currentShipment.id)) {
            return [...unfinalizedShipments, currentShipment];
        }
    }
    return unfinalizedShipments;
  }, [unfinalizedShipments, shipments, invoiceToEdit]);

  const flattenedData = React.useMemo(() => {
    const data: FlattenedInvoiceLine[] = [];
    invoices.forEach(invoice => {
      const shipment = shipments.find(s => s.id === invoice.shipmentId);
      const supplier = suppliers.find(sup => sup.id === shipment?.supplierId);
      
      if (invoice.lineItems && invoice.lineItems.length > 0) {
        invoice.lineItems.forEach(lineItem => {
          const item = items.find(i => i.id === lineItem.itemId);
          if (shipment && supplier && item) {
            data.push({
              invoiceId: invoice.id,
              supplierName: supplier.supplierName,
              invoiceNumber: shipment.invoiceNumber,
              invoiceDate: shipment.invoiceDate,
              partNumber: item.partNumber,
              itemDescription: item.itemDescription,
              hsnCode: item.hsnCode,
              currency: shipment.invoiceCurrency,
              unit: item.unit,
              quantity: lineItem.quantity,
              unitPrice: lineItem.unitPrice,
              lineTotal: lineItem.quantity * lineItem.unitPrice,
              bcd: item.bcd || '-',
              igst: item.igst || '-',
              invoiceTotal: invoice.calculatedTotal,
              status: invoice.status as 'Draft' | 'Finalized' | 'Mismatch',
            });
          }
        });
      } else {
         if (shipment && supplier) {
            data.push({
              invoiceId: invoice.id,
              supplierName: supplier.supplierName,
              invoiceNumber: shipment.invoiceNumber,
              invoiceDate: shipment.invoiceDate,
              partNumber: 'N/A',
              itemDescription: 'No items added yet',
              hsnCode: '-', currency: shipment.invoiceCurrency, unit: '-', quantity: 0,
              unitPrice: 0, lineTotal: 0, bcd: '-', igst: '-',
              invoiceTotal: invoice.calculatedTotal, status: invoice.status as 'Draft' | 'Finalized' | 'Mismatch',
            });
          }
      }
    });
    return data;
  }, [invoices, shipments, items, suppliers]);


  const handleOpenFormForAdd = () => {
    setInvoiceToEdit(null);
    setFormOpen(true);
  };

  const handleOpenFormForEdit = (invoiceId: string) => {
    const fullInvoice = invoices.find(inv => inv.id === invoiceId);
    if (fullInvoice) {
        setInvoiceToEdit(fullInvoice);
        setFormOpen(true);
    }
  };

  const handleView = (invoiceId: string) => {
    const fullInvoice = invoices.find(inv => inv.id === invoiceId);
    if(fullInvoice) {
        setInvoiceToView(fullInvoice);
        setViewOpen(true);
    }
  };
  
  const handleDeleteRequest = (invoiceId: string, invoiceNumber: string) => {
    setInvoiceToDelete({ id: invoiceId, number: invoiceNumber });
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (invoiceToDelete) {
        try {
            await invoke('delete_invoice', { id: invoiceToDelete.id });
            toast.success(`Invoice ${invoiceToDelete.number} deleted successfully.`);
            fetchData();
        } catch (error) {
            console.error("Failed to delete invoice:", error);
            toast.error("Failed to delete invoice.");
        }
    }
    setIsDeleteDialogOpen(false);
    setInvoiceToDelete(null);
  };

  const handleSubmit = async (invoiceData: Omit<Invoice, "id">, id?: string) => {
    const payload = {
      shipmentId: invoiceData.shipmentId,
      status: invoiceData.status,
      lineItems: invoiceData.lineItems?.map((li) => ({
          itemId: li.itemId,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
      })) || []
    };

    try {
        if (id) {
            await invoke('update_invoice', { id, payload });
            toast.success(`Invoice ${invoiceData.invoiceNumber} has been updated.`);
        } else {
            await invoke('add_invoice', { payload });
            toast.success(`Invoice ${invoiceData.invoiceNumber} has been saved as ${invoiceData.status}.`);
        }
        setFormOpen(false);
        fetchData();
    } catch (error) {
        console.error("Failed to save invoice:", error);
        toast.error("Failed to save invoice.");
    }
  };

  const columns = getInvoiceColumns({ 
    onView: handleView, 
    onEdit: handleOpenFormForEdit,
    onDelete: handleDeleteRequest
   });
   
  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Invoice Details</h1>
        <div className="flex items-center gap-2">
          <Button onClick={handleOpenFormForAdd} className="custom-alert-action-ok">
            <Plus className="mr-2 h-4 w-4" /> Add New Invoice
          </Button>
        </div>
      </div>
      <DataTable 
        columns={columns} 
        data={flattenedData} 
        globalFilter={globalFilter}
        setGlobalFilter={setGlobalFilter}
      />
      
      <InvoiceForm 
        isOpen={isFormOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        shipments={availableShipmentsForForm}
        items={items}
        invoiceToEdit={invoiceToEdit}
      />
      <InvoiceViewDialog
        isOpen={isViewOpen}
        onOpenChange={setViewOpen}
        invoice={invoiceToView}
        items={items}
        suppliers={suppliers}
        shipments={shipments}
      />
    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete invoice <strong>{invoiceToDelete?.number}</strong>.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel className="custom-alert-action-cancel" onClick={() => setInvoiceToDelete(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction className="custom-alert-action-ok"onClick={handleDeleteConfirm}>Continue</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </div>
  );
};

export default InvoicePage;