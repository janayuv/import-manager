// src/pages/shipment/index.tsx (MODIFIED)
// Fetches all dropdown options from the backend on load.
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

type ImportedShipmentRow = {
    [key: string]: string;
};

type OptionType = 'category' | 'incoterm' | 'mode' | 'status' | 'type' | 'currency';

const ShipmentPage = () => {
  const [shipments, setShipments] = React.useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = React.useState<Option[]>([]);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const [isViewOpen, setViewOpen] = React.useState(false);
  const [selectedShipment, setSelectedShipment] = React.useState<Shipment | null>(null);
  const [shipmentToEdit, setShipmentToEdit] = React.useState<Shipment | null>(null);

  // State for all dynamic dropdowns, initialized as empty
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
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
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

  // Fetches all dropdown options from the backend
  const fetchOptions = async () => {
    try {
        const [
            fetchedCategories, 
            fetchedIncoterms, 
            fetchedModes, 
            fetchedTypes, 
            fetchedStatuses, 
            fetchedCurrencies
        ] = await Promise.all([
            invoke('get_categories'),
            invoke('get_incoterms'),
            invoke('get_shipment_modes'),
            invoke('get_shipment_types'),
            invoke('get_shipment_statuses'),
            invoke('get_currencies')
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
            await fetchOptions(); // Fetch all dropdown options on component mount
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
            const maxId = shipments.reduce((max, s) => {
                const num = s.id ? parseInt(s.id.split('-')[1]) : 0;
                return num > max ? num : max;
            }, 0);
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

  async function handleImport() {
    try {
        const selected = await open({ multiple: false, filters: [{ name: 'CSV', extensions: ['csv'] }] });
        if (typeof selected === 'string') {
            const content = await readTextFile(selected);
            Papa.parse<ImportedShipmentRow>(content, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const seenInvoiceNumbers = new Set(shipments.map(s => s.invoiceNumber.toLowerCase()));
                    const importedRows = results.data.filter(row => row.invoiceNumber);

                    const shipmentsToImport = [];
                    for (const row of importedRows) {
                        const invoiceLower = row.invoiceNumber.toLowerCase();
                        if (!seenInvoiceNumbers.has(invoiceLower)) {
                            shipmentsToImport.push(row);
                            seenInvoiceNumbers.add(invoiceLower);
                        }
                    }

                    const skippedCount = importedRows.length - shipmentsToImport.length;
                    if (skippedCount > 0) {
                        toast.warning(`${skippedCount} duplicate shipment(s) were skipped.`);
                    }

                    if (shipmentsToImport.length === 0) {
                        toast.info("No new shipments to import.");
                        return;
                    }

                    const maxId = shipments.reduce((max, s) => {
                        const num = s.id ? parseInt(s.id.split('-')[1]) : 0;
                        return num > max ? num : max;
                    }, 0);

                    const shipmentsToSave = shipmentsToImport.map((shipment, index) => {
                        const newId = `SHP-${(maxId + index + 1).toString().padStart(3, '0')}`;
                        return {
                            ...shipment,
                            id: newId,
                            invoiceValue: parseFloat(shipment.invoiceValue) || 0,
                            grossWeightKg: parseFloat(shipment.grossWeightKg) || 0,
                        };
                    });

                    Promise.all(shipmentsToSave.map(shipment => {
                        return invoke('add_shipment', { shipment });
                    })).then(() => {
                        toast.success(`${shipmentsToSave.length} shipments imported successfully!`);
                        fetchShipments();
                    }).catch(err => {
                        toast.error("Failed to save imported shipments.");
                        console.error(err);
                    });
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
  }

  async function handleOptionCreate(type: OptionType, newOption: Option) {
    // The `newOption` from the combobox might have a lowercased `value`.
    // We create a new object to ensure the casing is preserved as typed in the `label`.
    const correctlyCasedOption = {
        value: newOption.label, // Use the label, which preserves casing, for the value.
        label: newOption.label,
    };

    const stateUpdater: { [key in OptionType]: React.Dispatch<React.SetStateAction<Option[]>> } = {
        category: setCategories,
        incoterm: setIncoterms,
        mode: setModes,
        type: setTypes,
        status: setStatuses,
        currency: setCurrencies,
    };
    // Update the local state with the correctly cased option
    stateUpdater[type](prev => [...prev, correctlyCasedOption]);

    try {
        // Send the correctly cased option to the backend
        await invoke('add_option', { optionType: type, option: correctlyCasedOption });
        toast.success(`New ${type} "${correctlyCasedOption.label}" saved.`);
    } catch (error) {
        console.error(`Failed to save new ${type}:`, error);
        toast.error(`Failed to save new ${type}.`);
        // Revert state if the save fails
        stateUpdater[type](prev => prev.filter(opt => opt.value !== correctlyCasedOption.value));
    }
  }

  return (
    <div className="w-full max-w-full px-6 py-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Shipments</h1>
        <div className="flex items-center gap-2">
           <Button onClick={handleOpenFormForAdd} style={{ backgroundColor: '#85b79a' }} className="w-auto px-4 py-2 text-black hover:opacity-90"><Plus className="mr-2 h-4 w-4"/>Add New</Button>
           <Button onClick={handleImport} style={{ backgroundColor: '#e1d460' }}>  <Upload className="mr-2 h-4 w-4" />Import</Button>
           <Button onClick={handleExportSelected} style={{ backgroundColor: '#7c725a' }} className="bg-primary text-primary-foreground" disabled={table.getFilteredSelectedRowModel().rows.length === 0}><FileOutput className="mr-2 h-4 w-4" />Export Selected</Button>
           <Button onClick={handleExportAll} style={{ backgroundColor: '#7c725a' }} className="bg-primary text-primary-foreground"><Download className="mr-2 h-4 w-4" />Export All</Button>
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
