/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/view-boe-dialog.tsx (NEW)       |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| A new component that displays the details of a saved BOE in a dialog box.    |
| It reuses the `CalculationResults` component for a consistent UI.            |
================================================================================
*/
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalculationResults } from "./calculation-results";
import type { SavedBoe } from "@/types/boe-entry";
import { toast } from "sonner";

interface ViewBoeDialogProps {
  boe: SavedBoe;
  onClose: () => void;
}

export function ViewBoeDialog({ boe, onClose }: ViewBoeDialogProps) {
  
  const handleExport = () => {
    // Placeholder for backend export logic
    toast.info("Export function not yet implemented.");
  };

  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="!max-w-4xl">
        <DialogHeader>
          <DialogTitle>View BOE Details</DialogTitle>
          <DialogDescription>
            Calculation summary for Invoice #{boe.invoiceNumber} from {boe.supplierName}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 max-h-[70vh] overflow-y-auto">
            <CalculationResults results={boe.calculationResult} />
        </div>
        <DialogFooter className="sm:justify-between">
            <Button variant="secondary" onClick={handleExport}>Export to CSV</Button>
            <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}