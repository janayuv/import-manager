// src/components/item/form.tsx (MODIFIED)
// Fixed initial state and added logic to handle both local and web URLs for images.
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { CreatableCombobox } from '@/components/ui/combobox-creatable';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';

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
        return "[https://placehold.co/100x100/eee/ccc?text=No+Image](https://placehold.co/100x100/eee/ccc?text=No+Image)";
    }
    if (path.startsWith('http')) {
        return path;
    }
    return convertFileSrc(path);
};

export function ItemForm({ 
    isOpen, onOpenChange, onSubmit, itemToEdit, suppliers,
    units, currencies, countries, bcdRates, swsRates, igstRates,
    categories, endUses, purchaseUoms, onOptionCreate
}: ItemFormProps) {
  const [formData, setFormData] = React.useState<Partial<Item>>(itemToEdit || defaultInitialData);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    const initialData = itemToEdit || defaultInitialData;
    setFormData(initialData);
    setPhotoPreview(getPhotoSrc(initialData.photoPath));
  }, [itemToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value, type } = e.target;
    const isNumber = type === 'number';
    setFormData(prev => ({ ...prev, [id]: isNumber ? parseFloat(value) || 0 : value }));
  };

  const handleSelectChange = (id: keyof Item, value: string) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSwitchChange = (checked: boolean) => {
    setFormData(prev => ({...prev, isActive: checked}));
  };

  const handlePhotoUpload = async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
      if (typeof selected === 'string') {
        setFormData(prev => ({...prev, photoPath: selected}));
        setPhotoPreview(convertFileSrc(selected));
        toast.info("Photo selected. Path stored.");
      }
    } catch (error) {
      console.error("Failed to open file dialog:", error);
      toast.error("Failed to open file dialog.");
    }
  };

  const handleSubmit = () => {
    const mandatoryFields: (keyof Item)[] = ['partNumber', 'itemDescription', 'unit', 'currency', 'unitPrice', 'hsnCode'];
    const missingFields = mandatoryFields.filter(field => !formData[field]);
    if (missingFields.length > 0) {
        toast.error(`Please fill all mandatory fields: ${missingFields.join(', ')}`);
        return;
    }
    onSubmit(formData as Omit<Item, 'id'>);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{itemToEdit ? 'Edit Item' : 'Add New Item'}</DialogTitle>
          <DialogDescription>Manage item details across all tabs.</DialogDescription>
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
                <div className="space-y-2"><Label>Part Number *</Label><Input id="partNumber" value={formData.partNumber || ''} onChange={handleChange} /></div>
                <div className="space-y-2 col-span-2"><Label>Item Description *</Label><Input id="itemDescription" value={formData.itemDescription || ''} onChange={handleChange} /></div>
                <div className="space-y-2"><Label>Unit *</Label><CreatableCombobox options={units} value={formData.unit || ''} onChange={(v) => handleSelectChange('unit', v)} onOptionCreate={(opt) => onOptionCreate('unit', opt)} placeholder="e.g., PCS"/></div>
                <div className="space-y-2"><Label>Currency *</Label><CreatableCombobox options={currencies} value={formData.currency || ''} onChange={(v) => handleSelectChange('currency', v)} onOptionCreate={(opt) => onOptionCreate('currency', opt)} placeholder="e.g., USD"/></div>
                <div className="space-y-2"><Label>Unit Price *</Label><Input id="unitPrice" type="number" value={formData.unitPrice || ''} onChange={handleChange} /></div>
                <div className="space-y-2"><Label>HSN Code *</Label><Input id="hsnCode" value={formData.hsnCode || ''} onChange={handleChange} /></div>
                <div className="space-y-2"><Label>Supplier</Label><CreatableCombobox options={suppliers} value={formData.supplierId || ''} onChange={(v) => handleSelectChange('supplierId', v)} onOptionCreate={()=>{}} placeholder="Select Supplier"/></div>
                <div className="flex items-center space-x-2 pt-6"><Switch id="isActive" checked={formData.isActive} onCheckedChange={handleSwitchChange} /><Label>Is Active</Label></div>
              </div>
            </TabsContent>
            <TabsContent value="customs">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>BCD</Label><CreatableCombobox options={bcdRates} value={formData.bcd || ''} onChange={(v) => handleSelectChange('bcd', v)} onOptionCreate={(opt) => onOptionCreate('bcd', opt)} placeholder="e.g., 10%"/></div>
                <div className="space-y-2"><Label>SWS</Label><CreatableCombobox options={swsRates} value={formData.sws || ''} onChange={(v) => handleSelectChange('sws', v)} onOptionCreate={(opt) => onOptionCreate('sws', opt)} placeholder="e.g., 10%"/></div>
                <div className="space-y-2"><Label>IGST</Label><CreatableCombobox options={igstRates} value={formData.igst || ''} onChange={(v) => handleSelectChange('igst', v)} onOptionCreate={(opt) => onOptionCreate('igst', opt)} placeholder="e.g., 18%"/></div>
                <div className="space-y-2"><Label>Country of Origin</Label><CreatableCombobox options={countries} value={formData.countryOfOrigin || ''} onChange={(v) => handleSelectChange('countryOfOrigin', v)} onOptionCreate={(opt) => onOptionCreate('country', opt)} placeholder="Select Country"/></div>
              </div>
              <div className="space-y-2 mt-4"><Label>Technical Write-up</Label><Textarea id="technicalWriteUp" value={formData.technicalWriteUp || ''} onChange={handleChange} rows={10}/></div>
            </TabsContent>
            <TabsContent value="specs">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Category</Label><CreatableCombobox options={categories} value={formData.category || ''} onChange={(v) => handleSelectChange('category', v)} onOptionCreate={(opt) => onOptionCreate('category', opt)} placeholder="Select Category"/></div>
                <div className="space-y-2"><Label>End Use</Label><CreatableCombobox options={endUses} value={formData.endUse || ''} onChange={(v) => handleSelectChange('endUse', v)} onOptionCreate={(opt) => onOptionCreate('endUse', opt)} placeholder="Select End Use"/></div>
                <div className="space-y-2"><Label>Net Weight (Kg)</Label><Input id="netWeightKg" type="number" value={formData.netWeightKg || ''} onChange={handleChange} /></div>
                <div className="space-y-2"><Label>Purchase UOM</Label><CreatableCombobox options={purchaseUoms} value={formData.purchaseUom || ''} onChange={(v) => handleSelectChange('purchaseUom', v)} onOptionCreate={(opt) => onOptionCreate('purchaseUom', opt)} placeholder="e.g., Box"/></div>
                <div className="space-y-2"><Label>Gross Weight per UOM (Kg)</Label><Input id="grossWeightPerUomKg" type="number" value={formData.grossWeightPerUomKg || ''} onChange={handleChange} /></div>
              </div>
              <div className="space-y-2 mt-4">
                <Label>Photo</Label>
                <div className="flex items-center gap-4">
                  <img src={photoPreview || "[https://placehold.co/100x100/eee/ccc?text=No+Image](https://placehold.co/100x100/eee/ccc?text=No+Image)"} alt="Item Preview" className="w-24 h-24 rounded-md object-cover border"/>
                  <Button type="button" variant="outline" onClick={handlePhotoUpload}>Upload Photo</Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter>
          <Button onClick={handleSubmit} className="custom-alert-action-ok">Save Item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}