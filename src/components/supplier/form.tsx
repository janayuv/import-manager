// Supplier add panel (embedded page-view, matches edit/view panel UX).
import { useMemo, useRef, useState } from 'react';

import {
  ActiveToggle,
  FieldError,
  FieldLabel,
  FormFooter,
  FormInput,
  Section,
} from '@/components/supplier/form-primitives';
import { cn } from '@/lib/utils';
import type { Supplier } from '@/types/supplier';

export interface SupplierAddPanelProps {
  onAdd: (newSupplier: Omit<Supplier, 'id'>) => void;
  onCancel: () => void;
  className?: string;
}

const initialState: Omit<Supplier, 'id'> = {
  supplierName: '',
  shortName: '',
  country: '',
  email: '',
  phone: '',
  beneficiaryName: '',
  bankName: '',
  branch: '',
  bankAddress: '',
  accountNo: '',
  iban: '',
  swiftCode: '',
  isActive: true,
};

export function SupplierAddPanel({
  onAdd,
  onCancel,
  className,
}: SupplierAddPanelProps) {
  const [formData, setFormData] = useState(initialState);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const supplierNameInputRef = useRef<HTMLInputElement | null>(null);

  const validationErrors = useMemo(() => {
    return {
      supplierName: formData.supplierName.trim()
        ? ''
        : 'Supplier name is required.',
      country: formData.country.trim() ? '' : 'Country is required.',
      email: formData.email.trim()
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())
          ? ''
          : 'Enter a valid email address.'
        : 'Email is required.',
    };
  }, [formData]);

  const hasValidationErrors = Object.values(validationErrors).some(Boolean);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (hasValidationErrors) {
      supplierNameInputRef.current?.focus();
      return;
    }
    onAdd(formData);
  };

  const handleCancel = () => {
    const hasInput = Object.entries(formData).some(([key, val]) => {
      if (key === 'isActive') return false;
      return String(val).trim() !== '';
    });
    if (hasInput) {
      const confirmed = window.confirm(
        'Discard unsaved supplier data and go back?'
      );
      if (!confirmed) return;
    }
    onCancel();
  };

  return (
    <section
      className={cn('im-form-page', className)}
      aria-labelledby="supplier-add-title"
    >
      <div className="im-page-title-block">
        <h1 id="supplier-add-title">New Supplier</h1>
        <p>
          Fill in contact and bank details. Required fields marked{' '}
          <span className="im-req">*</span>
        </p>
      </div>

      <div className="im-form-body">
        <Section
          label="General Information"
          sub="Primary identity and contact fields."
        >
          <div className="im-grid">
            <div>
              <FieldLabel htmlFor="supplierName" required>
                Supplier Name
              </FieldLabel>
              <FormInput
                id="supplierName"
                ref={supplierNameInputRef}
                autoFocus
                value={formData.supplierName}
                onChange={handleChange}
                hasError={submitAttempted && !!validationErrors.supplierName}
              />
              <FieldError
                message={submitAttempted ? validationErrors.supplierName : ''}
              />
            </div>

            <div>
              <FieldLabel htmlFor="shortName">Short Name</FieldLabel>
              <FormInput
                id="shortName"
                placeholder="Abbreviation"
                value={formData.shortName}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="country" required>
                Country
              </FieldLabel>
              <FormInput
                id="country"
                placeholder="e.g. Japan"
                value={formData.country}
                onChange={handleChange}
                hasError={submitAttempted && !!validationErrors.country}
              />
              <FieldError
                message={submitAttempted ? validationErrors.country : ''}
              />
            </div>

            <div>
              <FieldLabel htmlFor="email" required>
                Email
              </FieldLabel>
              <FormInput
                id="email"
                type="email"
                placeholder="contact@supplier.com"
                value={formData.email}
                onChange={handleChange}
                hasError={submitAttempted && !!validationErrors.email}
              />
              <FieldError
                message={submitAttempted ? validationErrors.email : ''}
              />
            </div>

            <div>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <FormInput
                id="phone"
                placeholder="+1 234 567 8900"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div className="im-grid__align-end">
              <FieldLabel>Status</FieldLabel>
              <ActiveToggle
                checked={formData.isActive}
                onChange={v => setFormData(prev => ({ ...prev, isActive: v }))}
              />
            </div>
          </div>
        </Section>

        <Section label="Bank Details" sub="Payment and remittance information.">
          <div className="im-grid">
            <div>
              <FieldLabel htmlFor="beneficiaryName">
                Beneficiary Name
              </FieldLabel>
              <FormInput
                id="beneficiaryName"
                value={formData.beneficiaryName}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="bankName">Bank Name</FieldLabel>
              <FormInput
                id="bankName"
                value={formData.bankName}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="branch">Branch</FieldLabel>
              <FormInput
                id="branch"
                value={formData.branch}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="bankAddress">Bank Address</FieldLabel>
              <FormInput
                id="bankAddress"
                value={formData.bankAddress}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="accountNo">Account No.</FieldLabel>
              <FormInput
                id="accountNo"
                mono
                value={formData.accountNo}
                onChange={handleChange}
              />
            </div>

            <div>
              <FieldLabel htmlFor="iban">IBAN</FieldLabel>
              <FormInput
                id="iban"
                mono
                value={formData.iban}
                onChange={handleChange}
              />
            </div>

            <div className="im-grid__full">
              <FieldLabel htmlFor="swiftCode">SWIFT / BIC Code</FieldLabel>
              <div style={{ maxWidth: 320 }}>
                <FormInput
                  id="swiftCode"
                  mono
                  placeholder="e.g. SMBCJPJT"
                  value={formData.swiftCode}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        </Section>
      </div>

      <FormFooter
        note={
          submitAttempted && hasValidationErrors
            ? 'Complete required fields before saving.'
            : 'Required: supplier name, country, email.'
        }
        noteType={submitAttempted && hasValidationErrors ? 'warn' : 'info'}
      >
        <button type="button" className="im-btn" onClick={handleCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="im-btn im-btn--primary"
          onClick={handleSubmit}
        >
          Save Supplier
        </button>
      </FormFooter>
    </section>
  );
}
