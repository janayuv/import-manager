// Supplier edit panel (embedded on the supplier page).
import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import type { Supplier } from '@/types/supplier';
import { cn } from '@/lib/utils';

import {
  ActiveToggle,
  FieldLabel,
  FormFooter,
  FormInput,
  IdentityHeader,
  Section,
} from '@/components/supplier/form-primitives';

export interface SupplierEditPanelProps {
  supplier: Supplier;
  onSave: (updatedSupplier: Supplier) => void;
  onCancel: () => void;
  className?: string;
}

export function SupplierEditPanel({
  supplier,
  onSave,
  onCancel,
  className,
}: SupplierEditPanelProps) {
  const [formData, setFormData] = useState<Supplier | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState('');

  useEffect(() => {
    setFormData(supplier);
    setInitialSnapshot(JSON.stringify(supplier));
  }, [supplier]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!formData) return;
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev!, [id]: value }));
  };

  const handleSubmit = () => {
    if (formData) {
      onSave(formData);
    }
  };

  const isDirty = formData
    ? JSON.stringify(formData) !== initialSnapshot
    : false;
  const canSave = formData
    ? Boolean(
        formData.supplierName.trim() &&
        formData.country.trim() &&
        formData.email.trim()
      )
    : false;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'You have unsaved changes. Discard them and leave edit mode?'
      );
      if (!confirmed) return;
    }
    onCancel();
  };

  if (!formData) return null;

  return (
    <section
      className={cn('im-form-page', className)}
      aria-labelledby="supplier-edit-title"
    >
      <IdentityHeader
        name={formData.supplierName || 'Unnamed Supplier'}
        sub="Update contact and bank information, then save to apply changes."
        id={formData.id}
        isActive={formData.isActive}
        country={formData.country}
        actions={
          <button
            type="button"
            className="im-btn-icon"
            onClick={handleCancel}
            aria-label="Cancel editing"
          >
            <X size={13} />
          </button>
        }
      />

      <div className="im-form-body">
        <Section
          label="General Information"
          sub="Primary supplier identity and contact fields."
        >
          <div className="im-grid">
            <div>
              <FieldLabel htmlFor="supplierName" required>
                Supplier Name
              </FieldLabel>
              <FormInput
                id="supplierName"
                value={formData.supplierName || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="shortName">Short Name</FieldLabel>
              <FormInput
                id="shortName"
                value={formData.shortName || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="country" required>
                Country
              </FieldLabel>
              <FormInput
                id="country"
                value={formData.country || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="email" required>
                Email
              </FieldLabel>
              <FormInput
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <FormInput
                id="phone"
                value={formData.phone || ''}
                onChange={handleChange}
              />
            </div>

            <div className="im-grid__align-end">
              <FieldLabel>Status</FieldLabel>
              <ActiveToggle
                checked={formData.isActive || false}
                onChange={v => setFormData(prev => ({ ...prev!, isActive: v }))}
              />
            </div>
          </div>
        </Section>

        <Section
          label="Bank Details"
          sub="Payment and remittance information for this supplier."
        >
          <div className="im-grid">
            <div>
              <FieldLabel htmlFor="beneficiaryName">
                Beneficiary Name
              </FieldLabel>
              <FormInput
                id="beneficiaryName"
                value={formData.beneficiaryName || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="bankName">Bank Name</FieldLabel>
              <FormInput
                id="bankName"
                value={formData.bankName || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="branch">Branch</FieldLabel>
              <FormInput
                id="branch"
                value={formData.branch || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="bankAddress">Bank Address</FieldLabel>
              <FormInput
                id="bankAddress"
                value={formData.bankAddress || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="accountNo">Account No.</FieldLabel>
              <FormInput
                id="accountNo"
                mono
                value={formData.accountNo || ''}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="iban">IBAN</FieldLabel>
              <FormInput
                id="iban"
                mono
                value={formData.iban || ''}
                onChange={handleChange}
              />
            </div>

            <div className="im-grid__full">
              <FieldLabel htmlFor="swiftCode">SWIFT / BIC Code</FieldLabel>
              <div style={{ maxWidth: 320 }}>
                <FormInput
                  id="swiftCode"
                  mono
                  value={formData.swiftCode || ''}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        </Section>
      </div>

      <FormFooter
        note={
          isDirty
            ? 'Unsaved changes — save or cancel to discard.'
            : 'No unsaved changes.'
        }
        noteType={isDirty ? 'warn' : 'info'}
      >
        <button type="button" className="im-btn" onClick={handleCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="im-btn im-btn--primary"
          disabled={!isDirty || !canSave}
          onClick={handleSubmit}
        >
          <Save size={13} /> Save Supplier
        </button>
      </FormFooter>
    </section>
  );
}
