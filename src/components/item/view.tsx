// --- FILE: src/components/item/view.tsx ---
import { convertFileSrc } from '@tauri-apps/api/core';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';

interface ViewItemProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  item: Item | null;
  suppliers: Option[];
  presentation?: 'dialog' | 'page';
  className?: string;
  onEdit?: () => void;
}

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
  let displayValue: string | number = value;
  if (isRate) {
    if (typeof value === 'number') {
      displayValue = `${value.toFixed(1)}%`;
    } else {
      const s = String(value);
      displayValue = s.includes('%') ? s : `${s}%`;
    }
  }
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
  presentation = 'dialog',
  className,
  onEdit,
}: ViewItemProps) {
  const isPage = presentation === 'page';

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

  const headerBlock = isPage ? (
    <>
      <h2
        id="item-view-title"
        className="text-lg font-semibold tracking-tight sm:text-xl"
      >
        Item: {item.partNumber}
      </h2>
      <p className="text-muted-foreground text-sm">
        Read-only view of all item information.
      </p>
    </>
  ) : (
    <>
      <DialogTitle>Item Details: {item.partNumber}</DialogTitle>
      <DialogDescription>
        Read-only view of all item information.
      </DialogDescription>
    </>
  );

  const tabsBlock = (
    <Tabs defaultValue="general">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger
          value="general"
          className="bg-transparent data-[state=active]:!bg-accent data-[state=active]:!text-accent-foreground"
        >
          General Details
        </TabsTrigger>
        <TabsTrigger
          value="customs"
          className="bg-transparent data-[state=active]:!bg-accent data-[state=active]:!text-accent-foreground"
        >
          Commercial & Customs
        </TabsTrigger>
        <TabsTrigger
          value="specs"
          className="bg-transparent data-[state=active]:!bg-accent data-[state=active]:!text-accent-foreground"
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
            <p className="text-muted-foreground text-sm">Technical Write-up</p>
            <p className="whitespace-pre-wrap font-medium">
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
  );

  const footerBlock = (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 pt-4',
        isPage && 'border-t px-6 pb-6'
      )}
    >
      {onEdit ? (
        <Button type="button" variant="default" useAccentColor onClick={onEdit}>
          Edit item
        </Button>
      ) : null}
      {isPage ? (
        <Button
          type="button"
          variant="outline"
          useAccentColor
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      ) : null}
    </div>
  );

  if (isPage) {
    return (
      <section
        className={cn(
          'bg-card text-card-foreground flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border shadow-sm',
          className
        )}
        aria-labelledby="item-view-title"
      >
        <header className="shrink-0 border-b px-6 pb-4 pt-6">
          {headerBlock}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable]">
          {tabsBlock}
        </div>
        <footer className="shrink-0 px-6">{footerBlock}</footer>
      </section>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>{headerBlock}</DialogHeader>
        {tabsBlock}
      </DialogContent>
    </Dialog>
  );
}
