// src/components/item/form.tsx (MODIFIED - Tax values are now handled as strings)
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@/lib/tauri-bridge';
import { toast } from 'sonner';

import * as React from 'react';

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

  const [activeFormTab, setActiveFormTab] = React.useState('general');
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
        style={{
          fontFamily: 'var(--font-im-mono)',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.05em',
          color: 'var(--color-im-text)',
          textTransform: 'uppercase',
        }}
      >
        {itemToEdit ? `Edit item: ${itemToEdit.partNumber}` : 'Create new item'}
      </h2>
      <p style={{ fontSize: 12, color: 'var(--color-im-faint)', marginTop: 4 }}>
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
    <div>
      <div className="im-tabs">
        <button
          type="button"
          className={
            'im-tab' + (activeFormTab === 'general' ? ' is-active' : '')
          }
          onClick={() => setActiveFormTab('general')}
        >
          General Details
        </button>
        <button
          type="button"
          className={
            'im-tab' + (activeFormTab === 'customs' ? ' is-active' : '')
          }
          onClick={() => setActiveFormTab('customs')}
        >
          Commercial & Customs
        </button>
        <button
          type="button"
          className={'im-tab' + (activeFormTab === 'specs' ? ' is-active' : '')}
          onClick={() => setActiveFormTab('specs')}
        >
          Specifications
        </button>
      </div>
      <div style={{ padding: '16px 0' }}>
        {activeFormTab === 'general' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Part Number *</p>
              <input
                className="im-input"
                id="partNumber"
                value={formData.partNumber || ''}
                onChange={handleChange}
              />
            </div>
            <div
              className="col-span-2"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <p className="im-field-label">Item Description *</p>
              <input
                className="im-input"
                id="itemDescription"
                value={formData.itemDescription || ''}
                onChange={handleChange}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Unit *</p>
              <CreatableCombobox
                options={units}
                value={formData.unit || ''}
                onChange={v => handleSelectChange('unit', v)}
                onOptionCreate={opt => onOptionCreate('unit', opt)}
                placeholder="e.g., PCS"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Currency *</p>
              <CreatableCombobox
                options={currencies}
                value={formData.currency || ''}
                onChange={v => handleSelectChange('currency', v)}
                onOptionCreate={opt => onOptionCreate('currency', opt)}
                placeholder="e.g., USD"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Unit Price *</p>
              <input
                className="im-input"
                id="unitPrice"
                type="number"
                value={formData.unitPrice ?? ''}
                onChange={handleChange}
                step="0.01"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">HSN Code *</p>
              <input
                className="im-input"
                id="hsnCode"
                value={formData.hsnCode || ''}
                onChange={handleChange}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="im-field-label">Supplier</p>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingTop: 24,
              }}
            >
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={e => handleSwitchChange(e.target.checked)}
                style={{
                  width: 16,
                  height: 16,
                  accentColor: 'var(--color-im-accent)',
                }}
              />
              <p className="im-field-label">Is Active</p>
            </div>
          </div>
        )}
        {activeFormTab === 'customs' && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">BCD</p>
                <CreatableCombobox
                  options={bcdRates}
                  value={String(formData.bcd || '')}
                  onChange={v => handleSelectChange('bcd', v)}
                  onOptionCreate={opt => onOptionCreate('bcd', opt)}
                  placeholder="e.g., 10%"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">SWS</p>
                <CreatableCombobox
                  options={swsRates}
                  value={String(formData.sws || '')}
                  onChange={v => handleSelectChange('sws', v)}
                  onOptionCreate={opt => onOptionCreate('sws', opt)}
                  placeholder="e.g., 10%"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">IGST</p>
                <CreatableCombobox
                  options={igstRates}
                  value={String(formData.igst || '')}
                  onChange={v => handleSelectChange('igst', v)}
                  onOptionCreate={opt => onOptionCreate('igst', opt)}
                  placeholder="e.g., 18%"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Country of Origin</p>
                <CreatableCombobox
                  options={countries}
                  value={formData.countryOfOrigin || ''}
                  onChange={v => handleSelectChange('countryOfOrigin', v)}
                  onOptionCreate={opt => onOptionCreate('country', opt)}
                  placeholder="Select Country"
                />
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <p className="im-field-label">Technical Write-up</p>
              <textarea
                className="im-textarea"
                id="technicalWriteUp"
                value={formData.technicalWriteUp || ''}
                onChange={handleChange}
                rows={10}
              />
            </div>
          </>
        )}
        {activeFormTab === 'specs' && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Category</p>
                <CreatableCombobox
                  options={categories}
                  value={formData.category || ''}
                  onChange={v => handleSelectChange('category', v)}
                  onOptionCreate={opt => onOptionCreate('category', opt)}
                  placeholder="Select Category"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">End Use</p>
                <CreatableCombobox
                  options={endUses}
                  value={formData.endUse || ''}
                  onChange={v => handleSelectChange('endUse', v)}
                  onOptionCreate={opt => onOptionCreate('endUse', opt)}
                  placeholder="Select End Use"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Net Weight (Kg)</p>
                <input
                  className="im-input"
                  id="netWeightKg"
                  type="number"
                  value={formData.netWeightKg || ''}
                  onChange={handleChange}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Purchase UOM</p>
                <CreatableCombobox
                  options={purchaseUoms}
                  value={formData.purchaseUom || ''}
                  onChange={v => handleSelectChange('purchaseUom', v)}
                  onOptionCreate={opt => onOptionCreate('purchaseUom', opt)}
                  placeholder="e.g., Box"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="im-field-label">Gross Weight per UOM (Kg)</p>
                <input
                  className="im-input"
                  id="grossWeightPerUomKg"
                  type="number"
                  value={formData.grossWeightPerUomKg || ''}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <p className="im-field-label">Photo</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <img
                  src={
                    photoPreview ||
                    'https://placehold.co/100x100/eee/ccc?text=No+Image'
                  }
                  alt="Item Preview"
                  style={{
                    width: 96,
                    height: 96,
                    objectFit: 'cover',
                    border: '1px solid var(--color-im-rule)',
                  }}
                />
                <button
                  type="button"
                  className="im-btn"
                  onClick={handlePhotoUpload}
                >
                  Upload Photo
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const footerActions = (
    <>
      {isPage ? (
        <button
          type="button"
          className="im-btn"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
      ) : (
        <DialogClose asChild>
          <button type="button" className="im-btn">
            Cancel
          </button>
        </DialogClose>
      )}
      <button
        type="button"
        className="im-btn im-btn--primary"
        onClick={handleSubmit}
      >
        Save Item
      </button>
    </>
  );

  if (isPage) {
    return (
      <section
        className={className}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--color-im-bg)',
        }}
        aria-labelledby="item-form-title"
      >
        <header
          style={{
            flexShrink: 0,
            borderBottom: '1px solid var(--color-im-rule)',
            padding: '16px 24px',
            background: 'var(--color-im-sub)',
          }}
        >
          {headerBlock}
        </header>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 24px',
          }}
        >
          {tabsBlock}
        </div>
        <footer
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--color-im-rule)',
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          {footerActions}
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
