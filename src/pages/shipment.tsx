// src/pages/shipment/index.tsx
import * as React from 'react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import type { Shipment } from '@/types/shipment';
import type { Option } from '@/types/options';
import { ShipmentForm } from '@/components/shipment/form';
import { ShipmentViewDialog } from '@/components/shipment/view';
import { getShipmentColumns } from '@/components/shipment/columns';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shipment/data-table';
import { Upload, Download, Plus, FileOutput } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { Supplier } from '@/types/supplier';

type OptionType = 'category' | 'incoterm' | 'mode' | 'status' | 'type' | 'currency';

const ShipmentPage = () => {
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = React.useState<Option[]>([]);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [selectedShipment, setSelectedShipment] = React.useState<Shipment | null>(null);
  const [shipmentToEdit, setShipmentToEdit] = React.useState<Shipment | null>(null);
  
  const [categories, setCategories] = React.useState<Option[]>([]);
  const [incoterms, setIncoterms] = React.useState<Option[]>([]);
  const [modes, setModes] = React.useState<Option[]>([]);
  const [types, setTypes] = React.useState<Option[]>([]);
  const [statuses, setStatuses] = React.useState<Option[]>([]);
  const [currencies, setCurrencies] = React.useState<Option[]>([]);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState({});

  const columns = React.useMemo(() => getShipmentColumns(suppliers, handleView, handleOpenFormForEdit), [suppliers]);

  const table = useReactTable({
    data: shipments,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnFilters, rowSelection },
  });

  const fetchShipments = async () => {
    try {
        const fetchedShipments: Shipment[] = await invoke('get_shipments');
        setShipments(fetchedShipments);
    } catch (error) {
        console.error("Failed to fetch shipments:", error);
        toast.error("Failed to load shipments from the database.");
    }
  };

  const fetchOptions = async () => {
    try {
        const [
            fetchedCategories, fetchedIncoterms, fetchedModes, 
            fetchedTypes, fetchedStatuses, fetchedCurrencies
        ] = await Promise.all([
            invoke('get_categories'), invoke('get_incoterms'), invoke('get_shipment_modes'),
            invoke('get_shipment_types'), invoke('get_shipment_statuses'), invoke('get_currencies')
        ]);
        setCategories(fetchedCategories as Option[]);
        setIncoterms(fetchedIncoterms as Option[]);
        setModes(fetchedModes as Option[]);
        setTypes(fetchedTypes as Option[]);
        setStatuses(fetchedStatuses as Option[]);
        setCurrencies(fetchedCurrencies as Option[]);
    } catch (error) {
        console.error("Failed to fetch options:", error);
        toast.error("Could not load dropdown options from the database.");
    }
  };

  React.useEffect(() => {
    const fetchInitialData = async () => {
        try {
            const fetchedSuppliers: Supplier[] = await invoke('get_suppliers');
            const supplierOptions = fetchedSuppliers.map(s => ({ value: s.id, label: s.supplierName }));
            setSuppliers(supplierOptions);
            await fetchShipments();
            await fetchOptions();
        } catch (error) {
            console.error("Failed to load initial data:", error);
            toast.error("Could not load initial data from the database.");
        }
    };
    fetchInitialData();
  }, []);

  function handleOpenFormForEdit(shipment: Shipment) {
    setShipmentToEdit(shipment);
    setFormOpen(true);
  }
  
  function handleOpenFormForAdd() {
    setShipmentToEdit(null);
    setFormOpen(true);
  }

  function handleView(shipment: Shipment) {
    setSelectedShipment(shipment);
    setViewOpen(true);
  }

  async function handleSubmit(shipmentData: Omit<Shipment, 'id'>) {
    const isDuplicate = shipments.some(
      (s) => 
        s.invoiceNumber.toLowerCase() === shipmentData.invoiceNumber.toLowerCase() && 
        s.id !== shipmentToEdit?.id
    );

    if (isDuplicate) {
      toast.error(`A shipment with the invoice number "${shipmentData.invoiceNumber}" already exists.`);
      return;
    }

    try {
        if (shipmentToEdit) {
            const updatedShipment = { ...shipmentToEdit, ...shipmentData };
            await invoke('update_shipment', { shipment: updatedShipment });
            toast.success(`Shipment ${updatedShipment.invoiceNumber} updated.`);
        } else {
            const maxId = shipments.reduce((max, s) => Math.max(max, parseInt(s.id.split('-')[1] || '0')), 0);
            const newId = `SHP-${(maxId + 1).toString().padStart(3, '0')}`;
            const newShipment: Shipment = { id: newId, ...shipmentData };
            await invoke('add_shipment', { shipment: newShipment });
            toast.success(`Shipment ${newShipment.invoiceNumber} created.`);
        }
        fetchShipments();
        setFormOpen(false);
    } catch (error) {
        console.error("Failed to save shipment:", error);
        toast.error("Failed to save shipment.");
    }
  }

  const handleDownloadTemplate = () => {
    const headers = [
      "supplierId", "invoiceNumber", "invoiceDate", "goodsCategory", "invoiceValue",
      "invoiceCurrency", "incoterm", "shipmentMode", "shipmentType", "blAwbNumber",
      "blAwbDate", "vesselName", "containerNumber", "grossWeightKg", "etd", "eta",
      "status", "dateOfDelivery"
    ];
    const csv = headers.join(',');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shipment_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.info("Shipment template downloaded.");
  };

  async function handleImport() {
    try {
        const selectedPath = await open({ multiple: false, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        if (!selectedPath) {
            toast.info("Import cancelled.");
            return;
        }

        const content = await readTextFile(selectedPath as string);
        const results = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
        
        const seenInvoiceNumbers = new Set(shipments.map(s => s.invoiceNumber.toLowerCase()));
        let maxId = shipments.reduce((max, s) => Math.max(max, parseInt(s.id.split('-')[1] || '0')), 0);

        const newShipments: Shipment[] = [];
        for (const row of results.data) {
            if (!row.invoiceNumber || seenInvoiceNumbers.has(row.invoiceNumber.toLowerCase())) {
                continue; // Skip duplicates or rows without an invoice number
            }
            maxId++;
            newShipments.push({
                id: `SHP-${maxId.toString().padStart(3, '0')}`,
                supplierId: row.supplierId,
                invoiceNumber: row.invoiceNumber,
                invoiceDate: row.invoiceDate,
                goodsCategory: row.goodsCategory,
                invoiceValue: parseFloat(row.invoiceValue) || 0,
                invoiceCurrency: row.invoiceCurrency,
                incoterm: row.incoterm,
                shipmentMode: row.shipmentMode,
                shipmentType: row.shipmentType,
                blAwbNumber: row.blAwbNumber,
                blAwbDate: row.blAwbDate,
                vesselName: row.vesselName,
                containerNumber: row.containerNumber,
                grossWeightKg: parseFloat(row.grossWeightKg) || 0,
                etd: row.etd,
                eta: row.eta,
                status: row.status,
                dateOfDelivery: row.dateOfDelivery,
            });
            seenInvoiceNumbers.add(row.invoiceNumber.toLowerCase());
        }

        if (newShipments.length > 0) {
            await invoke('add_shipments_bulk', { shipments: newShipments });
            toast.success(`${newShipments.length} new shipments imported successfully!`);
            fetchShipments();
        } else {
            toast.info("No new shipments to import.");
        }
    } catch (error) {
        console.error("Failed to import shipments:", error);
        toast.error("Failed to import shipments. Please check the file format.");
    }
  }
  
  async function exportData(dataToExport: Shipment[]) {
    if (dataToExport.length === 0) {
        toast.warning("No data available to export.");
        return;
    }
    
    const csvHeaders = [
        "id", "supplierName", "invoiceNumber", "invoiceDate", "goodsCategory", 
        "invoiceValue", "invoiceCurrency", "incoterm", "shipmentMode", "shipmentType", 
        "blAwbNumber", "blAwbDate", "vesselName", "containerNumber", "grossWeightKg", 
        "etd", "eta", "status", "dateOfDelivery"
    ];
    
    const exportableData = dataToExport.map(shipment => {
        const supplier = suppliers.find(s => s.value === shipment.supplierId);
        return {
            id: shipment.id || '',
            supplierName: supplier ? supplier.label : 'Unknown',
            invoiceNumber: shipment.invoiceNumber || '',
            invoiceDate: shipment.invoiceDate || '',
            goodsCategory: shipment.goodsCategory || '',
            invoiceValue: shipment.invoiceValue || 0,
            invoiceCurrency: shipment.invoiceCurrency || '',
            incoterm: shipment.incoterm || '',
            shipmentMode: shipment.shipmentMode || '',
            shipmentType: shipment.shipmentType || '',
            blAwbNumber: shipment.blAwbNumber || '',
            blAwbDate: shipment.blAwbDate || '',
            vesselName: shipment.vesselName || '',
            containerNumber: shipment.containerNumber || '',
            grossWeightKg: shipment.grossWeightKg || 0,
            etd: shipment.etd || '',
            eta: shipment.eta || '',
            status: shipment.status || '',
            dateOfDelivery: shipment.dateOfDelivery || '',
        };
    });

    const csv = Papa.unparse({
        fields: csvHeaders,
        data: exportableData,
    });

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
  }

  function handleExportAll() {
    const allData = table.getFilteredRowModel().rows.map(row => row.original);
    exportData(allData);
  }

  function handleExportSelected() {
    const selectedData = table.getFilteredSelectedRowModel().rows.map(row => row.original);
    exportData(selectedData);
  }

  async function handleOptionCreate(type: OptionType, newOption: Option) {
    const correctlyCasedOption = { value: newOption.label, label: newOption.label };
    const stateUpdater = {
        category: setCategories, incoterm: setIncoterms, mode: setModes,
        type: setTypes, status: setStatuses, currency: setCurrencies,
    };
    stateUpdater[type](prev => [...prev, correctlyCasedOption]);
    try {
        await invoke('add_option', { optionType: type, option: correctlyCasedOption });
        toast.success(`New ${type} "${correctlyCasedOption.label}" saved.`);
    } catch (error) {
        console.error(`Failed to save new ${type}:`, error);
        toast.error(`Failed to save new ${type}.`);
        stateUpdater[type](prev => prev.filter(opt => opt.value !== correctlyCasedOption.value));
    }
  }

  return (
    <div className="w-full max-w-full px-6 py-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Shipments</h1>
        <div className="flex items-center gap-2">
           <Button onClick={handleOpenFormForAdd}><Plus className="mr-2 h-4 w-4"/>Add New</Button>
           <Button variant="outline" onClick={handleDownloadTemplate}><Download className="mr-2 h-4 w-4" />Template</Button>
           <Button variant="outline" onClick={handleImport}><Upload className="mr-2 h-4 w-4" />Import</Button>
           <Button variant="outline" onClick={handleExportSelected} disabled={table.getFilteredSelectedRowModel().rows.length === 0}><FileOutput className="mr-2 h-4 w-4" />Export Selected</Button>
           <Button variant="outline" onClick={handleExportAll}><Download className="mr-2 h-4 w-4" />Export All</Button>
        </div>
      </div>
      <DataTable 
        table={table} 
        columns={columns}
        filterColumnId="invoiceNumber"
        filterPlaceholder="Search by invoice number..."
      />
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
        currencies={currencies}
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
