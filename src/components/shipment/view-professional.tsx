// src/components/shipment/view-professional.tsx - Professional CRM-style Shipment View
import {
  Building,
  Calendar,
  DollarSign,
  FileText,
  Globe,
  Hash,
  Package,
  Settings,
  Ship,
  Tag,
  Truck,
  X,
} from 'lucide-react';

import * as React from 'react';

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

interface ProfessionalShipmentViewProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  shipment: Shipment | null;
  suppliers: Option[];
  /** Full-page layout (no modal shell). */
  presentation?: 'dialog' | 'page';
  className?: string;
  onEdit?: () => void;
}

const getSupplierName = (suppliers: Option[], supplierId?: string): string => {
  if (!supplierId) return 'Not specified';
  const supplier = suppliers.find(s => s.value === supplierId);
  return supplier?.label || supplierId;
};

const formatCurrency = (amount?: number, currency?: string): string => {
  if (!amount && amount !== 0) return 'Not specified';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency ? `${currency} ${formatted}` : formatted;
};

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

const formatDate = (dateString?: string): string => {
  if (!dateString) return 'Not specified';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

export function ProfessionalShipmentViewDialog({
  isOpen,
  onOpenChange,
  shipment,
  suppliers,
  presentation = 'dialog',
  className,
  onEdit,
}: ProfessionalShipmentViewProps) {
  const [activeTab, setActiveTab] = React.useState('overview');
  const isPage = presentation === 'page';
  const scrollAreaClass = isPage
    ? 'min-h-0 flex-1 overflow-y-auto'
    : 'max-h-[calc(95vh-200px)] overflow-y-auto';

  React.useEffect(() => {
    if (isOpen || isPage) {
      setActiveTab('overview');
    }
  }, [isOpen, isPage, shipment?.id]);

  // Calculate transit days
  const transitDays = React.useMemo(() => {
    if (!shipment?.etd || !shipment?.eta) {
      return null;
    }
    const etdDate = new Date(shipment.etd);
    const etaDate = new Date(shipment.eta);
    const diffTime = etaDate.getTime() - etdDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : null;
  }, [shipment?.etd, shipment?.eta]);

  if (!shipment) {
    return null;
  }

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
                id="shipment-view-title"
                style={{
                  fontFamily: 'Consolas, "Courier New", monospace',
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                  color: 'var(--color-im-fg)',
                }}
              >
                {shipment.invoiceNumber}
              </h2>
              <p style={{ color: 'var(--color-im-muted)', fontSize: 13 }}>
                Shipment from {getSupplierName(suppliers, shipment.supplierId)}
              </p>
            </>
          ) : (
            <>
              <DialogTitle className="text-xl font-semibold">
                {shipment.invoiceNumber}
              </DialogTitle>
              <DialogDescription>
                Shipment from {getSupplierName(suppliers, shipment.supplierId)}
              </DialogDescription>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={getStatusPillClass(shipment.status)}>
          {shipment.status?.replace(/-/g, ' ').toUpperCase() || 'PENDING'}
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
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <Building
                        style={{
                          color: 'var(--color-im-muted)',
                          marginTop: 2,
                          height: 16,
                          width: 16,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="im-field-label">Supplier</p>
                        <p style={{ marginTop: 4, fontSize: 14 }}>
                          {getSupplierName(suppliers, shipment.supplierId)}
                        </p>
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
                          alignItems: 'flex-start',
                          gap: 12,
                        }}
                      >
                        <Hash
                          style={{
                            color: 'var(--color-im-muted)',
                            marginTop: 2,
                            height: 16,
                            width: 16,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <p className="im-field-label">Invoice Number</p>
                          <p
                            style={{
                              marginTop: 4,
                              fontFamily: 'Consolas, "Courier New", monospace',
                              fontSize: 13,
                              background: 'var(--color-im-sub)',
                              padding: '2px 6px',
                              borderRadius: 3,
                            }}
                          >
                            {shipment.invoiceNumber}
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 12,
                        }}
                      >
                        <Calendar
                          style={{
                            color: 'var(--color-im-muted)',
                            marginTop: 2,
                            height: 16,
                            width: 16,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <p className="im-field-label">Invoice Date</p>
                          <p style={{ marginTop: 4, fontSize: 14 }}>
                            {formatDate(shipment.invoiceDate)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <Tag
                        style={{
                          color: 'var(--color-im-muted)',
                          marginTop: 2,
                          height: 16,
                          width: 16,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="im-field-label">Goods Category</p>
                        <p style={{ marginTop: 4, fontSize: 14 }}>
                          {shipment.goodsCategory || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status & Classification */}
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
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <Settings
                        style={{
                          color: 'var(--color-im-muted)',
                          marginTop: 2,
                          height: 16,
                          width: 16,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="im-field-label">Status</p>
                        <div style={{ marginTop: 4 }}>
                          <span className={getStatusPillClass(shipment.status)}>
                            {shipment.status
                              ?.replace(/-/g, ' ')
                              .toUpperCase() || 'PENDING'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <Package
                        style={{
                          color: 'var(--color-im-muted)',
                          marginTop: 2,
                          height: 16,
                          width: 16,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="im-field-label">Shipment Type</p>
                        <p style={{ marginTop: 4, fontSize: 14 }}>
                          {shipment.shipmentType || 'Not specified'}
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <Truck
                        style={{
                          color: 'var(--color-im-muted)',
                          marginTop: 2,
                          height: 16,
                          width: 16,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="im-field-label">Mode of Transport</p>
                        <p style={{ marginTop: 4, fontSize: 14 }}>
                          {shipment.shipmentMode || 'Not specified'}
                        </p>
                      </div>
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
                style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}
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
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <DollarSign
                        style={{
                          color: 'var(--color-im-muted)',
                          marginTop: 2,
                          height: 16,
                          width: 16,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="im-field-label">Invoice Value</p>
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 16,
                            fontWeight: 600,
                          }}
                        >
                          {formatCurrency(
                            shipment.invoiceValue,
                            shipment.invoiceCurrency
                          )}
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <Globe
                        style={{
                          color: 'var(--color-im-muted)',
                          marginTop: 2,
                          height: 16,
                          width: 16,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <p className="im-field-label">Incoterm</p>
                        <p style={{ marginTop: 4, fontSize: 14 }}>
                          {shipment.incoterm || 'Not specified'}
                        </p>
                      </div>
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
                      gap: 12,
                    }}
                  >
                    <div>
                      <p className="im-field-label">BL/AWB Number</p>
                      <p
                        style={{
                          marginTop: 4,
                          fontFamily: 'Consolas, "Courier New", monospace',
                          fontSize: 13,
                          background: 'var(--color-im-sub)',
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}
                      >
                        {shipment.blAwbNumber || 'Not specified'}
                      </p>
                    </div>

                    <div>
                      <p className="im-field-label">BL/AWB Date</p>
                      <p style={{ marginTop: 4, fontSize: 14 }}>
                        {formatDate(shipment.blAwbDate)}
                      </p>
                    </div>

                    <div>
                      <p className="im-field-label">Vessel Name</p>
                      <p style={{ marginTop: 4, fontSize: 14 }}>
                        {shipment.vesselName || 'Not specified'}
                      </p>
                    </div>

                    <div>
                      <p className="im-field-label">Container Number</p>
                      <p
                        style={{
                          marginTop: 4,
                          fontFamily: 'Consolas, "Courier New", monospace',
                          fontSize: 13,
                          background: 'var(--color-im-sub)',
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}
                      >
                        {shipment.containerNumber || 'Not specified'}
                      </p>
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
                          background: 'var(--color-im-sub)',
                          borderRadius: 4,
                          padding: 12,
                          textAlign: 'center',
                        }}
                      >
                        <p className="im-field-label" style={{ fontSize: 11 }}>
                          ETD
                        </p>
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {formatDate(shipment.etd)}
                        </p>
                      </div>

                      <div
                        style={{
                          background: 'var(--color-im-sub)',
                          borderRadius: 4,
                          padding: 12,
                          textAlign: 'center',
                        }}
                      >
                        <p className="im-field-label" style={{ fontSize: 11 }}>
                          ETA
                        </p>
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {formatDate(shipment.eta)}
                        </p>
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
                          background: 'var(--color-im-sub)',
                          borderRadius: 4,
                          padding: 12,
                          textAlign: 'center',
                        }}
                      >
                        <p className="im-field-label" style={{ fontSize: 11 }}>
                          Gross Weight (KG)
                        </p>
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {shipment.grossWeightKg
                            ? `${shipment.grossWeightKg} kg`
                            : 'Not specified'}
                        </p>
                      </div>

                      <div
                        style={{
                          background: 'var(--color-im-sub)',
                          borderRadius: 4,
                          padding: 12,
                          textAlign: 'center',
                        }}
                      >
                        <p className="im-field-label" style={{ fontSize: 11 }}>
                          Delivery Date
                        </p>
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {formatDate(shipment.dateOfDelivery)}
                        </p>
                      </div>
                    </div>

                    {transitDays && (
                      <div
                        style={{
                          background: 'rgba(232,162,58,0.10)',
                          border: '1px solid var(--color-im-accent)',
                          borderRadius: 4,
                          padding: 12,
                          textAlign: 'center',
                        }}
                      >
                        <p className="im-field-label" style={{ fontSize: 11 }}>
                          Transit Time
                        </p>
                        <p
                          style={{
                            color: 'var(--color-im-accent)',
                            marginTop: 4,
                            fontSize: 18,
                            fontWeight: 700,
                          }}
                        >
                          {transitDays} days
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Shipment Status */}
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
                      Shipment Status
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
                        background: 'var(--color-im-sub)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 4,
                        padding: 12,
                      }}
                    >
                      <p className="im-field-label" style={{ marginBottom: 0 }}>
                        Frozen Status
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {shipment.isFrozen ? (
                          <>
                            <div
                              style={{
                                height: 8,
                                width: 8,
                                borderRadius: '50%',
                                background: '#EAB308',
                              }}
                            />
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#A16207',
                              }}
                            >
                              Frozen
                            </span>
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                height: 8,
                                width: 8,
                                borderRadius: '50%',
                                background: '#22C55E',
                              }}
                            />
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#15803D',
                              }}
                            >
                              Active
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {shipment.isFrozen && (
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
            gap: 16,
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                background: 'var(--color-im-accent)',
                height: 8,
                width: 8,
                borderRadius: '50%',
              }}
            />
            Shipment ID: {shipment.id}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {onEdit ? (
            <button
              type="button"
              className="im-btn im-btn--primary"
              onClick={onEdit}
            >
              Edit shipment
            </button>
          ) : null}
          <button
            type="button"
            className="im-btn"
            onClick={() => onOpenChange(false)}
          >
            Close
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
        aria-labelledby="shipment-view-title"
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
      <DialogContent className="max-h-[95vh] overflow-hidden sm:max-w-5xl">
        <DialogHeader className="border-b pb-4">{headerRow}</DialogHeader>
        {tabsBlock}
        {footerBlock}
      </DialogContent>
    </Dialog>
  );
}
