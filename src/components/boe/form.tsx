// src/components/boe/form.tsx (MODIFIED)
import * as React from 'react';

import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import type { BoeDetails } from '@/types/boe';

interface BoeFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (data: Omit<BoeDetails, 'id'>, id?: string) => void;
  boeToEdit?: BoeDetails | null;
  existingBoes: BoeDetails[];
  presentation?: 'dialog' | 'page';
  className?: string;
}

const initialFormState = {
  beNumber: '',
  location: '',
  totalAssessmentValue: 0,
  dutyAmount: 0,
  dutyPaid: 0,
  challanNumber: '',
  refId: '',
  transactionId: '',
  beDate: '',
  paymentDate: '',
};

const formatDateForInput = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.error('Failed to format date:', dateString, error);
    return '';
  }
};

type FormState = typeof initialFormState;

function BoeFormFields({
  formData,
  errors,
  handleChange,
  handleNumberChange,
  fieldId,
}: {
  formData: FormState;
  errors: { [key: string]: string };
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleNumberChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fieldId: (name: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor={fieldId('beNumber')}>BE Number</Label>
        <Input
          id={fieldId('beNumber')}
          name="beNumber"
          value={formData.beNumber}
          onChange={handleChange}
        />
        {errors.beNumber && (
          <p className="text-destructive mt-1 text-xs">{errors.beNumber}</p>
        )}
      </div>
      <div>
        <Label htmlFor={fieldId('beDate')}>BE Date</Label>
        <Input
          id={fieldId('beDate')}
          name="beDate"
          type="date"
          value={formData.beDate}
          onChange={handleChange}
        />
        {errors.beDate && (
          <p className="text-destructive mt-1 text-xs">{errors.beDate}</p>
        )}
      </div>
      <div>
        <Label htmlFor={fieldId('location')}>Location</Label>
        <Input
          id={fieldId('location')}
          name="location"
          value={formData.location}
          onChange={handleChange}
        />
        {errors.location && (
          <p className="text-destructive mt-1 text-xs">{errors.location}</p>
        )}
      </div>
      <div>
        <Label htmlFor={fieldId('totalAssessmentValue')}>
          Total Assessment Value
        </Label>
        <Input
          id={fieldId('totalAssessmentValue')}
          name="totalAssessmentValue"
          type="number"
          value={formData.totalAssessmentValue}
          onChange={handleNumberChange}
        />
      </div>
      <div>
        <Label htmlFor={fieldId('dutyAmount')}>Duty Amount</Label>
        <Input
          id={fieldId('dutyAmount')}
          name="dutyAmount"
          type="number"
          value={formData.dutyAmount}
          onChange={handleNumberChange}
        />
      </div>
      <div>
        <Label htmlFor={fieldId('paymentDate')}>Payment Date</Label>
        <Input
          id={fieldId('paymentDate')}
          name="paymentDate"
          type="date"
          value={formData.paymentDate}
          onChange={handleChange}
        />
      </div>
      <div>
        <Label htmlFor={fieldId('dutyPaid')}>Duty Paid</Label>
        <Input
          id={fieldId('dutyPaid')}
          name="dutyPaid"
          type="number"
          value={formData.dutyPaid}
          onChange={handleNumberChange}
        />
      </div>
      <div>
        <Label htmlFor={fieldId('challanNumber')}>Challan No.</Label>
        <Input
          id={fieldId('challanNumber')}
          name="challanNumber"
          value={formData.challanNumber}
          onChange={handleChange}
        />
      </div>
      <div>
        <Label htmlFor={fieldId('refId')}>Ref ID</Label>
        <Input
          id={fieldId('refId')}
          name="refId"
          value={formData.refId}
          onChange={handleChange}
        />
      </div>
      <div>
        <Label htmlFor={fieldId('transactionId')}>Transaction ID</Label>
        <Input
          id={fieldId('transactionId')}
          name="transactionId"
          value={formData.transactionId}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

export const BoeForm: React.FC<BoeFormProps> = ({
  isOpen,
  onOpenChange,
  onSubmit,
  boeToEdit,
  existingBoes,
  presentation = 'dialog',
  className,
}) => {
  const isPage = presentation === 'page';
  const visible = isOpen || isPage;

  const [formData, setFormData] = React.useState(initialFormState);
  const [errors, setErrors] = React.useState<{ [key: string]: string }>({});

  React.useEffect(() => {
    if (boeToEdit && visible) {
      setFormData({
        beNumber: boeToEdit.beNumber,
        location: boeToEdit.location,
        totalAssessmentValue: boeToEdit.totalAssessmentValue,
        dutyAmount: boeToEdit.dutyAmount,
        dutyPaid: boeToEdit.dutyPaid || 0,
        challanNumber: boeToEdit.challanNumber || '',
        refId: boeToEdit.refId || '',
        transactionId: boeToEdit.transactionId || '',
        beDate: formatDateForInput(boeToEdit.beDate),
        paymentDate: formatDateForInput(boeToEdit.paymentDate),
      });
    } else if (!boeToEdit && visible) {
      setFormData(initialFormState);
      setErrors({});
    }
  }, [boeToEdit, visible]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.beNumber) newErrors.beNumber = 'BE Number is required.';
    if (!formData.beDate) newErrors.beDate = 'BE Date is required.';
    if (!formData.location) newErrors.location = 'Location is required.';

    const isDuplicate = existingBoes.some(
      boe =>
        boe.beNumber === formData.beNumber &&
        boe.beDate === formData.beDate &&
        boe.id !== boeToEdit?.id
    );
    if (isDuplicate)
      newErrors.beNumber = 'This BE Number already exists for this date.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const { beDate, paymentDate, ...rest } = formData;
    const dataToSubmit = {
      ...rest,
      beDate,
      paymentDate: paymentDate || undefined,
    };
    onSubmit(dataToSubmit, boeToEdit?.id);
  };

  const headerBlock = isPage ? (
    <>
      <h2
        id="boe-form-title"
        className="text-lg font-semibold tracking-tight sm:text-xl"
      >
        {boeToEdit ? `Edit BOE: ${boeToEdit.beNumber}` : 'Create new BOE'}
      </h2>
      <p className="text-muted-foreground text-sm">
        Fill in the Bill of Entry details. Save when you are done.
      </p>
    </>
  ) : (
    <>
      <DialogTitle>{boeToEdit ? 'Edit BOE' : 'Add New BOE'}</DialogTitle>
      <DialogDescription>
        Fill in the details for the Bill of Entry. Click save when you&apos;re
        done.
      </DialogDescription>
    </>
  );

  if (isPage) {
    return (
      <section
        className={cn(
          'bg-card text-card-foreground flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border shadow-sm',
          className
        )}
        aria-labelledby="boe-form-title"
      >
        <header className="shrink-0 border-b px-6 pb-4 pt-6">
          {headerBlock}
        </header>
        <form
          onSubmit={handleFormSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
            <BoeFormFields
              formData={formData}
              errors={errors}
              handleChange={handleChange}
              handleNumberChange={handleNumberChange}
              fieldId={name => `boe-page-${name}`}
            />
          </div>
          <footer className="border-border shrink-0 border-t px-6 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
              <Button
                type="button"
                variant="outline"
                useAccentColor
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="default" useAccentColor>
                {boeToEdit ? 'Update' : 'Save'}
              </Button>
            </div>
          </footer>
        </form>
      </section>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>{headerBlock}</DialogHeader>
        <form onSubmit={handleFormSubmit} className="space-y-4 pt-4">
          <BoeFormFields
            formData={formData}
            errors={errors}
            handleChange={handleChange}
            handleNumberChange={handleNumberChange}
            fieldId={name => name}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" useAccentColor>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="default" useAccentColor>
              {boeToEdit ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
