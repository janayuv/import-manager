// src/pages/supplier/form.tsx
// Supplier create dialog aligned with edit/view panel UX.
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import type { Supplier } from '@/types/supplier';

interface AddSupplierFormProps {
  onAdd: (newSupplier: Omit<Supplier, 'id'>) => void;
  disabled?: boolean;
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

export function AddSupplierForm({
  onAdd,
  disabled = false,
}: AddSupplierFormProps) {
  const [isOpen, setOpen] = useState(false);
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
    const { id, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (hasValidationErrors) {
      supplierNameInputRef.current?.focus();
      return;
    }
    onAdd(formData);
    setFormData(initialState);
    setSubmitAttempted(false);
    setOpen(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        setOpen(open);
        if (!open) {
          setFormData(initialState);
          setSubmitAttempted(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="default"
          useAccentColor
          disabled={disabled}
          className="h-9 px-3"
        >
          <Plus className="mr-2 size-4" />
          Add supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>Add supplier</DialogTitle>
          <DialogDescription>
            Create a supplier profile with contact and bank details. Required
            fields are marked with *.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Card className="gap-0 py-0 shadow-sm">
            <CardHeader className="border-border/80 bg-muted/20 border-b px-4 py-3 sm:px-5">
              <CardTitle className="text-base font-semibold">
                General information
              </CardTitle>
              <CardDescription>
                Primary identity and contact fields.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="supplierName"
                    className="text-foreground/90 text-xs font-medium uppercase tracking-wide"
                  >
                    Supplier name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="supplierName"
                    ref={supplierNameInputRef}
                    autoFocus
                    value={formData.supplierName}
                    onChange={handleChange}
                    className={cn(
                      'h-10',
                      submitAttempted &&
                        validationErrors.supplierName &&
                        'border-destructive'
                    )}
                  />
                  {submitAttempted && validationErrors.supplierName ? (
                    <p className="text-destructive text-xs">
                      {validationErrors.supplierName}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="shortName"
                    className="text-foreground/90 text-xs font-medium uppercase tracking-wide"
                  >
                    Short name
                  </Label>
                  <Input
                    id="shortName"
                    value={formData.shortName}
                    onChange={handleChange}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="country"
                    className="text-foreground/90 text-xs font-medium uppercase tracking-wide"
                  >
                    Country <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={handleChange}
                    className={cn(
                      'h-10',
                      submitAttempted &&
                        validationErrors.country &&
                        'border-destructive'
                    )}
                  />
                  {submitAttempted && validationErrors.country ? (
                    <p className="text-destructive text-xs">
                      {validationErrors.country}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-foreground/90 text-xs font-medium uppercase tracking-wide"
                  >
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={cn(
                      'h-10',
                      submitAttempted &&
                        validationErrors.email &&
                        'border-destructive'
                    )}
                  />
                  {submitAttempted && validationErrors.email ? (
                    <p className="text-destructive text-xs">
                      {validationErrors.email}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="phone"
                    className="text-foreground/90 text-xs font-medium uppercase tracking-wide"
                  >
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="h-10"
                  />
                </div>
                <div className="border-border/80 bg-muted/15 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={checked =>
                        setFormData(prev => ({ ...prev, isActive: !!checked }))
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
                Payment and remittance information.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="beneficiaryName">Beneficiary name</Label>
                  <Input
                    id="beneficiaryName"
                    value={formData.beneficiaryName}
                    onChange={handleChange}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank name</Label>
                  <Input
                    id="bankName"
                    value={formData.bankName}
                    onChange={handleChange}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={formData.branch}
                    onChange={handleChange}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankAddress">Bank address</Label>
                  <Input
                    id="bankAddress"
                    value={formData.bankAddress}
                    onChange={handleChange}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNo">Account no.</Label>
                  <Input
                    id="accountNo"
                    value={formData.accountNo}
                    onChange={handleChange}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    value={formData.iban}
                    onChange={handleChange}
                    className="h-10 font-mono text-sm"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="swiftCode">SWIFT / BIC code</Label>
                  <Input
                    id="swiftCode"
                    value={formData.swiftCode}
                    onChange={handleChange}
                    className="h-10 max-w-full font-mono text-sm sm:max-w-md"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <DialogFooter className="border-t pt-4">
          {submitAttempted && hasValidationErrors ? (
            <p className="text-destructive mr-auto text-xs">
              Complete required fields before saving.
            </p>
          ) : (
            <p className="text-muted-foreground mr-auto text-xs">
              Required fields: Supplier name, country, and email.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} variant="default" useAccentColor>
            Save supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
