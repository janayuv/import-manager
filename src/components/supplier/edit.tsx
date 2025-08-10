// src/pages/supplier/edit.tsx
// This component now takes an onSave prop and calls it on submission.
// Adjust the import path as necessary
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { Supplier } from '@/types/supplier'

interface EditSupplierProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  supplier: Supplier | null
  onSave: (updatedSupplier: Supplier) => void
}

export function EditSupplierDialog({ isOpen, onOpenChange, supplier, onSave }: EditSupplierProps) {
  const [formData, setFormData] = useState<Supplier | null>(null)

  useEffect(() => {
    if (supplier) {
      setFormData(supplier)
    }
  }, [supplier])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!formData) return
    const { id, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev!, [id]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = () => {
    if (formData) {
      onSave(formData)
      onOpenChange(false)
    }
  }

  if (!formData) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Edit Supplier: {formData.supplierName}</DialogTitle>
          <DialogDescription>Update the details for this supplier.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* General Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplierName">Supplier Name *</Label>
              <Input
                id="supplierName"
                value={formData.supplierName || ''}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shortName">Short Name</Label>
              <Input id="shortName" value={formData.shortName || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country *</Label>
              <Input id="country" value={formData.country || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={formData.email || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={formData.phone || ''} onChange={handleChange} />
            </div>
            <div className="flex items-center space-x-4 pt-6">
              <Checkbox
                id="isActive"
                checked={formData.isActive || false}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev!, isActive: !!checked }))
                }
                className={
                  formData.isActive ? 'border-green-600 bg-green-600' : 'border-red-600 bg-red-600'
                }
              />
              <Label htmlFor="isActive">Is Active</Label>

              <span
                className={`text-sm font-medium ${
                  formData.isActive ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formData.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          <Separator />

          {/* Bank Details */}
          <div>
            <h3 className="mb-4 text-lg font-medium">Bank Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="beneficiaryName">Beneficiary Name</Label>
                <Input
                  id="beneficiaryName"
                  value={formData.beneficiaryName || ''}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank Name</Label>
                <Input id="bankName" value={formData.bankName || ''} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input id="branch" value={formData.branch || ''} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAddress">Bank Address</Label>
                <Input
                  id="bankAddress"
                  value={formData.bankAddress || ''}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountNo">Account No.</Label>
                <Input id="accountNo" value={formData.accountNo || ''} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input id="iban" value={formData.iban || ''} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="swiftCode">SWIFT Code</Label>
                <Input id="swiftCode" value={formData.swiftCode || ''} onChange={handleChange} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} className="bg-red-600 text-white hover:bg-red-700">
            Save Supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
