// src/components/shipment/view.tsx (MODIFIED)
// Now accepts suppliers list to show the name instead of ID.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Shipment } from '@/types/shipment';
import type { Option } from '@/types/options';
import { Separator } from '@/components/ui/separator';

interface ViewShipmentProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    shipment: Shipment | null;
    suppliers: Option[];
}

const DetailItem = ({ label, value }: { label: string; value?: string | number | null }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
        </div>
    )
}

export function ShipmentViewDialog({ isOpen, onOpenChange, shipment, suppliers }: ViewShipmentProps) {
  if (!shipment) return null;

  const supplierName = suppliers.find(s => s.value === shipment.supplierId)?.label || 'Unknown';

  const calculateTransitDays = () => {
    if (shipment.etd && shipment.eta) {
        const etd = new Date(shipment.etd);
        const eta = new Date(shipment.eta);
        if (!isNaN(etd.getTime()) && !isNaN(eta.getTime())) {
            const diffTime = Math.abs(eta.getTime() - etd.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        }
    }
    return 'N/A';
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
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
            <DetailItem label="Invoice #" value={shipment.invoiceNumber} />
            <DetailItem label="Invoice Date" value={shipment.invoiceDate} />
            <DetailItem label="Goods Category" value={shipment.goodsCategory} />
            <DetailItem label="Invoice Value" value={shipment.invoiceValue} />
            <DetailItem label="Currency" value={shipment.invoiceCurrency} />
            <DetailItem label="Incoterm" value={shipment.incoterm} />
          </div>
          <Separator />
          <h3 className="text-lg font-medium">Logistics Details</h3>
          <div className="grid grid-cols-4 gap-4">
            <DetailItem label="Mode" value={shipment.shipmentMode} />
            <DetailItem label="Type" value={shipment.shipmentType} />
            <DetailItem label="BL/AWB #" value={shipment.blAwbNumber} />
            <DetailItem label="BL/AWB Date" value={shipment.blAwbDate} />
            <DetailItem label="Vessel/Flight" value={shipment.vesselName} />
            <DetailItem label="Container #" value={shipment.containerNumber} />
            <DetailItem label="Gross Weight (Kg)" value={shipment.grossWeightKg} />
          </div>
          <Separator />
          <h3 className="text-lg font-medium">Dates & Status</h3>
          <div className="grid grid-cols-4 gap-4 items-end">
            <DetailItem label="ETD" value={shipment.etd} />
            <DetailItem label="ETA" value={shipment.eta} />
            <DetailItem label="Transit Days" value={calculateTransitDays()} />
            <DetailItem label="Status" value={shipment.status} />
            {shipment.dateOfDelivery && <DetailItem label="Date of Delivery" value={shipment.dateOfDelivery} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}