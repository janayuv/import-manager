// src/components/shipment/view.tsx (MODIFIED)
// Using the new date formatter for display in the view dialog.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatDateForDisplay } from '@/lib/date-format';
import { formatNumber, formatText, getFieldConfig } from '@/lib/settings';
import { useSettings } from '@/lib/use-settings';
import type { Option } from '@/types/options';
import type { Shipment } from '@/types/shipment';

interface ViewShipmentProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  shipment: Shipment | null;
  suppliers: Option[];
}

const DetailItem = ({
  label,
  value,
  isNumber = false,
  numberFormat = 'decimal',
  precision = 2,
  showSign = false,
  fieldName,
}: {
  label: string;
  value?: string | number | null;
  isNumber?: boolean;
  numberFormat?:
    | 'currency'
    | 'percentage'
    | 'decimal'
    | 'integer'
    | 'scientific';
  precision?: number;
  showSign?: boolean;
  fieldName?: string;
}) => {
  const { settings } = useSettings();

  if (value === undefined || value === null || value === '') return null;

  let displayValue = value;
  if (typeof value === 'string' && !isNumber) {
    if (fieldName) {
      const fieldConfig = getFieldConfig('shipment', fieldName);
      if (fieldConfig?.case === 'none') {
        displayValue = value;
      } else {
        displayValue = formatText(value, {
          case: fieldConfig?.case || 'sentencecase',
          trimWhitespace: fieldConfig?.trimWhitespace || false,
        });
      }
    } else {
      displayValue = formatText(value, settings.textFormat);
    }
  } else if (typeof value === 'number' || isNumber) {
    displayValue = formatNumber(Number(value), settings.numberFormat, {
      numberFormat,
      precision,
      showSign,
    });
  }

  return (
    <div>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="font-medium">{displayValue}</p>
    </div>
  );
};

export function ShipmentViewDialog({
  isOpen,
  onOpenChange,
  shipment,
  suppliers,
}: ViewShipmentProps) {
  if (!shipment) return null;

  const supplierName =
    suppliers.find(s => s.value === shipment.supplierId)?.label || 'Unknown';

  const calculateTransitDays = () => {
    if (shipment.etd && shipment.eta) {
      const etdParts = shipment.etd.split('-');
      const etaParts = shipment.eta.split('-');
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
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Shipment Details: {shipment.invoiceNumber}</DialogTitle>
          <DialogDescription>
            Read-only view of all shipment information.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <h3 className="text-lg font-medium">Commercial Details</h3>
          <div className="grid grid-cols-4 gap-4">
            <DetailItem label="Supplier" value={supplierName} />
            <DetailItem
              label="Invoice #"
              value={shipment.invoiceNumber}
              fieldName="invoiceNumber"
            />
            <DetailItem
              label="Invoice Date"
              value={formatDateForDisplay(shipment.invoiceDate)}
            />
            <DetailItem
              label="Goods Category"
              value={shipment.goodsCategory}
              fieldName="goodsCategory"
            />
            <DetailItem
              label="Invoice Value"
              value={shipment.invoiceValue}
              isNumber={true}
              numberFormat="currency"
              precision={2}
            />
            <DetailItem
              label="Currency"
              value={shipment.invoiceCurrency}
              fieldName="invoiceCurrency"
            />
            <DetailItem
              label="Incoterm"
              value={shipment.incoterm}
              fieldName="incoterm"
            />
          </div>
          <Separator />
          <h3 className="text-lg font-medium">Logistics Details</h3>
          <div className="grid grid-cols-4 gap-4">
            <DetailItem
              label="Mode"
              value={shipment.shipmentMode}
              fieldName="shipmentMode"
            />
            <DetailItem
              label="Type"
              value={shipment.shipmentType}
              fieldName="shipmentType"
            />
            <DetailItem
              label="BL/AWB #"
              value={shipment.blAwbNumber}
              fieldName="blAwbNumber"
            />
            <DetailItem
              label="BL/AWB Date"
              value={formatDateForDisplay(shipment.blAwbDate)}
            />
            <DetailItem
              label="Vessel/Flight"
              value={shipment.vesselName}
              fieldName="vesselName"
            />
            <DetailItem
              label="Container #"
              value={shipment.containerNumber}
              fieldName="containerNumber"
            />
            <DetailItem
              label="Gross Weight (Kg)"
              value={shipment.grossWeightKg}
              isNumber={true}
              numberFormat="decimal"
              precision={2}
            />
          </div>
          <Separator />
          <h3 className="text-lg font-medium">Dates & Status</h3>
          <div className="grid grid-cols-4 items-end gap-4">
            <DetailItem
              label="ETD"
              value={formatDateForDisplay(shipment.etd)}
            />
            <DetailItem
              label="ETA"
              value={formatDateForDisplay(shipment.eta)}
            />
            <DetailItem label="Transit Days" value={calculateTransitDays()} />
            <DetailItem
              label="Status"
              value={shipment.status}
              fieldName="status"
            />
            {shipment.dateOfDelivery && (
              <DetailItem
                label="Date of Delivery"
                value={formatDateForDisplay(shipment.dateOfDelivery)}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
