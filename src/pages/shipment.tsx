// src/pages/shipment/index.tsx (MODIFIED)
// Added view dialog state and handler.
import * as React from 'react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Shipment } from '@/types/shipment';
import type { Option } from '@/types/options';
import { ShipmentDataTable } from '@/components/shipment/table';
import { ShipmentForm } from '@/components/shipment/form';
import { ShipmentViewDialog } from '@/components/shipment/view';
import { getShipmentColumns } from '@/components/shipment/columns';
import { Button } from '@/components/ui/button';
import { Upload, Download, Plus } from 'lucide-react';
import { 
    dummyShipments, 
    initialGoodsCategories, 
    initialIncoterms, 
    initialShipmentModes,
    initialShipmentTypes,
    initialShipmentStatuses 
} from '@/components/shipment/data';
import { invoke } from '@tauri-apps/api/core';
import type { Supplier } from '@/types/supplier';

const ShipmentPage = () => {
  const [shipments, setShipments] = React.useState<Shipment[]>(dummyShipments);
  const [suppliers, setSuppliers] = React.useState<Option[]>([]);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [selectedShipment, setSelectedShipment] = React.useState<Shipment | null>(null);
  const [shipmentToEdit, setShipmentToEdit] = React.useState<Shipment | null>(null);

  const [categories, setCategories] = React.useState<Option[]>(initialGoodsCategories);
  const [incoterms, setIncoterms] = React.useState<Option[]>(initialIncoterms);
  const [modes, setModes] = React.useState<Option[]>(initialShipmentModes);
  const [types, setTypes] = React.useState<Option[]>(initialShipmentTypes);
  const [statuses, setStatuses] = React.useState<Option[]>(initialShipmentStatuses);

  React.useEffect(() => {
    const fetchSuppliersForDropdown = async () => {
        try {
            const fetchedSuppliers: Supplier[] = await invoke('get_suppliers');
            const supplierOptions = fetchedSuppliers.map(s => ({ value: s.id, label: s.supplierName }));
            setSuppliers(supplierOptions);
        } catch (error) {
            console.error("Failed to load suppliers for dropdown:", error);
            toast.error("Could not load suppliers for dropdown.");
        }
    };
    fetchSuppliersForDropdown();
  }, []);

  const handleOpenFormForEdit = (shipment: Shipment) => {
    setShipmentToEdit(shipment);
    setFormOpen(true);
  };
  
  const handleOpenFormForAdd = () => {
    setShipmentToEdit(null);
    setFormOpen(true);
  }

  const handleView = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setViewOpen(true);
  };

  const handleSubmit = (shipmentData: Shipment) => {
    if (shipmentToEdit) {
      setShipments(prev => prev.map(s => s.id === shipmentData.id ? shipmentData : s));
      toast.success(`Shipment ${shipmentData.invoiceNumber} updated.`);
    } else {
      const newShipment = { ...shipmentData, id: `SHP-${Date.now()}` };
      setShipments(prev => [...prev, newShipment]);
      toast.success(`Shipment ${newShipment.invoiceNumber} created.`);
    }
    setFormOpen(false);
  };

  const handleExport = async () => {
    if (shipments.length === 0) {
      toast.warning("No data to export.");
      return;
    }
    const csv = Papa.unparse(shipments);
    try {
      const filePath = await save({ defaultPath: 'shipments.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (filePath) {
        await writeTextFile(filePath, csv);
        toast.success("Shipments exported successfully!");
      }
    } catch (error) {
      console.error("Failed to export shipments:", error);
      toast.error("Failed to export shipments.");
    }
  };

  const handleImport = async () => {
    try {
        const selectedPath = await open({
            multiple: false,
            filters: [{ name: 'CSV', extensions: ['csv'] }]
        });

        if (typeof selectedPath === 'string') {
            const content = await readTextFile(selectedPath);
            Papa.parse(content, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setShipments(results.data as Shipment[]);
                    toast.success(`${results.data.length} shipments imported successfully!`);
                },
                error: (err: Error) => {
                    toast.error("Failed to parse CSV file.");
                    console.error("CSV parsing error:", err);
                }
            });
        }
    } catch (error) {
        console.error("Failed to import shipments:", error);
        toast.error("Failed to import shipments.");
    }
  };

  const handleOptionCreate = (
    type: 'category' | 'incoterm' | 'mode' | 'status' | 'type',
    newOption: Option
  ) => {
    switch (type) {
        case 'category':
            setCategories(prev => [...prev, newOption]);
            break;
        case 'incoterm':
            setIncoterms(prev => [...prev, newOption]);
            break;
        case 'mode':
            setModes(prev => [...prev, newOption]);
            break;
        case 'type':
            setTypes(prev => [...prev, newOption]);
            break;
        case 'status':
            setStatuses(prev => [...prev, newOption]);
            break;
    }
    toast.success(`New ${type} "${newOption.label}" created.`);
  };
  
  const columns = getShipmentColumns(suppliers, handleView, handleOpenFormForEdit);

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Shipments</h1>
        <div className="flex items-center gap-2">
           <Button onClick={handleImport} variant="outline"><Upload className="mr-2 h-4 w-4" />Import</Button>
           <Button onClick={handleExport} className="bg-primary text-primary-foreground"><Download className="mr-2 h-4 w-4" />Export</Button>
           <Button onClick={handleOpenFormForAdd} className="bg-primary text-primary-foreground"><Plus className="mr-2 h-4 w-4" />Add New</Button>
        </div>
      </div>
      <ShipmentDataTable columns={columns} data={shipments} />
      <ShipmentForm 
        isOpen={isFormOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        shipmentToEdit={shipmentToEdit}
        suppliers={suppliers}
        categories={categories}
        incoterms={incoterms}
        modes={modes}
        types={types}
        statuses={statuses}
        onOptionCreate={handleOptionCreate}
      />
      <ShipmentViewDialog
        isOpen={isViewOpen}
        onOpenChange={setViewOpen}
        shipment={selectedShipment}
        suppliers={suppliers}
      />
    </div>
  );
};

export default ShipmentPage;