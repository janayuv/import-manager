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

import { CreatableCombobox } from '@/components/ui/combobox-creatable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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
  presentation?: 'dialog' | 'page';
  className?: string;
}

const getStatusPillClass = (status?: string) => {
  if (!status) return 'im-pill im-pill--gray';
  const s = status.toLowerCase();
  if (s.includes('delivered') || s.includes('completed'))
    return 'im-pill im-pill--green';
  if (s.includes('in-transit') || s.includes('shipped'))
    return 'im-pill im-pill--blue';
  if (s.includes('docs-rcvd')) return 'im-pill im-pill--teal';
  if (s.includes('customs')) return 'im-pill im-pill--purple';
  if (s.includes('ready')) return 'im-pill im-pill--amber';
  if (s.includes('pending')) return 'im-pill im-pill--gray';
  return 'im-pill im-pill--gray';
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
  presentation = 'dialog',
  className,
}: ProfessionalShipmentFormProps) {
  const [formData, setFormData] = React.useState<Partial<Shipment>>(
    shipmentToEdit || { status: 'docs-rcvd' }
  );
  const [activeTab, setActiveTab] = React.useState('overview');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [transitDays, setTransitDays] = React.useState<number | null>(null);
  const isPage = presentation === 'page';
  const scrollAreaClass = isPage
    ? 'min-h-0 flex-1 overflow-y-auto'
    : 'max-h-[calc(95vh-200px)] overflow-y-auto';

  React.useEffect(() => {
    if (shipmentToEdit) {
      setFormData(shipmentToEdit);
    } else {
      setFormData({ status: 'docs-rcvd' });
    }
    setActiveTab('overview');
  }, [shipmentToEdit, isOpen, isPage]);

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

  const headerRow = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          style={{
            background: 'var(--color-im-accent)',
            borderRadius: 6,
            padding: 8,
            opacity: 0.15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Ship
            style={{
              color: 'var(--color-im-accent)',
              height: 24,
              width: 24,
              position: 'absolute',
            }}
          />
          <Ship style={{ height: 24, width: 24, opacity: 0 }} />
        </div>
        <div>
          {isPage ? (
            <>
              <h2
                id="shipment-form-title"
                style={{
                  fontFamily: 'Consolas, "Courier New", monospace',
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                  color: 'var(--color-im-fg)',
                }}
              >
                {shipmentToEdit ? 'Edit shipment' : 'Create new shipment'}
              </h2>
              <p style={{ color: 'var(--color-im-muted)', fontSize: 13 }}>
                {shipmentToEdit
                  ? `Editing: ${shipmentToEdit.invoiceNumber}`
                  : 'Add a new shipment to track your goods'}
              </p>
            </>
          ) : (
            <>
              <DialogTitle className="text-xl font-semibold">
                {shipmentToEdit ? 'Edit Shipment' : 'Create New Shipment'}
              </DialogTitle>
              <DialogDescription>
                {shipmentToEdit
                  ? `Editing shipment: ${shipmentToEdit.invoiceNumber}`
                  : 'Add a new shipment to track your goods'}
              </DialogDescription>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={getStatusPillClass(formData.status)}>
          {formData.status?.replace(/-/g, ' ').toUpperCase() || 'PENDING'}
        </span>
        <button
          type="button"
          className="im-hdr-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
        >
          <X style={{ height: 16, width: 16 }} />
        </button>
      </div>
    </div>
  );

  const tabsBlock = (
    <div
      style={
        isPage
          ? {
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              flex: 1,
              overflow: 'hidden',
              padding: '0 24px',
            }
          : { flex: 1, overflow: 'hidden' }
      }
    >
      <div>
        {/* Tabs nav */}
        <div className="im-tabs" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={
              'im-tab' + (activeTab === 'overview' ? ' is-active' : '')
            }
            onClick={() => setActiveTab('overview')}
          >
            <Ship
              style={{
                height: 16,
                width: 16,
                display: 'inline',
                marginRight: 6,
              }}
            />
            Overview
          </button>
          <button
            type="button"
            className={
              'im-tab' + (activeTab === 'commercial' ? ' is-active' : '')
            }
            onClick={() => setActiveTab('commercial')}
          >
            <DollarSign
              style={{
                height: 16,
                width: 16,
                display: 'inline',
                marginRight: 6,
              }}
            />
            Commercial
          </button>
          <button
            type="button"
            className={
              'im-tab' + (activeTab === 'logistics' ? ' is-active' : '')
            }
            onClick={() => setActiveTab('logistics')}
          >
            <Truck
              style={{
                height: 16,
                width: 16,
                display: 'inline',
                marginRight: 6,
              }}
            />
            Logistics
          </button>
        </div>

        <div className={scrollAreaClass}>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 24,
                }}
              >
                {/* Basic Information */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span
                      className="im-section__label"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <FileText style={{ height: 16, width: 16 }} />
                      Basic Information
                    </span>
                  </div>
                  <div
                    className="im-section__body"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {getFieldIcon('supplierId')}
                        Supplier *
                      </p>
                      <CreatableCombobox
                        options={suppliers}
                        value={formData.supplierId || ''}
                        onChange={v => handleSelectChange('supplierId', v)}
                        onOptionCreate={opt => onOptionCreate('supplier', opt)}
                        placeholder="Select supplier"
                      />
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p
                          className="im-field-label"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          {getFieldIcon('invoiceNumber')}
                          Invoice Number *
                        </p>
                        <input
                          className="im-input"
                          id="invoiceNumber"
                          value={formData.invoiceNumber || ''}
                          onChange={handleChange}
                          placeholder="Enter invoice number"
                        />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p
                          className="im-field-label"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          {getFieldIcon('invoiceDate')}
                          Invoice Date *
                        </p>
                        <input
                          className="im-input"
                          id="invoiceDate"
                          type="date"
                          value={formData.invoiceDate || ''}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {getFieldIcon('goodsCategory')}
                        Goods Category *
                      </p>
                      <CreatableCombobox
                        options={categories}
                        value={formData.goodsCategory || ''}
                        onChange={v => handleSelectChange('goodsCategory', v)}
                        onOptionCreate={opt => onOptionCreate('category', opt)}
                        placeholder="Select goods category"
                      />
                    </div>
                  </div>
                </div>

                {/* Status & Type */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span
                      className="im-section__label"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <Settings style={{ height: 16, width: 16 }} />
                      Status &amp; Classification
                    </span>
                  </div>
                  <div
                    className="im-section__body"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {getFieldIcon('status')}
                        Status
                      </p>
                      <CreatableCombobox
                        options={statuses}
                        value={formData.status || ''}
                        onChange={v => handleSelectChange('status', v)}
                        onOptionCreate={opt => onOptionCreate('status', opt)}
                        placeholder="Select status"
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {getFieldIcon('shipmentType')}
                        Shipment Type
                      </p>
                      <CreatableCombobox
                        options={types}
                        value={formData.shipmentType || ''}
                        onChange={v => handleSelectChange('shipmentType', v)}
                        onOptionCreate={opt => onOptionCreate('type', opt)}
                        placeholder="Select shipment type"
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {getFieldIcon('modeOfTransport')}
                        Mode of Transport
                      </p>
                      <CreatableCombobox
                        options={modes}
                        value={formData.shipmentMode || ''}
                        onChange={v => handleSelectChange('shipmentMode', v)}
                        onOptionCreate={opt => onOptionCreate('mode', opt)}
                        placeholder="Select transport mode"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Commercial Tab */}
          {activeTab === 'commercial' && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 24,
                }}
              >
                {/* Invoice Details */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span
                      className="im-section__label"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <DollarSign style={{ height: 16, width: 16 }} />
                      Invoice Details
                    </span>
                  </div>
                  <div
                    className="im-section__body"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p
                          className="im-field-label"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          {getFieldIcon('invoiceCurrency')}
                          Currency *
                        </p>
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

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p
                          className="im-field-label"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          {getFieldIcon('invoiceValue')}
                          Invoice Value *
                        </p>
                        <input
                          className="im-input"
                          id="invoiceValue"
                          type="number"
                          value={formData.invoiceValue ?? ''}
                          onChange={handleChange}
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <p
                        className="im-field-label"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {getFieldIcon('incoterm')}
                        Incoterm *
                      </p>
                      <CreatableCombobox
                        options={incoterms}
                        value={formData.incoterm || ''}
                        onChange={v => handleSelectChange('incoterm', v)}
                        onOptionCreate={opt => onOptionCreate('incoterm', opt)}
                        placeholder="FOB, CIF, EXW, etc."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Logistics Tab */}
          {activeTab === 'logistics' && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 24,
                }}
              >
                {/* Shipping Documents */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span
                      className="im-section__label"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <FileText style={{ height: 16, width: 16 }} />
                      Shipping Documents
                    </span>
                  </div>
                  <div
                    className="im-section__body"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p className="im-field-label">BL/AWB Number</p>
                        <input
                          className="im-input"
                          id="blAwbNumber"
                          value={formData.blAwbNumber || ''}
                          onChange={handleChange}
                          placeholder="Bill of Lading / Airway Bill"
                        />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p className="im-field-label">BL/AWB Date</p>
                        <input
                          className="im-input"
                          id="blAwbDate"
                          type="date"
                          value={formData.blAwbDate || ''}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p className="im-field-label">Vessel Name</p>
                        <input
                          className="im-input"
                          id="vesselName"
                          value={formData.vesselName || ''}
                          onChange={handleChange}
                          placeholder="Ship/Flight name"
                        />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p className="im-field-label">Container Number</p>
                        <input
                          className="im-input"
                          id="containerNumber"
                          value={formData.containerNumber || ''}
                          onChange={handleChange}
                          placeholder="Container/ULD number"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping Schedule & Weight */}
                <div className="im-section">
                  <div className="im-section__header">
                    <span
                      className="im-section__label"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <Calendar style={{ height: 16, width: 16 }} />
                      Schedule &amp; Weight
                    </span>
                  </div>
                  <div
                    className="im-section__body"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p className="im-field-label">
                          ETD (Estimated Departure)
                        </p>
                        <input
                          className="im-input"
                          id="etd"
                          type="date"
                          value={formData.etd || ''}
                          onChange={handleChange}
                        />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p className="im-field-label">
                          ETA (Estimated Arrival)
                        </p>
                        <input
                          className="im-input"
                          id="eta"
                          type="date"
                          value={formData.eta || ''}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p className="im-field-label">Gross Weight (KG)</p>
                        <input
                          className="im-input"
                          id="grossWeightKg"
                          type="number"
                          value={formData.grossWeightKg ?? ''}
                          onChange={handleChange}
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                        />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p className="im-field-label">Date of Delivery</p>
                        <input
                          className="im-input"
                          id="dateOfDelivery"
                          type="date"
                          value={formData.dateOfDelivery || ''}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    {transitDays && (
                      <div
                        style={{
                          background: 'rgba(232,162,58,0.10)',
                          border: '1px solid var(--color-im-accent)',
                          borderRadius: 4,
                          padding: 12,
                        }}
                      >
                        <p className="im-field-label">Transit Time</p>
                        <p
                          style={{
                            color: 'var(--color-im-accent)',
                            fontSize: 16,
                            fontWeight: 600,
                          }}
                        >
                          {transitDays} days
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Shipment Control */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: 24,
                  marginTop: 24,
                }}
              >
                <div className="im-section">
                  <div className="im-section__header">
                    <span
                      className="im-section__label"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <Settings style={{ height: 16, width: 16 }} />
                      Shipment Control
                    </span>
                  </div>
                  <div
                    className="im-section__body"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
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
                        style={{
                          accentColor: 'var(--color-im-accent)',
                          height: 16,
                          width: 16,
                        }}
                      />
                      <p className="im-field-label" style={{ marginBottom: 0 }}>
                        Freeze Shipment
                      </p>
                    </div>
                    <p style={{ color: 'var(--color-im-muted)', fontSize: 12 }}>
                      Frozen shipments cannot be modified and are locked for
                      processing
                    </p>

                    {formData.isFrozen && (
                      <div
                        style={{
                          borderRadius: 4,
                          border: '1px solid #FDE68A',
                          background: '#FEFCE8',
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: '#92400E',
                          }}
                        >
                          <Settings style={{ height: 16, width: 16 }} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>
                            Shipment Frozen
                          </span>
                        </div>
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: '#A16207',
                          }}
                        >
                          This shipment is locked and cannot be modified
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const footerBlock = (
    <>
      <hr
        style={{
          border: 'none',
          borderTop: '1px solid var(--color-im-rule)',
          margin: '8px 0',
        }}
      />

      <div
        style={
          isPage
            ? {
                display: 'flex',
                flexShrink: 0,
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderTop: '1px solid var(--color-im-rule)',
                padding: '12px 24px',
              }
            : {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 16,
              }
        }
      >
        <div
          style={{
            color: 'var(--color-im-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                height: 8,
                width: 8,
                borderRadius: '50%',
                background: isFormValid() ? '#22C55E' : '#EF4444',
              }}
            />
            {isFormValid() ? 'Form is valid' : 'Please fill required fields'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="im-btn"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </button>

          <button
            type="button"
            className="im-btn im-btn--primary"
            onClick={handleSubmit}
            disabled={!isFormValid() || isSubmitting}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {isSubmitting ? (
              <div
                style={{
                  height: 16,
                  width: 16,
                  borderRadius: '50%',
                  border: '2px solid white',
                  borderTopColor: 'transparent',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
            ) : (
              <Save style={{ height: 16, width: 16 }} />
            )}
            {isSubmitting
              ? 'Saving...'
              : shipmentToEdit
                ? 'Update Shipment'
                : 'Create Shipment'}
          </button>
        </div>
      </div>
    </>
  );

  if (isPage) {
    return (
      <section
        className={cn(className)}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--color-im-bg)',
        }}
        aria-labelledby="shipment-form-title"
      >
        <header
          style={{
            flexShrink: 0,
            borderBottom: '1px solid var(--color-im-rule)',
            padding: '16px 24px',
            background: 'var(--color-im-sub)',
          }}
        >
          {headerRow}
        </header>
        {tabsBlock}
        {footerBlock}
      </section>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-hidden sm:max-w-6xl">
        <DialogHeader className="border-b pb-4">{headerRow}</DialogHeader>
        {tabsBlock}
        {footerBlock}
      </DialogContent>
    </Dialog>
  );
}
