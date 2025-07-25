// src/components/item/view.tsx (MODIFIED)
// Corrected the placeholder URL and added a console.log for debugging.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';
import { Badge } from '@/components/ui/badge';
import { convertFileSrc } from '@tauri-apps/api/core';

interface ViewItemProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    item: Item | null;
    suppliers: Option[];
}

const DetailItem = ({ label, value }: { label: string; value?: string | number | boolean | null }) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'boolean') {
        return (
            <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Badge className={value ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}>{value ? 'Active' : 'Inactive'}</Badge>
            </div>
        )
    }
    return (
        <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
        </div>
    )
}

export function ItemViewDialog({ isOpen, onOpenChange, item, suppliers }: ViewItemProps) {
  if (!item) return null;

  const supplierName = suppliers.find(s => s.value === item.supplierId)?.label || 'N/A';
  
  const getPhotoSrc = (path?: string) => {
      if (!path) {
          return "https://placehold.co/100x100/eee/ccc?text=No+Image";
      }
      if (path.startsWith('http')) {
          return path;
      }
      return convertFileSrc(path);
  };
  const photoSrc = getPhotoSrc(item.photoPath);
  
  // For debugging purposes
  console.log('Photo Source URL:', photoSrc);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Item Details: {item.partNumber}</DialogTitle>
          <DialogDescription>
            Read-only view of all item information.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general" className="bg-transparent text-gray-700 data-[state=active]:!bg-pink-600 data-[state=active]:!text-white">General Details</TabsTrigger>
            <TabsTrigger value="customs" className="bg-transparent text-gray-700 data-[state=active]:!bg-pink-600 data-[state=active]:!text-white">Commercial & Customs</TabsTrigger>
            <TabsTrigger value="specs" className="bg-transparent text-gray-700 data-[state=active]:!bg-pink-600 data-[state=active]:!text-white">Specifications</TabsTrigger>
          </TabsList>
          <div className="py-4">
            <TabsContent value="general">
              <div className="grid grid-cols-3 gap-4">
                <DetailItem label="Part Number" value={item.partNumber} />
                <div className="col-span-2"><DetailItem label="Item Description" value={item.itemDescription} /></div>
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
                <DetailItem label="BCD" value={item.bcd} />
                <DetailItem label="SWS" value={item.sws} />
                <DetailItem label="IGST" value={item.igst} />
                <DetailItem label="Country of Origin" value={item.countryOfOrigin} />
              </div>
              <div className="space-y-2 mt-4">
                <p className="text-sm text-muted-foreground">Technical Write-up</p>
                <p className="font-medium whitespace-pre-wrap">{item.technicalWriteUp || 'N/A'}</p>
              </div>
            </TabsContent>
            <TabsContent value="specs">
              <div className="grid grid-cols-3 gap-4">
                <DetailItem label="Category" value={item.category} />
                <DetailItem label="End Use" value={item.endUse} />
                <DetailItem label="Net Weight (Kg)" value={item.netWeightKg} />
                <DetailItem label="Purchase UOM" value={item.purchaseUom} />
                <DetailItem label="Gross Weight per UOM (Kg)" value={item.grossWeightPerUomKg} />
              </div>
              <div className="space-y-2 mt-4">
                <p className="text-sm text-muted-foreground">Photo</p>
                <img src={photoSrc} alt="Item Preview" className="w-24 h-24 rounded-md object-cover border"/>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}