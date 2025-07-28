// src/components/boe/view.tsx (MODIFIED)
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { BoeDetails } from "@/types/boe";

interface ViewDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  boe: BoeDetails | null;
}

const DetailRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div>
    <p className="text-sm font-medium text-gray-500">{label}</p>
    <p className="font-semibold">{value || '-'}</p>
  </div>
)

export function BoeViewDialog({ isOpen, onOpenChange, boe }: ViewDialogProps) {
  if (!boe) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>View BOE: {boe.beNumber}</DialogTitle>
          <DialogDescription>
            Detailed view of the Bill of Entry record.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
            <DetailRow label="BE Number" value={boe.beNumber} />
            <DetailRow label="BE Date" value={new Date(boe.beDate).toLocaleDateString('en-GB')} />
            <DetailRow label="Location" value={boe.location} />
            <DetailRow label="Total Assessment Value" value={boe.totalAssessmentValue.toFixed(2)} />
            <DetailRow label="Duty Amount" value={boe.dutyAmount.toFixed(2)} />
            <DetailRow label="Payment Date" value={boe.paymentDate ? new Date(boe.paymentDate).toLocaleDateString('en-GB') : '-'} />
            <DetailRow label="Duty Paid" value={boe.dutyPaid?.toFixed(2)} />
            <DetailRow label="Challan No." value={boe.challanNumber} />
            <DetailRow label="Ref ID" value={boe.refId} />
            <DetailRow label="Transaction ID" value={boe.transactionId} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}