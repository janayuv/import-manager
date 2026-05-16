// Supplier read-only detail panel (embedded on the supplier page).
import { Pencil, X } from 'lucide-react';
import type { Supplier } from '@/types/supplier';
import { cn } from '@/lib/utils';

import {
  FormFooter,
  IdentityHeader,
  Section,
  ViewBoolField,
  ViewField,
} from '@/components/supplier/form-primitives';

export interface SupplierViewPanelProps {
  supplier: Supplier;
  onClose: () => void;
  /** When set, shows an Edit control next to Close */
  onEdit?: () => void;
  className?: string;
}

export function SupplierViewPanel({
  supplier,
  onClose,
  onEdit,
  className,
}: SupplierViewPanelProps) {
  return (
    <section
      className={cn('im-form-page', className)}
      aria-labelledby="supplier-view-title"
    >
      <IdentityHeader
        name={supplier.supplierName}
        sub="Read-only profile — identification, contact, and bank details."
        id={supplier.id}
        isActive={supplier.isActive}
        country={supplier.country}
        actions={
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
            {onEdit ? (
              <button
                type="button"
                className="im-btn"
                onClick={onEdit}
                aria-label="Edit supplier"
              >
                <Pencil size={13} /> Edit
              </button>
            ) : null}
            <button
              type="button"
              className="im-btn-icon"
              onClick={onClose}
              aria-label="Close panel"
            >
              <X size={13} />
            </button>
          </div>
        }
      />

      <div className="im-form-body">
        <Section
          label="General Information"
          sub="Supplier ID, names, contact channels, and status."
        >
          <div className="im-grid">
            <ViewField label="Supplier Name" value={supplier.supplierName} />
            <ViewField label="Short Name" value={supplier.shortName} />
            <ViewField label="Country" value={supplier.country} />
            <ViewField label="Email" value={supplier.email} mono />
            <ViewField label="Phone" value={supplier.phone} mono />
            <ViewBoolField label="Status" value={supplier.isActive} />
          </div>
        </Section>

        <Section
          label="Bank Details"
          sub="Beneficiary and account information on file."
        >
          <div className="im-grid">
            <ViewField
              label="Beneficiary Name"
              value={supplier.beneficiaryName}
            />
            <ViewField label="Bank Name" value={supplier.bankName} />
            <ViewField label="Branch" value={supplier.branch} />
            <ViewField label="Bank Address" value={supplier.bankAddress} />
            <ViewField label="Account No." value={supplier.accountNo} mono />
            <ViewField label="IBAN" value={supplier.iban} mono />
            <ViewField
              label="SWIFT / BIC Code"
              value={supplier.swiftCode}
              mono
              full
            />
          </div>
        </Section>
      </div>

      <FormFooter note="This record is read-only. Use Edit to make changes.">
        {onEdit ? (
          <button
            type="button"
            className="im-btn im-btn--primary"
            onClick={onEdit}
          >
            <Pencil size={13} /> Edit Supplier
          </button>
        ) : null}
        <button type="button" className="im-btn" onClick={onClose}>
          Close
        </button>
      </FormFooter>
    </section>
  );
}
