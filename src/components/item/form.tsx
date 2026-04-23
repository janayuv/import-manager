// src/components/item/form.tsx (MODIFIED - Tax values are now handled as strings)
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@/lib/tauri-bridge';
import { toast } from 'sonner';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { CreatableCombobox } from '@/components/ui/combobox-creatable';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Item } from '@/types/item';
import type { Option } from '@/types/options';

interface ItemFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (item: Omit<Item, 'id'>) => void;
  itemToEdit?: Item | null;
  suppliers: Option[];
  units: Option[];
  currencies: Option[];
  countries: Option[];
  bcdRates: Option[];
  swsRates: Option[];
  igstRates: Option[];
  categories: Option[];
  endUses: Option[];
  purchaseUoms: Option[];
  onOptionCreate: (type: string, newOption: Option) => void;
  presentation?: 'dialog' | 'page';
  className?: string;
}

const defaultInitialData: Partial<Item> = {
  isActive: true,
  partNumber: '',
  itemDescription: '',
  unit: '',
  currency: '',
  unitPrice: 0,
  hsnCode: '',
  photoPath: '',
};

const getPhotoSrc = (path?: string) => {
  if (!path) {
    return 'https://placehold.co/100x100/eee/ccc?text=No+Image';
  }
  if (path.startsWith('http')) {
    return path;
  }
  return convertFileSrc(path);
};

