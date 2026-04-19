// Supplier read-only detail panel (embedded on the supplier page).
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatText } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/use-settings';
import { Pencil, X } from 'lucide-react';
import type { Supplier } from '@/types/supplier';

export interface SupplierViewPanelProps {
  supplier: Supplier;
  onClose: () => void;
  /** When set, shows an Edit control next to Close */
  onEdit?: () => void;
  className?: string;
}

const DetailItem = ({
  label,
  value,
}: {
  label: string;
  value?: string | boolean | null;
}) => {
  const { settings } = useSettings();

  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'boolean') {
    const isActive = value;
    return (
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {label}
        </p>
        <Badge variant={isActive ? 'success' : 'destructive'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="text-foreground wrap-break-word text-sm font-medium leading-snug">
        {formatText(value, settings.textFormat)}
      </p>
    </div>
  );
};

export function SupplierViewPanel({
  supplier,
  onClose,
  onEdit,
  className,
}: SupplierViewPanelProps) {
  return (
    <section
      className={cn(
        'bg-card text-card-foreground flex h-full min-h-0 flex-col',
        className
      )}
      aria-labelledby="supplier-view-title"
    >
      <header className="bg-muted/25 relative shrink-0 border-b px-4 py-4 pr-12 sm:px-5 sm:pr-14">
        <div className="absolute right-3 top-3 flex gap-1 sm:right-4 sm:top-4">
          {onEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onEdit}
              aria-label="Edit supplier"
            >
              <Pencil className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X className="size-4" />
          </Button>
        </div>
        <h2
          id="supplier-view-title"
          className="text-lg font-semibold tracking-tight sm:text-xl"
        >
          {supplier.supplierName}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Read-only profile: identification, contact, and bank details.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-border/80 bg-muted/20 border-b px-4 py-3 sm:px-5">
            <CardTitle className="text-base font-semibold">
              General information
            </CardTitle>
            <CardDescription>
              Supplier ID, names, contact channels, and status.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <DetailItem label="Supplier ID" value={supplier.id} />
              <DetailItem label="Supplier name" value={supplier.supplierName} />
              <DetailItem label="Short name" value={supplier.shortName} />
              <DetailItem label="Country" value={supplier.country} />
              <DetailItem label="Email" value={supplier.email} />
              <DetailItem label="Phone" value={supplier.phone} />
              <DetailItem label="Status" value={supplier.isActive} />
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-border/80 bg-muted/20 border-b px-4 py-3 sm:px-5">
            <CardTitle className="text-base font-semibold">
              Bank details
            </CardTitle>
            <CardDescription>
              Beneficiary and account information on file.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <DetailItem
                label="Beneficiary name"
                value={supplier.beneficiaryName}
              />
              <DetailItem label="Bank name" value={supplier.bankName} />
              <DetailItem label="Branch" value={supplier.branch} />
              <DetailItem label="Bank address" value={supplier.bankAddress} />
              <DetailItem label="Account no." value={supplier.accountNo} />
              <DetailItem label="IBAN" value={supplier.iban} />
              <div className="sm:col-span-2">
                <DetailItem
                  label="SWIFT / BIC code"
                  value={supplier.swiftCode}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="bg-muted/25 border-border shrink-0 border-t px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onEdit ? (
            <Button
              type="button"
              variant="default"
              useAccentColor
              onClick={onEdit}
              className="gap-2"
            >
              <Pencil className="size-4" />
              Edit supplier
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
      </footer>
    </section>
  );
}
