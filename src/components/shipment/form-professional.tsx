// src/components/shipment/form-professional.tsx - Professional CRM-style Shipment Form
import {
  Building,
  Calendar,
  DollarSign,
  FileText,
  Globe,
  Hash,
  Package,
  Save,
  Settings,
  Ship,
  Tag,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreatableCombobox } from '@/components/ui/combobox-creatable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';

type OptionType =
  | 'supplier'
  | 'category'
  | 'incoterm'
  | 'mode'
  | 'type'
  | 'status'
  | 'currency';

interface ProfessionalShipmentFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (shipment: Omit<Shipment, 'id'>) => Promise<void>;
  shipmentToEdit?: Shipment | null;
  suppliers: Option[];
  categories: Option[];
  incoterms: Option[];
  modes: Option[];
  types: Option[];
  statuses: Option[];
  currencies: Option[];
  onOptionCreate: (type: OptionType, newOption: Option) => void;
}

const getStatusColor = (status?: string) => {
  if (!status) return 'secondary';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('delivered') || statusLower.includes('completed'))
    return 'default';
  if (statusLower.includes('in-transit') || statusLower.includes('shipped'))
    return 'default';
  if (statusLower.includes('docs-rcvd') || statusLower.includes('pending'))
    return 'secondary';
  return 'secondary';
};

