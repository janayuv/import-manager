"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { InvoiceItem, BoeItemInput, CalculationMethod } from "@/types/boe-entry";
import type { Dispatch, SetStateAction } from "react";

interface ItemsTableProps {
  items: InvoiceItem[];
  itemInputs: BoeItemInput[];
  setItemInputs: Dispatch<SetStateAction<BoeItemInput[]>>;
}

export function ItemsTable({
  items = [],
  itemInputs,
  setItemInputs,
}: ItemsTableProps) {
  const handleInputChange = (
    index: number,
    field: keyof BoeItemInput,
    value: string | number
  ) => {
    const updatedInputs = [...itemInputs];
    updatedInputs[index] = {
      ...updatedInputs[index],
      [field]: value,
    };
    setItemInputs(updatedInputs);
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-pink-800 text-gray-100">
            <TableHead className="w-[150px]">Part No</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">HS Code</TableHead>
            <TableHead className="text-right">Actual BCD %</TableHead>
            <TableHead className="text-right">Actual SWS %</TableHead>
            <TableHead className="text-right">Actual IGST %</TableHead>
            <TableHead className="w-[150px]">Calc Method</TableHead>
            <TableHead className="text-right w-[120px]">BOE BCD %</TableHead>
            <TableHead className="text-right w-[120px]">BOE SWS %</TableHead>
            <TableHead className="text-right w-[120px]">BOE IGST %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.partNo}>
              <TableCell className="font-medium">{item.partNo}</TableCell>
              <TableCell>{item.description}</TableCell>
              <TableCell className="text-right">{item.qty ?? '-'}</TableCell>
              <TableCell className="text-right">{item.unitPrice != null ? item.unitPrice.toFixed(2) : '-'}</TableCell>
              <TableCell className="text-right">{item.hsCode ?? '-'}</TableCell>
              {/* --- NEW: Display actual rates from shipment --- */}
              <TableCell className="text-right">{item.actualBcdRate.toFixed(2)}%</TableCell>
              <TableCell className="text-right">{item.actualSwsRate.toFixed(2)}%</TableCell>
              <TableCell className="text-right">{item.actualIgstRate.toFixed(2)}%</TableCell>
              <TableCell>
                <Select
                  value={itemInputs[index]?.calculationMethod || "Standard"}
                  onValueChange={(value: CalculationMethod) =>
                    handleInputChange(index, "calculationMethod", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="CEPA">CEPA</SelectItem>
                    <SelectItem value="Rodtep">Rodtep</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  className="text-right"
                  value={itemInputs[index]?.boeBcdRate ?? ''}
                  onChange={(e) =>
                    handleInputChange(index, "boeBcdRate", parseFloat(e.target.value) || 0)
                  }
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  className="text-right"
                  value={itemInputs[index]?.boeSwsRate ?? ''}
                   onChange={(e) =>
                    handleInputChange(index, "boeSwsRate", parseFloat(e.target.value) || 0)
                  }
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  className="text-right bg-gray-100"
                  value={itemInputs[index]?.boeIgstRate ?? ''}
                  readOnly // IGST should not be user-editable here
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
