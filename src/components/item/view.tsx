// --- FILE: src/components/item/view.tsx ---
import * as React from 'react';

import { convertFileSrc } from '@tauri-apps/api/core';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p className="im-field-label">{label}</p>
        <span className={'im-status-pill ' + (value ? 'is-active' : 'is-warn')}>
          {value ? 'Active' : 'Inactive'}
        </span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p className="im-field-label">{label}</p>
      <p
        style={{
          fontFamily: 'var(--font-im-mono)',
          fontSize: 12,
          color: 'var(--color-im-text)',
        }}
      >
        {displayValue}
      </p>
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
  const [activeItemTab, setActiveItemTab] = React.useState('general');

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
        style={{
          fontFamily: 'var(--font-im-mono)',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.05em',
          color: 'var(--color-im-text)',
          textTransform: 'uppercase',
        }}
      >
        Item: {item.partNumber}
      </h2>
      <p style={{ fontSize: 12, color: 'var(--color-im-faint)', marginTop: 4 }}>
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
    <div>
      <div className="im-tabs">
        <button
          type="button"
          className={
            'im-tab' + (activeItemTab === 'general' ? ' is-active' : '')
          }
          onClick={() => setActiveItemTab('general')}
        >
          General Details
        </button>
        <button
          type="button"
          className={
            'im-tab' + (activeItemTab === 'customs' ? ' is-active' : '')
          }
          onClick={() => setActiveItemTab('customs')}
        >
          Commercial & Customs
        </button>
        <button
          type="button"
          className={'im-tab' + (activeItemTab === 'specs' ? ' is-active' : '')}
          onClick={() => setActiveItemTab('specs')}
        >
          Specifications
        </button>
      </div>
      <div style={{ padding: '16px 0' }}>
        {activeItemTab === 'general' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
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
        )}
        {activeItemTab === 'customs' && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
              }}
            >
              <DetailItem label="BCD" value={item.bcd} isRate />
              <DetailItem label="SWS" value={item.sws} isRate />
              <DetailItem label="IGST" value={item.igst} isRate />
              <DetailItem
                label="Country of Origin"
                value={item.countryOfOrigin}
              />
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
              <p
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-im-mono)',
                  fontSize: 12,
                  color: 'var(--color-im-text)',
                }}
              >
                {item.technicalWriteUp || 'N/A'}
              </p>
            </div>
          </>
        )}
        {activeItemTab === 'specs' && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
              }}
            >
              <DetailItem label="Category" value={item.category} />
              <DetailItem label="End Use" value={item.endUse} />
              <DetailItem label="Net Weight (Kg)" value={item.netWeightKg} />
              <DetailItem label="Purchase UOM" value={item.purchaseUom} />
              <DetailItem
                label="Gross Weight per UOM (Kg)"
                value={item.grossWeightPerUomKg}
              />
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
              <img
                src={photoSrc}
                alt="Item Preview"
                style={{
                  width: 96,
                  height: 96,
                  objectFit: 'cover',
                  border: '1px solid var(--color-im-rule)',
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );

  const footerBlock = (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        paddingTop: isPage ? 16 : undefined,
        borderTop: isPage ? '1px solid var(--color-im-rule)' : undefined,
        padding: isPage ? '16px 24px' : undefined,
      }}
    >
      {onEdit ? (
        <button
          type="button"
          className="im-btn im-btn--primary"
          onClick={onEdit}
        >
          Edit item
        </button>
      ) : null}
      {isPage ? (
        <button
          type="button"
          className="im-btn"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      ) : null}
    </div>
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
        aria-labelledby="item-view-title"
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
            padding: '0 24px',
          }}
        >
          {tabsBlock}
        </div>
        <footer style={{ flexShrink: 0 }}>{footerBlock}</footer>
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
