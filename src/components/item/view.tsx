// --- FILE: src/components/item/view.tsx ---
import { convertFileSrc } from '@tauri-apps/api/core';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';

interface ViewItemProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  item: Item | null;
  suppliers: Option[];
}

// --- FIX: Added a dedicated interface for DetailItem's props ---
interface DetailItemProps {
  label: string;
  value?: string | number | boolean | null;
  isRate?: boolean;
}

const DetailItem = ({ label, value, isRate = false }: DetailItemProps) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') {
    return (
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">{label}</p>
        <Badge variant={value ? 'success' : 'destructive'}>
          {value ? 'Active' : 'Inactive'}
        </Badge>
      </div>
    );
  }
  const displayValue =
    isRate && typeof value === 'number' ? `${value.toFixed(1)}%` : value;
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="font-medium">{displayValue}</p>
    </div>
  );
};

export function ItemViewDialog({
  isOpen,
  onOpenChange,
  item,
  suppliers,
}: ViewItemProps) {
  if (!item) return null;

  const supplierName =
    suppliers.find(s => s.value === item.supplierId)?.label || 'N/A';

  const getPhotoSrc = (path?: string) => {
    if (!path) {
      return 'https://placehold.co/100x100/eee/ccc?text=No+Image';
    }
    if (path.startsWith('http')) {
      return path;
    }
    return convertFileSrc(path);
  };
  const photoSrc = getPhotoSrc(item.photoPath);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Item Details: {item.partNumber}</DialogTitle>
          <DialogDescription>
            Read-only view of all item information.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="general"
              className="data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground bg-transparent"
            >
              General Details
            </TabsTrigger>
            <TabsTrigger
              value="customs"
              className="data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground bg-transparent"
            >
              Commercial & Customs
            </TabsTrigger>
            <TabsTrigger
              value="specs"
              className="data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground bg-transparent"
            >
              Specifications
            </TabsTrigger>
          </TabsList>
          <div className="py-4">
            <TabsContent value="general">
              <div className="grid grid-cols-3 gap-4">
                <DetailItem label="Part Number" value={item.partNumber} />
                <div className="col-span-2">
                  <DetailItem
                    label="Item Description"
                    value={item.itemDescription}
                  />
                </div>
                <DetailItem label="Unit" value={item.unit} />
                <DetailItem label="Currency" value={item.currency} />
                <DetailItem label="Unit Price" value={item.unitPrice} />
                <DetailItem label="HSN Code" value={item.hsnCode} />
                <DetailItem label="Supplier" value={supplierName} />
                <DetailItem label="Status" value={item.isActive} />
              </div>
            </TabsContent>
            <TabsContent value="customs">
              <div className="grid grid-cols-3 gap-4">
                <DetailItem label="BCD" value={item.bcd} isRate />
                <DetailItem label="SWS" value={item.sws} isRate />
                <DetailItem label="IGST" value={item.igst} isRate />
                <DetailItem
                  label="Country of Origin"
                  value={item.countryOfOrigin}
                />
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-muted-foreground text-sm">
                  Technical Write-up
                </p>
                <p className="font-medium whitespace-pre-wrap">
                  {item.technicalWriteUp || 'N/A'}
                </p>
              </div>
            </TabsContent>
            <TabsContent value="specs">
              <div className="grid grid-cols-3 gap-4">
                <DetailItem label="Category" value={item.category} />
                <DetailItem label="End Use" value={item.endUse} />
                <DetailItem label="Net Weight (Kg)" value={item.netWeightKg} />
                <DetailItem label="Purchase UOM" value={item.purchaseUom} />
                <DetailItem
                  label="Gross Weight per UOM (Kg)"
                  value={item.grossWeightPerUomKg}
                />
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-muted-foreground text-sm">Photo</p>
                <img
                  src={photoSrc}
                  alt="Item Preview"
                  className="h-24 w-24 rounded-md border object-cover"
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
