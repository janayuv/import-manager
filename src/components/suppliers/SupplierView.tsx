// src/components/suppliers/SupplierView.tsx
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Edit, User, Tag, Globe } from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import type { Supplier } from "@/types/supplier";

interface SupplierViewProps {
  supplier: Supplier;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleStatus: (supplier: Supplier) => void;
  
}

export function SupplierView({
  supplier,
  isOpen,
  onClose,
  onEdit,
  onToggleStatus,
}: SupplierViewProps) {
  const copyToClipboard = (text: string | undefined, label: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogOverlay className="fixed inset-0 bg-black/50" />
      <DialogContent className="max-w-4xl p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2">
            <User className="h-3 w-3" />
            {supplier.supplierName}
            <Badge variant="secondary">{supplier.shortName}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {([
                  ["ID", supplier.id, true],
                  ["Name", supplier.supplierName, false],
                  ["Short Name", supplier.shortName, false],
                  ["Country", supplier.country, false],
                  ["Email", supplier.email, false],
                  ["Phone", supplier.phone, false],
                ] as const).map(([label, value, mono]) => (
                  <div key={label}>
                    <div className="text-sm font-medium text-muted-foreground">
                      {label}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={mono ? "font-mono" : "font-medium"}>
                        {value ?? "—"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(value, label)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bank Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Bank Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {([
                  ["Beneficiary Name", supplier.beneficiaryName],
                  ["Bank Name", supplier.bankName],
                  ["Branch", supplier.branch],
                  ["Bank Address", supplier.bankAddress],
                  ["Account Number", supplier.accountNo],
                  ["IBAN", supplier.iban],
                  ["SWIFT Code", supplier.swiftCode],
                ] as const).map(([label, val]) => (
                  <div key={label}>
                    <div className="text-sm font-medium text-muted-foreground">
                      {label}
                    </div>
                    <div
                      className={/(IBAN|SWIFT)/.test(label) ? "font-mono" : "font-medium"}
                    >
                      {val ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>

          <Button
            onClick={onEdit}
            className="flex items-center gap-1 bg-amber-600 dark:bg-amber-400 text-white"
          >
            <Edit className="h-4 w-4" /> Edit
          </Button>

          <Button
            variant={supplier.isActive ? "destructive" : "default"}
            onClick={() => onToggleStatus(supplier)}
          >
            {supplier.isActive ? "Disable" : "Enable"}
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 
