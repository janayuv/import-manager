// src/components/shipment/form.tsx (MODIFIED)
// Using formatters to handle the date conversion between display and input.
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Shipment } from '@/types/shipment';
import type { Option } from '@/types/options';
import { CreatableCombobox } from '@/components/ui/combobox-creatable';
import { toast } from 'sonner';
import { formatDateForInput, formatDateForDisplay } from '@/lib/date-format';

interface ShipmentFormProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onSubmit: (shipment: Shipment) => void;
    shipmentToEdit?: Shipment | null;
    suppliers: Option[];
    categories: Option[];
    incoterms: Option[];
    modes: Option[];
    types: Option[];
    statuses: Option[];
    onOptionCreate: (type: 'category' | 'incoterm' | 'mode' | 'status' | 'type', newOption: Option) => void;
}

export function ShipmentForm({ 
    isOpen, 
    onOpenChange, 
    onSubmit, 
    shipmentToEdit, 
    suppliers, 
    categories, 
    incoterms, 
    modes,
    types,
    statuses,
    onOptionCreate,
}: ShipmentFormProps) {
  const [formData, setFormData] = React.useState<Partial<Shipment>>(shipmentToEdit || {});

  React.useEffect(() => {
    setFormData(shipmentToEdit || {});
  }, [shipmentToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value, type } = e.target;
    if (type === 'date') {
        setFormData(prev => ({ ...prev, [id]: formatDateForDisplay(value) }));
    } else {
        setFormData(prev => ({ ...prev, [id]: type === 'number' ? parseFloat(value) || 0 : value }));
    }
  };

  const handleSelectChange = (id: keyof Shipment, value: string) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = () => {
    const mandatoryFields: (keyof Shipment)[] = ['supplierId', 'invoiceNumber', 'invoiceDate', 'goodsCategory', 'invoiceValue', 'invoiceCurrency', 'incoterm'];
    const missingFields = mandatoryFields.filter(field => !formData[field]);

    if (missingFields.length > 0) {
        toast.error(`Please fill all mandatory fields: ${missingFields.join(', ')}`);
        return;
    }

    onSubmit(formData as Shipment);
  };
  
  const calculateTransitDays = () => {
    if (formData.etd && formData.eta) {
        const etdParts = formData.etd.split('-');
        const etaParts = formData.eta.split('-');
        if (etdParts.length === 3 && etaParts.length === 3) {
            const etd = new Date(`${etdParts[2]}-${etdParts[1]}-${etdParts[0]}`);
            const eta = new Date(`${etaParts[2]}-${etaParts[1]}-${etaParts[0]}`);
            if (!isNaN(etd.getTime()) && !isNaN(eta.getTime())) {
                const diffTime = Math.abs(eta.getTime() - etd.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays;
            }
        }
    }
    return 'N/A';
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{shipmentToEdit ? 'Edit Shipment' : 'Add New Shipment'}</DialogTitle>
          <DialogDescription>Fill in all the details for the shipment.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <h3 className="text-lg font-medium">Commercial Details</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2"><Label>Supplier *</Label><CreatableCombobox options={suppliers} value={formData.supplierId || ''} onChange={(v) => handleSelectChange('supplierId', v)} onOptionCreate={() => {}} placeholder="Select Supplier" /></div>
            <div className="space-y-2"><Label>Invoice # *</Label><Input id="invoiceNumber" value={formData.invoiceNumber || ''} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Invoice Date *</Label><Input id="invoiceDate" type="date" value={formatDateForInput(formData.invoiceDate)} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Goods Category *</Label><CreatableCombobox options={categories} value={formData.goodsCategory || ''} onChange={(v) => handleSelectChange('goodsCategory', v)} onOptionCreate={(newOption) => onOptionCreate('category', newOption)} placeholder="Select Category" /></div>
            <div className="space-y-2"><Label>Invoice Value *</Label><Input id="invoiceValue" type="number" value={formData.invoiceValue || ''} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Currency *</Label><Input id="invoiceCurrency" value={formData.invoiceCurrency || ''} onChange={handleChange} placeholder="e.g., USD"/></div>
            <div className="space-y-2"><Label>Incoterm *</Label><CreatableCombobox options={incoterms} value={formData.incoterm || ''} onChange={(v) => handleSelectChange('incoterm', v)} onOptionCreate={(newOption) => onOptionCreate('incoterm', newOption)} placeholder="Select Incoterm" /></div>
          </div>
          <Separator />
          <h3 className="text-lg font-medium">Logistics Details</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2"><Label>Mode</Label><CreatableCombobox options={modes} value={formData.shipmentMode || ''} onChange={(v) => handleSelectChange('shipmentMode', v)} onOptionCreate={(newOption) => onOptionCreate('mode', newOption)} placeholder="Select Mode" /></div>
            <div className="space-y-2"><Label>Type</Label><CreatableCombobox options={types} value={formData.shipmentType || ''} onChange={(v) => handleSelectChange('shipmentType', v)} onOptionCreate={(newOption) => onOptionCreate('type', newOption)} placeholder="e.g., FCL"/></div>
            <div className="space-y-2"><Label>BL/AWB #</Label><Input id="blAwbNumber" value={formData.blAwbNumber || ''} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>BL/AWB Date</Label><Input id="blAwbDate" type="date" value={formatDateForInput(formData.blAwbDate)} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Vessel/Flight</Label><Input id="vesselName" value={formData.vesselName || ''} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Container #</Label><Input id="containerNumber" value={formData.containerNumber || ''} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Gross Weight (Kg)</Label><Input id="grossWeightKg" type="number" value={formData.grossWeightKg || ''} onChange={handleChange} /></div>
          </div>
          <Separator />
          <h3 className="text-lg font-medium">Dates & Status</h3>
          <div className="grid grid-cols-4 gap-4 items-end">
            <div className="space-y-2"><Label>ETD</Label><Input id="etd" type="date" value={formatDateForInput(formData.etd)} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>ETA</Label><Input id="eta" type="date" value={formatDateForInput(formData.eta)} onChange={handleChange} /></div>
            <div className="space-y-2"><Label>Transit Days</Label><Input value={calculateTransitDays()} readOnly className="bg-muted"/></div>
            <div className="space-y-2"><Label>Status</Label><CreatableCombobox options={statuses} value={formData.status || ''} onChange={(v) => handleSelectChange('status', v)} onOptionCreate={(newOption) => onOptionCreate('status', newOption)} placeholder="Select Status" /></div>
            {formData.status === 'delivered' && (
              <div className="space-y-2"><Label>Date of Delivery</Label><Input id="dateOfDelivery" type="date" value={formatDateForInput(formData.dateOfDelivery)} onChange={handleChange} /></div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} style={{ backgroundColor: '#8aff80' }}>Save Shipment</Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}