export function ItemForm({
  isOpen,
  onOpenChange,
  onSubmit,
  itemToEdit,
  suppliers,
  units,
  currencies,
  countries,
  bcdRates,
  swsRates,
  igstRates,
  categories,
  endUses,
  purchaseUoms,
  onOptionCreate,
  presentation = 'dialog',
  className,
}: ItemFormProps) {
  const isPage = presentation === 'page';
  const visible = isOpen || isPage;

  const [formData, setFormData] = React.useState<Partial<Item>>(
    itemToEdit || defaultInitialData
  );
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    const initialData = itemToEdit || defaultInitialData;
    setFormData(initialData);
    setPhotoPreview(getPhotoSrc(initialData.photoPath));
  }, [itemToEdit, visible]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value, type } = e.target;
    const isNumber = type === 'number';
    setFormData(prev => ({
      ...prev,
      [id]: isNumber ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSelectChange = (id: keyof Item, value: string) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSwitchChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, isActive: checked }));
  };

  const handlePhotoUpload = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
      });

      if (typeof selected === 'string') {
        const savedPath = await invoke<string>('save_item_photo_file', {
          srcPath: selected,
        });

        setFormData(prev => ({ ...prev, photoPath: savedPath }));
        setPhotoPreview(convertFileSrc(savedPath));
        toast.success(`Photo saved at: ${savedPath}`);
      }
    } catch (error) {
      console.error('💥 Failed to save photo:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      toast.error('Failed to save photo.');
    }
  };

  const handleSubmit = () => {
    const mandatoryFields: (keyof Item)[] = [
      'partNumber',
      'itemDescription',
      'unit',
      'currency',
      'unitPrice',
      'hsnCode',
    ];
    const missingFields = mandatoryFields.filter(field => {
      return !formData[field];
    });
    if (missingFields.length > 0) {
      toast.error(
        `Please fill all mandatory fields: ${missingFields.join(', ')}`
      );
      return;
    }
    onSubmit(formData as Omit<Item, 'id'>);
  };

  const headerBlock = isPage ? (
    <>
      <h2
        id="item-form-title"
        className="text-lg font-semibold tracking-tight sm:text-xl"
      >
        {itemToEdit ? `Edit item: ${itemToEdit.partNumber}` : 'Create new item'}
      </h2>
      <p className="text-muted-foreground text-sm">
        Manage item details across all tabs.
      </p>
    </>
  ) : (
    <>
      <DialogTitle>{itemToEdit ? 'Edit Item' : 'Add New Item'}</DialogTitle>
      <DialogDescription>
        Manage item details across all tabs.
      </DialogDescription>
    </>
  );

  const tabsBlock = (
    <Tabs defaultValue="general">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger
          value="general"
          className="text-foreground bg-transparent data-[state=active]:!bg-accent data-[state=active]:!text-accent-foreground"
        >
          General Details
        </TabsTrigger>
        <TabsTrigger
          value="customs"
          className="text-foreground bg-transparent data-[state=active]:!bg-accent data-[state=active]:!text-accent-foreground"
        >
          Commercial & Customs
        </TabsTrigger>
        <TabsTrigger
          value="specs"
          className="text-foreground bg-transparent data-[state=active]:!bg-accent data-[state=active]:!text-accent-foreground"
        >
          Specifications
        </TabsTrigger>
      </TabsList>
      <div className="py-4">
        <TabsContent value="general">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Part Number *</Label>
              <Input
                id="partNumber"
                value={formData.partNumber || ''}
                onChange={handleChange}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Item Description *</Label>
              <Input
                id="itemDescription"
                value={formData.itemDescription || ''}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit *</Label>
              <CreatableCombobox
                options={units}
                value={formData.unit || ''}
                onChange={v => handleSelectChange('unit', v)}
                onOptionCreate={opt => onOptionCreate('unit', opt)}
                placeholder="e.g., PCS"
              />
            </div>
            <div className="space-y-2">
              <Label>Currency *</Label>
              <CreatableCombobox
                options={currencies}
                value={formData.currency || ''}
                onChange={v => handleSelectChange('currency', v)}
                onOptionCreate={opt => onOptionCreate('currency', opt)}
                placeholder="e.g., USD"
              />
            </div>
            <div className="space-y-2">
              <Label>Unit Price *</Label>
              <Input
                id="unitPrice"
                type="number"
                value={formData.unitPrice ?? ''}
                onChange={handleChange}
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label>HSN Code *</Label>
              <Input
                id="hsnCode"
                value={formData.hsnCode || ''}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <CreatableCombobox
                options={suppliers}
                value={formData.supplierId || ''}
                onChange={v => handleSelectChange('supplierId', v)}
                onOptionCreate={() => {
                  toast.info(
                    'New suppliers must be created from the Supplier Master page.'
                  );
                }}
                placeholder="Select Supplier"
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={handleSwitchChange}
              />
              <Label>Is Active</Label>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="customs">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>BCD</Label>
              <CreatableCombobox
                options={bcdRates}
                value={String(formData.bcd || '')}
                onChange={v => handleSelectChange('bcd', v)}
                onOptionCreate={opt => onOptionCreate('bcd', opt)}
                placeholder="e.g., 10%"
              />
            </div>
            <div className="space-y-2">
              <Label>SWS</Label>
              <CreatableCombobox
                options={swsRates}
                value={String(formData.sws || '')}
                onChange={v => handleSelectChange('sws', v)}
                onOptionCreate={opt => onOptionCreate('sws', opt)}
                placeholder="e.g., 10%"
              />
            </div>
            <div className="space-y-2">
              <Label>IGST</Label>
              <CreatableCombobox
                options={igstRates}
                value={String(formData.igst || '')}
                onChange={v => handleSelectChange('igst', v)}
                onOptionCreate={opt => onOptionCreate('igst', opt)}
                placeholder="e.g., 18%"
              />
            </div>
            <div className="space-y-2">
              <Label>Country of Origin</Label>
              <CreatableCombobox
                options={countries}
                value={formData.countryOfOrigin || ''}
                onChange={v => handleSelectChange('countryOfOrigin', v)}
                onOptionCreate={opt => onOptionCreate('country', opt)}
                placeholder="Select Country"
              />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label>Technical Write-up</Label>
            <Textarea
              id="technicalWriteUp"
              value={formData.technicalWriteUp || ''}
              onChange={handleChange}
              rows={10}
            />
          </div>
        </TabsContent>
        <TabsContent value="specs">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <CreatableCombobox
                options={categories}
                value={formData.category || ''}
                onChange={v => handleSelectChange('category', v)}
                onOptionCreate={opt => onOptionCreate('category', opt)}
                placeholder="Select Category"
              />
            </div>
            <div className="space-y-2">
              <Label>End Use</Label>
              <CreatableCombobox
                options={endUses}
                value={formData.endUse || ''}
                onChange={v => handleSelectChange('endUse', v)}
                onOptionCreate={opt => onOptionCreate('endUse', opt)}
                placeholder="Select End Use"
              />
            </div>
            <div className="space-y-2">
              <Label>Net Weight (Kg)</Label>
              <Input
                id="netWeightKg"
                type="number"
                value={formData.netWeightKg || ''}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label>Purchase UOM</Label>
              <CreatableCombobox
                options={purchaseUoms}
                value={formData.purchaseUom || ''}
                onChange={v => handleSelectChange('purchaseUom', v)}
                onOptionCreate={opt => onOptionCreate('purchaseUom', opt)}
                placeholder="e.g., Box"
              />
            </div>
            <div className="space-y-2">
              <Label>Gross Weight per UOM (Kg)</Label>
              <Input
                id="grossWeightPerUomKg"
                type="number"
                value={formData.grossWeightPerUomKg || ''}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label>Photo</Label>
            <div className="flex items-center gap-4">
              <img
                src={
                  photoPreview ||
                  'https://placehold.co/100x100/eee/ccc?text=No+Image'
                }
                alt="Item Preview"
                className="h-24 w-24 rounded-md border object-cover"
              />
              <Button
                type="button"
                variant="outline"
                useAccentColor
                onClick={handlePhotoUpload}
              >
                Upload Photo
              </Button>
            </div>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );

  const footerActions = (
    <>
      {isPage ? (
        <Button
          type="button"
          variant="outline"
          useAccentColor
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
      ) : (
        <DialogClose asChild>
          <Button type="button" variant="outline" useAccentColor>
            Cancel
          </Button>
        </DialogClose>
      )}
      <Button onClick={handleSubmit} variant="default" useAccentColor>
        Save Item
      </Button>
    </>
  );

  if (isPage) {
    return (
      <section
        className={cn(
          'bg-card text-card-foreground flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border shadow-sm',
          className
        )}
        aria-labelledby="item-form-title"
      >
        <header className="shrink-0 border-b px-6 pb-4 pt-6">
          {headerBlock}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
          {tabsBlock}
        </div>
        <footer className="border-border shrink-0 border-t px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
            {footerActions}
          </div>
        </footer>
      </section>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>{headerBlock}</DialogHeader>
        {tabsBlock}
        <DialogFooter>{footerActions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
