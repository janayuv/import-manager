/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/items-table.tsx (FIXED)         |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| 1. Updated to import all types from the new central `src/types` file.        |
| 2. Added a default empty array to the `items` prop to prevent crashes.       |
| 3. Ensured input values are always controlled to avoid React warnings.       |
| 4. Disabled the IGST input, as its value is derived from the invoice.        |
================================================================================
*/
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
import type { BoeInvoiceItem, BoeItemInput, CalculationMethod } from "@/types/boe-entry";
import type { Dispatch, SetStateAction } from "react";

interface ItemsTableProps {
  items: BoeInvoiceItem[];
  itemInputs: BoeItemInput[];
  setItemInputs: Dispatch<SetStateAction<BoeItemInput[]>>;
}

export function ItemsTable({
  items = [], // Default to an empty array to prevent .map() from crashing
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
          <TableRow>
            <TableHead className="w-[150px]">Part No</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Calc Method</TableHead>
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
                  step="0.1"                           
                  value={(itemInputs[index]?.boeBcdRate ?? 0).toFixed(1)}
                  onChange={e => {
                    // parse the string back into a float, defaulting to 0 if invalid
                    const value = parseFloat(e.target.value);
                    handleInputChange(
                      index,
                      "boeBcdRate",
                      isNaN(value) ? 0 : value
                    );
                  }}
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
