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
import type { BoeDetails } from '@/types/boe';

interface BoeFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (data: Omit<BoeDetails, 'id'>, id?: string) => void;
  boeToEdit?: BoeDetails | null;
  existingBoes: BoeDetails[];
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

// Helper function to format a date string to YYYY-MM-DD for the input
const formatDateForInput = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    // Check if the date is valid to prevent errors with `toISOString`
    if (isNaN(date.getTime())) {
      return '';
    }
    // Slit to remove the time part, returning only YYYY-MM-DD
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.error('Failed to format date:', dateString, error);
    return ''; // Return empty string if parsing fails
  }
};

export const BoeForm: React.FC<BoeFormProps> = ({
  isOpen,
  onOpenChange,
  onSubmit,
  boeToEdit,
  existingBoes,
}) => {
  const [formData, setFormData] = React.useState(initialFormState);
  const [errors, setErrors] = React.useState<{ [key: string]: string }>({});

  React.useEffect(() => {
    if (boeToEdit && isOpen) {
      setFormData({
        beNumber: boeToEdit.beNumber,
        location: boeToEdit.location,
        totalAssessmentValue: boeToEdit.totalAssessmentValue,
        dutyAmount: boeToEdit.dutyAmount,
        dutyPaid: boeToEdit.dutyPaid || 0,
        challanNumber: boeToEdit.challanNumber || '',
        refId: boeToEdit.refId || '',
        transactionId: boeToEdit.transactionId || '',
        // Use the helper function here to ensure correct format
        beDate: formatDateForInput(boeToEdit.beDate),
        paymentDate: formatDateForInput(boeToEdit.paymentDate),
      });
    } else if (!boeToEdit && isOpen) {
      setFormData(initialFormState);
      setErrors({});
    }
  }, [boeToEdit, isOpen]);

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
      paymentDate: paymentDate || undefined, // Send undefined if empty
    };
    onSubmit(dataToSubmit, boeToEdit?.id);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{boeToEdit ? 'Edit BOE' : 'Add New BOE'}</DialogTitle>
          <DialogDescription>
            Fill in the details for the Bill of Entry. Click save when you're
            done.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleFormSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="beNumber">BE Number</Label>
              <Input
                id="beNumber"
                name="beNumber"
                value={formData.beNumber}
                onChange={handleChange}
              />
              {errors.beNumber && (
                <p className="text-destructive mt-1 text-xs">
                  {errors.beNumber}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="beDate">BE Date</Label>
              <Input
                id="beDate"
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
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                value={formData.location}
                onChange={handleChange}
              />
              {errors.location && (
                <p className="text-destructive mt-1 text-xs">
                  {errors.location}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="totalAssessmentValue">
                Total Assessment Value
              </Label>
              <Input
                id="totalAssessmentValue"
                name="totalAssessmentValue"
                type="number"
                value={formData.totalAssessmentValue}
                onChange={handleNumberChange}
              />
            </div>
            <div>
              <Label htmlFor="dutyAmount">Duty Amount</Label>
              <Input
                id="dutyAmount"
                name="dutyAmount"
                type="number"
                value={formData.dutyAmount}
                onChange={handleNumberChange}
              />
            </div>
            <div>
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Input
                id="paymentDate"
                name="paymentDate"
                type="date"
                value={formData.paymentDate}
                onChange={handleChange}
              />
            </div>
            <div>
              <Label htmlFor="dutyPaid">Duty Paid</Label>
              <Input
                id="dutyPaid"
                name="dutyPaid"
                type="number"
                value={formData.dutyPaid}
                onChange={handleNumberChange}
              />
            </div>
            <div>
              <Label htmlFor="challanNumber">Challan No.</Label>
              <Input
                id="challanNumber"
                name="challanNumber"
                value={formData.challanNumber}
                onChange={handleChange}
              />
            </div>
            <div>
              <Label htmlFor="refId">Ref ID</Label>
              <Input
                id="refId"
                name="refId"
                value={formData.refId}
                onChange={handleChange}
              />
            </div>
            <div>
              <Label htmlFor="transactionId">Transaction ID</Label>
              <Input
                id="transactionId"
                name="transactionId"
                value={formData.transactionId}
                onChange={handleChange}
              />
            </div>
          </div>
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
