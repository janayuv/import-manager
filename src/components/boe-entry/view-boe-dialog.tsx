'use client';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { SavedBoe } from '@/types/boe-entry';

import { CalculationResults } from './calculation-results';

interface ViewBoeDialogProps {
  boe: SavedBoe;
  onClose: () => void;
  presentation?: 'dialog' | 'page';
  className?: string;
  onEdit?: () => void;
}

export function ViewBoeDialog({
  boe,
  onClose,
  presentation = 'dialog',
  className,
  onEdit,
}: ViewBoeDialogProps) {
  const isPage = presentation === 'page';

  const handleExport = () => {
    toast.info('Export function not yet implemented.');
  };

  const resultsBlock = (
    <div className={cn('py-4', !isPage && 'max-h-[70vh] overflow-y-auto')}>
      <CalculationResults results={boe.calculationResult} />
    </div>
  );

  const headerBlock = isPage ? (
    <>
      <h2
        id="boe-entry-view-title"
        className="text-lg font-semibold tracking-tight sm:text-xl"
      >
        BOE calculation: {boe.invoiceNumber}
      </h2>
      <p className="text-muted-foreground text-sm">
        Summary for {boe.supplierName}.
      </p>
    </>
  ) : (
    <>
      <DialogTitle>View BOE Details</DialogTitle>
      <DialogDescription>
        Calculation summary for Invoice #{boe.invoiceNumber} from{' '}
        {boe.supplierName}.
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
        aria-labelledby="boe-entry-view-title"
      >
        <header className="shrink-0 border-b px-6 pb-4 pt-6">
          {headerBlock}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable]">
          {resultsBlock}
        </div>
        <footer className="border-border shrink-0 border-t px-6 py-4">
          <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="default" useAccentColor onClick={handleExport}>
              Export to CSV
            </Button>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {onEdit ? (
                <Button
                  type="button"
                  variant="default"
                  useAccentColor
                  onClick={onEdit}
                >
                  Edit calculation
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                useAccentColor
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>
        </footer>
      </section>
    );
  }

  return (
    <Dialog open={true} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="!max-w-4xl">
        <DialogHeader>{headerBlock}</DialogHeader>
        {resultsBlock}
        <DialogFooter className="sm:justify-between">
          <Button variant="default" useAccentColor onClick={handleExport}>
            Export to CSV
          </Button>
          <Button variant="outline" useAccentColor onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
