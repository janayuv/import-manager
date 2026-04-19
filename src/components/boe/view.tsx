// src/components/boe/view.tsx (MODIFIED)
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
import { cn } from '@/lib/utils';
import type { BoeDetails } from '@/types/boe';

interface ViewDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  boe: BoeDetails | null;
  presentation?: 'dialog' | 'page';
  className?: string;
  onEdit?: () => void;
}

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) => (
  <div>
    <p className="text-muted-foreground text-sm font-medium">{label}</p>
    <p className="font-semibold">{value || '-'}</p>
  </div>
);

export function BoeViewDialog({
  isOpen,
  onOpenChange,
  boe,
  presentation = 'dialog',
  className,
  onEdit,
}: ViewDialogProps) {
  const isPage = presentation === 'page';

  if (!boe) return null;

  const grid = (
    <div className="grid grid-cols-2 gap-4 py-4 md:grid-cols-3">
      <DetailRow label="BE Number" value={boe.beNumber} />
      <DetailRow
        label="BE Date"
        value={new Date(boe.beDate).toLocaleDateString('en-GB')}
      />
      <DetailRow label="Location" value={boe.location} />
      <DetailRow
        label="Total Assessment Value"
        value={boe.totalAssessmentValue.toFixed(2)}
      />
      <DetailRow label="Duty Amount" value={boe.dutyAmount.toFixed(2)} />
      <DetailRow
        label="Payment Date"
        value={
          boe.paymentDate
            ? new Date(boe.paymentDate).toLocaleDateString('en-GB')
            : '-'
        }
      />
      <DetailRow label="Duty Paid" value={boe.dutyPaid?.toFixed(2)} />
      <DetailRow label="Challan No." value={boe.challanNumber} />
      <DetailRow label="Ref ID" value={boe.refId} />
      <DetailRow label="Transaction ID" value={boe.transactionId} />
    </div>
  );

  const headerBlock = isPage ? (
    <>
      <h2
        id="boe-view-title"
        className="text-lg font-semibold tracking-tight sm:text-xl"
      >
        BOE: {boe.beNumber}
      </h2>
      <p className="text-muted-foreground text-sm">
        Detailed view of the Bill of Entry record.
      </p>
    </>
  ) : (
    <>
      <DialogTitle>View BOE: {boe.beNumber}</DialogTitle>
      <DialogDescription>
        Detailed view of the Bill of Entry record.
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
        aria-labelledby="boe-view-title"
      >
        <header className="shrink-0 border-b px-6 pb-4 pt-6">
          {headerBlock}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable]">
          {grid}
        </div>
        <footer className="shrink-0 px-6">
          <div
            className={cn(
              'flex flex-wrap items-center justify-end gap-2 border-t pb-6 pt-4'
            )}
          >
            {onEdit ? (
              <Button
                type="button"
                variant="default"
                useAccentColor
                onClick={onEdit}
              >
                Edit BOE
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              useAccentColor
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </footer>
      </section>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>{headerBlock}</DialogHeader>
        {grid}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
