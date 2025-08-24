// src/pages/supplier/view.tsx (NEW FILE)
// This component displays supplier details in a read-only dialog.
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { formatText } from '@/lib/settings'
import { useSettings } from '@/lib/use-settings'
import type { Supplier } from '@/types/supplier'

interface ViewSupplierProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  supplier: Supplier | null
}

const DetailItem = ({ label, value }: { label: string; value?: string | boolean | null }) => {
  const { settings } = useSettings()

  if (value === undefined || value === null || value === '') return null

  if (typeof value === 'boolean') {
    const isActive = value
    return (
      <div className="flex items-center space-x-2">
        <span className="text-muted-foreground w-40 text-sm">{label}</span>
        <Badge variant={isActive ? 'success' : 'destructive'}>{isActive ? 'Active' : 'Inactive'}</Badge>
      </div>
    )
  }

  return (
    <div>
      <span className="text-muted-foreground text-sm">{label}</span>
      <p className="font-medium">{formatText(value, settings.textFormat)}</p>
    </div>
  )
}

export function ViewSupplierDialog({ isOpen, onOpenChange, supplier }: ViewSupplierProps) {
  if (!supplier) return null

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Supplier Details: {supplier.supplierName}</DialogTitle>
          <DialogDescription>Read-only view of all supplier information.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* General Details */}
          <div className="grid grid-cols-2 gap-4">
            <DetailItem
              label="Supplier ID"
              value={supplier.id}
            />
            <DetailItem
              label="Supplier Name"
              value={supplier.supplierName}
            />
            <DetailItem
              label="Short Name"
              value={supplier.shortName}
            />
            <DetailItem
              label="Country"
              value={supplier.country}
            />
            <DetailItem
              label="Email"
              value={supplier.email}
            />
            <DetailItem
              label="Phone"
              value={supplier.phone}
            />
            <DetailItem
              label="Status"
              value={supplier.isActive}
            />
          </div>

          <Separator />

          {/* Bank Details */}
          <div>
            <h3 className="mb-4 text-lg font-medium">Bank Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem
                label="Beneficiary Name"
                value={supplier.beneficiaryName}
              />
              <DetailItem
                label="Bank Name"
                value={supplier.bankName}
              />
              <DetailItem
                label="Branch"
                value={supplier.branch}
              />
              <DetailItem
                label="Bank Address"
                value={supplier.bankAddress}
              />
              <DetailItem
                label="Account No."
                value={supplier.accountNo}
              />
              <DetailItem
                label="IBAN"
                value={supplier.iban}
              />
              <DetailItem
                label="SWIFT Code"
                value={supplier.swiftCode}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