export function ProfessionalShipmentForm({
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
  currencies,
  onOptionCreate,
}: ProfessionalShipmentFormProps) {
  const [formData, setFormData] = React.useState<Partial<Shipment>>(
    shipmentToEdit || { status: 'docs-rcvd' }
  );
  const [activeTab, setActiveTab] = React.useState('overview');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [transitDays, setTransitDays] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (shipmentToEdit) {
      setFormData(shipmentToEdit);
    } else {
      setFormData({ status: 'docs-rcvd' });
    }
    setActiveTab('overview'); // Reset to first tab when opening
  }, [shipmentToEdit, isOpen]);

  // Calculate transit days when ETD and ETA change
  React.useEffect(() => {
    if (formData.etd && formData.eta) {
      const etdDate = new Date(formData.etd);
      const etaDate = new Date(formData.eta);
      const diffTime = etaDate.getTime() - etdDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setTransitDays(diffDays > 0 ? diffDays : null);
    } else {
      setTransitDays(null);
    }
  }, [formData.etd, formData.eta]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value, type } = e.target;
    if (type === 'date') {
      // Store dates in yyyy-MM-dd format for HTML date inputs
      setFormData(prev => ({ ...prev, [id]: value }));
    } else {
      setFormData(prev => ({
        ...prev,
        [id]: type === 'number' ? parseFloat(value) || '' : value,
      }));
    }
  };

  const handleSelectChange = (id: keyof Shipment, value: string) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Validate mandatory fields
      const mandatoryFields: (keyof Shipment)[] = [
        'supplierId',
        'invoiceNumber',
        'invoiceDate',
        'goodsCategory',
        'invoiceValue',
        'invoiceCurrency',
        'incoterm',
      ];

      const missingFields = mandatoryFields.filter(field => {
        return !formData[field];
      });

      if (missingFields.length > 0) {
        toast.error(
          `Please fill all mandatory fields: ${missingFields
            .map(f =>
              f
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
            )
            .join(', ')}`
        );
        return;
      }

      await onSubmit(formData as Omit<Shipment, 'id'>);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldIcon = (field: string) => {
    const icons: Record<string, React.ReactNode> = {
      supplierId: <Building className="h-4 w-4" />,
      invoiceNumber: <Hash className="h-4 w-4" />,
      invoiceDate: <Calendar className="h-4 w-4" />,
      goodsCategory: <Tag className="h-4 w-4" />,
      invoiceValue: <DollarSign className="h-4 w-4" />,
      invoiceCurrency: <DollarSign className="h-4 w-4" />,
      incoterm: <Globe className="h-4 w-4" />,
      modeOfTransport: <Truck className="h-4 w-4" />,
      shipmentType: <Package className="h-4 w-4" />,
      status: <Settings className="h-4 w-4" />,
    };
    return icons[field] || <FileText className="h-4 w-4" />;
  };

  const isFormValid = () => {
    return (
      formData.supplierId &&
      formData.invoiceNumber &&
      formData.invoiceDate &&
      formData.goodsCategory &&
      formData.invoiceValue &&
      formData.invoiceCurrency &&
      formData.incoterm
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-hidden sm:max-w-6xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Ship className="text-primary h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">
                  {shipmentToEdit ? 'Edit Shipment' : 'Create New Shipment'}
                </DialogTitle>
                <DialogDescription>
                  {shipmentToEdit
                    ? `Editing shipment: ${shipmentToEdit.invoiceNumber}`
                    : 'Add a new shipment to track your goods'}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getStatusColor(formData.status)}>
                {formData.status?.replace(/-/g, ' ').toUpperCase() || 'PENDING'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="h-full"
          >
            <TabsList className="mb-4 grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Ship className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="commercial"
                className="flex items-center gap-2"
              >
                <DollarSign className="h-4 w-4" />
                Commercial
              </TabsTrigger>
              <TabsTrigger
                value="logistics"
                className="flex items-center gap-2"
              >
                <Truck className="h-4 w-4" />
                Logistics
              </TabsTrigger>
            </TabsList>

            <div className="max-h-[calc(95vh-200px)] overflow-y-auto">
              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Basic Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" />
                        Basic Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          {getFieldIcon('supplierId')}
                          Supplier *
                        </Label>
                        <CreatableCombobox
                          options={suppliers}
                          value={formData.supplierId || ''}
                          onChange={v => handleSelectChange('supplierId', v)}
                          onOptionCreate={opt =>
                            onOptionCreate('supplier', opt)
                          }
                          placeholder="Select supplier"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2 text-sm font-medium">
                            {getFieldIcon('invoiceNumber')}
                            Invoice Number *
                          </Label>
                          <Input
                            id="invoiceNumber"
                            value={formData.invoiceNumber || ''}
                            onChange={handleChange}
                            placeholder="Enter invoice number"
                            className="h-10"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="flex items-center gap-2 text-sm font-medium">
                            {getFieldIcon('invoiceDate')}
                            Invoice Date *
                          </Label>
                          <Input
                            id="invoiceDate"
                            type="date"
                            value={formData.invoiceDate || ''}
                            onChange={handleChange}
                            className="h-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          {getFieldIcon('goodsCategory')}
                          Goods Category *
                        </Label>
                        <CreatableCombobox
                          options={categories}
                          value={formData.goodsCategory || ''}
                          onChange={v => handleSelectChange('goodsCategory', v)}
                          onOptionCreate={opt =>
                            onOptionCreate('category', opt)
                          }
                          placeholder="Select goods category"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Status & Type */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="h-4 w-4" />
                        Status & Classification
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          {getFieldIcon('status')}
                          Status
                        </Label>
                        <CreatableCombobox
                          options={statuses}
                          value={formData.status || ''}
                          onChange={v => handleSelectChange('status', v)}
                          onOptionCreate={opt => onOptionCreate('status', opt)}
                          placeholder="Select status"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          {getFieldIcon('shipmentType')}
                          Shipment Type
                        </Label>
                        <CreatableCombobox
                          options={types}
                          value={formData.shipmentType || ''}
                          onChange={v => handleSelectChange('shipmentType', v)}
                          onOptionCreate={opt => onOptionCreate('type', opt)}
                          placeholder="Select shipment type"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          {getFieldIcon('modeOfTransport')}
                          Mode of Transport
                        </Label>
                        <CreatableCombobox
                          options={modes}
                          value={formData.shipmentMode || ''}
                          onChange={v => handleSelectChange('shipmentMode', v)}
                          onOptionCreate={opt => onOptionCreate('mode', opt)}
                          placeholder="Select transport mode"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Commercial Tab */}
              <TabsContent value="commercial" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Invoice Details */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <DollarSign className="h-4 w-4" />
                        Invoice Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2 text-sm font-medium">
                            {getFieldIcon('invoiceCurrency')}
                            Currency *
                          </Label>
                          <CreatableCombobox
                            options={currencies}
                            value={formData.invoiceCurrency || ''}
                            onChange={v =>
                              handleSelectChange('invoiceCurrency', v)
                            }
                            onOptionCreate={opt =>
                              onOptionCreate('currency', opt)
                            }
                            placeholder="USD, EUR, INR"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="flex items-center gap-2 text-sm font-medium">
                            {getFieldIcon('invoiceValue')}
                            Invoice Value *
                          </Label>
                          <Input
                            id="invoiceValue"
                            type="number"
                            value={formData.invoiceValue ?? ''}
                            onChange={handleChange}
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="h-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          {getFieldIcon('incoterm')}
                          Incoterm *
                        </Label>
                        <CreatableCombobox
                          options={incoterms}
                          value={formData.incoterm || ''}
                          onChange={v => handleSelectChange('incoterm', v)}
                          onOptionCreate={opt =>
                            onOptionCreate('incoterm', opt)
                          }
                          placeholder="FOB, CIF, EXW, etc."
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Logistics Tab */}
              <TabsContent value="logistics" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Shipping Documents */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" />
                        Shipping Documents
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            BL/AWB Number
                          </Label>
                          <Input
                            id="blAwbNumber"
                            value={formData.blAwbNumber || ''}
                            onChange={handleChange}
                            placeholder="Bill of Lading / Airway Bill"
                            className="h-10"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            BL/AWB Date
                          </Label>
                          <Input
                            id="blAwbDate"
                            type="date"
                            value={formData.blAwbDate || ''}
                            onChange={handleChange}
                            className="h-10"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            Vessel Name
                          </Label>
                          <Input
                            id="vesselName"
                            value={formData.vesselName || ''}
                            onChange={handleChange}
                            placeholder="Ship/Flight name"
                            className="h-10"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            Container Number
                          </Label>
                          <Input
                            id="containerNumber"
                            value={formData.containerNumber || ''}
                            onChange={handleChange}
                            placeholder="Container/ULD number"
                            className="h-10"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Shipping Schedule & Weight */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Calendar className="h-4 w-4" />
                        Schedule & Weight
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            ETD (Estimated Departure)
                          </Label>
                          <Input
                            id="etd"
                            type="date"
                            value={formData.etd || ''}
                            onChange={handleChange}
                            className="h-10"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            ETA (Estimated Arrival)
                          </Label>
                          <Input
                            id="eta"
                            type="date"
                            value={formData.eta || ''}
                            onChange={handleChange}
                            className="h-10"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            Gross Weight (KG)
                          </Label>
                          <Input
                            id="grossWeightKg"
                            type="number"
                            value={formData.grossWeightKg ?? ''}
                            onChange={handleChange}
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="h-10"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">
                            Date of Delivery
                          </Label>
                          <Input
                            id="dateOfDelivery"
                            type="date"
                            value={formData.dateOfDelivery || ''}
                            onChange={handleChange}
                            className="h-10"
                          />
                        </div>
                      </div>

                      {transitDays && (
                        <div className="bg-primary/10 rounded-lg p-3">
                          <Label className="text-muted-foreground text-sm font-medium">
                            Transit Time
                          </Label>
                          <p className="text-primary text-lg font-semibold">
                            {transitDays} days
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Shipment Control */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-1">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="h-4 w-4" />
                        Shipment Control
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="isFrozen"
                          checked={formData.isFrozen || false}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              isFrozen: e.target.checked,
                            }))
                          }
                          className="text-primary focus:ring-primary h-4 w-4 rounded border-gray-300"
                        />
                        <Label
                          htmlFor="isFrozen"
                          className="text-sm font-medium"
                        >
                          Freeze Shipment
                        </Label>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Frozen shipments cannot be modified and are locked for
                        processing
                      </p>

                      {formData.isFrozen && (
                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                          <div className="flex items-center gap-2 text-yellow-800">
                            <Settings className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              Shipment Frozen
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-yellow-700">
                            This shipment is locked and cannot be modified
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <Separator />

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1">
              <div
                className={`h-2 w-2 rounded-full ${isFormValid() ? 'bg-green-500' : 'bg-red-500'}`}
              />
              {isFormValid() ? 'Form is valid' : 'Please fill required fields'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!isFormValid() || isSubmitting}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSubmitting
                ? 'Saving...'
                : shipmentToEdit
                  ? 'Update Shipment'
                  : 'Create Shipment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
