// src/pages/supplier/form.tsx
// The form for adding new suppliers. Now handles state and submission.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Supplier } from '@/types/supplier';


interface AddSupplierFormProps {
    onAdd: (newSupplier: Omit<Supplier, 'id'>) => void;
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

export function AddSupplierForm({ onAdd }: AddSupplierFormProps) {
    const [isOpen, setOpen] = useState(false);
    const [formData, setFormData] = useState(initialState);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [id]: type === 'checkbox' ? checked : value }));
    }

    const handleSubmit = () => {
        // Basic validation
        if (!formData.supplierName || !formData.country || !formData.email) {
            alert('Please fill out all mandatory fields.');
            return;
        }
        onAdd(formData);
        setFormData(initialState); // Reset form
        setOpen(false); // Close dialog
    }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button style={{ backgroundColor: '#b77372' }}>Add New Supplier</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Supplier</DialogTitle>
          <DialogDescription>
            Fill in the details for the new supplier. Mandatory fields are marked with *.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* General Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplierName">Supplier Name *</Label>
              <Input id="supplierName" value={formData.supplierName} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shortName">Short Name</Label>
              <Input id="shortName" value={formData.shortName} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country *</Label>
              <Input id="country" value={formData.country} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={formData.email} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, isActive: !!checked }))
                }
              />
              <Label htmlFor="isActive">Is Active</Label>

              {/* Status badge */}
              <span
                className={`ml-4 inline-block rounded-full px-3 py-1 text-sm font-medium 
                  ${formData.isActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
              >
                {formData.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

          </div>

          <Separator />

          {/* Bank Details */}
          <div>
            <h3 className="text-lg font-medium mb-4">Bank Details</h3>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <Label htmlFor="beneficiaryName">Beneficiary Name</Label>
                <Input id="beneficiaryName" value={formData.beneficiaryName} onChange={handleChange} />
              </div>
               <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name</Label>
                <Input id="bankName" value={formData.bankName} onChange={handleChange} />
              </div>
               <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input id="branch" value={formData.branch} onChange={handleChange} />
              </div>
               <div className="space-y-2">
                <Label htmlFor="bankAddress">Bank Address</Label>
                <Input id="bankAddress" value={formData.bankAddress} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountNo">Account No.</Label>
                <Input id="accountNo" value={formData.accountNo} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input id="iban" value={formData.iban} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="swiftCode">SWIFT Code</Label>
                <Input id="swiftCode" value={formData.swiftCode} onChange={handleChange} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} className="custom-alert-action-ok">
            Save Supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}