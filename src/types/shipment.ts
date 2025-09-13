export interface Shipment {
  id: string; // "SHP-0001"
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  goodsCategory: string;
  invoiceValue: number;
  invoiceCurrency: string;
  incoterm: string;
  shipmentMode?: string;
  shipmentType?: string;
  blAwbNumber?: string;
  blAwbDate?: string;
  vesselName?: string;
  containerNumber?: string;
  grossWeightKg?: number;
  etd?: string;
  eta?: string;
  status?: string;
  dateOfDelivery?: string;
  isFrozen: boolean;
}
