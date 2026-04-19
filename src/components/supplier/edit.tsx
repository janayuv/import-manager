// Supplier edit panel (embedded on the supplier page).
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { Supplier } from '@/types/supplier';

export interface SupplierEditPanelProps {
  supplier: Supplier;
  onSave: (updatedSupplier: Supplier) => void;
  onCancel: () => void;
  className?: string;
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-foreground/90 text-xs font-medium uppercase tracking-wide"
    >
      {children}
      {required ? (
        <span className="text-destructive normal-case" aria-hidden>
          {' '}
          *
        </span>
      ) : null}
    </Label>
  );
}

export function SupplierEditPanel({
  supplier,
  onSave,
  onCancel,
  className,
}: SupplierEditPanelProps) {
  const [formData, setFormData] = useState<Supplier | null>(null);

  useEffect(() => {
    setFormData(supplier);
  }, [supplier]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!formData) return;
    const { id, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev!,
      [id]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = () => {
    if (formData) {
      onSave(formData);
    }
  };

  if (!formData) return null;

  return (
    <section
      className={cn(
        'bg-card text-card-foreground flex h-full min-h-0 flex-col',
        className
      )}
      aria-labelledby="supplier-edit-title"
    >
      <header className="bg-muted/25 relative shrink-0 border-b px-4 py-4 pr-12 sm:px-5 sm:pr-14">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 h-9 w-9 sm:right-4 sm:top-4"
          onClick={onCancel}
          aria-label="Cancel editing"
        >
          <X className="size-4" />
        </Button>
        <h2
          id="supplier-edit-title"
          className="text-lg font-semibold tracking-tight sm:text-xl"
        >
          {formData.supplierName}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Edit contact and bank information. Save to update this supplier
          record.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-border/80 bg-muted/20 border-b px-4 py-3 sm:px-5">
            <CardTitle className="text-base font-semibold">
              General information
            </CardTitle>
            <CardDescription>
              Primary supplier identity and contact fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="supplierName" required>
                  Supplier name
                </FieldLabel>
                <Input
                  id="supplierName"
                  value={formData.supplierName || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="shortName">Short name</FieldLabel>
                <Input
                  id="shortName"
                  value={formData.shortName || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="country" required>
                  Country
                </FieldLabel>
                <Input
                  id="country"
                  value={formData.country || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="email" required>
                  Email
                </FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
              <div className="space-y-2">
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input
                  id="phone"
                  value={formData.phone || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="border-border/80 bg-muted/15 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 sm:justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="isActive"
                    checked={formData.isActive || false}
                    onCheckedChange={checked =>
                      setFormData(prev => ({ ...prev!, isActive: !!checked }))
                    }
                    className={
                      formData.isActive
                        ? 'border-success bg-success'
                        : 'border-destructive bg-destructive'
                    }
                  />
                  <Label
                    htmlFor="isActive"
                    className="cursor-pointer font-medium"
                  >
                    Active supplier
                  </Label>
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    formData.isActive ? 'text-success' : 'text-destructive'
                  )}
                >
                  {formData.isActive
                    ? 'Listed as active'
                    : 'Listed as inactive'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-border/80 bg-muted/20 border-b px-4 py-3 sm:px-5">
            <CardTitle className="text-base font-semibold">
              Bank details
            </CardTitle>
            <CardDescription>
              Payment and remittance information for this supplier.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="beneficiaryName">
                  Beneficiary name
                </FieldLabel>
                <Input
                  id="beneficiaryName"
                  value={formData.beneficiaryName || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="bankName">Bank name</FieldLabel>
                <Input
                  id="bankName"
                  value={formData.bankName || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="branch">Branch</FieldLabel>
                <Input
                  id="branch"
                  value={formData.branch || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="bankAddress">Bank address</FieldLabel>
                <Input
                  id="bankAddress"
                  value={formData.bankAddress || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="accountNo">Account no.</FieldLabel>
                <Input
                  id="accountNo"
                  value={formData.accountNo || ''}
                  onChange={handleChange}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="iban">IBAN</FieldLabel>
                <Input
                  id="iban"
                  value={formData.iban || ''}
                  onChange={handleChange}
                  className="h-10 font-mono text-sm"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <FieldLabel htmlFor="swiftCode">SWIFT / BIC code</FieldLabel>
                <Input
                  id="swiftCode"
                  value={formData.swiftCode || ''}
                  onChange={handleChange}
                  className="h-10 max-w-full font-mono text-sm sm:max-w-md"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="bg-muted/25 border-border shrink-0 border-t px-4 py-3 sm:px-5">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            useAccentColor
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            useAccentColor
            onClick={handleSubmit}
          >
            Save supplier
          </Button>
        </div>
      </footer>
    </section>
  );
}
