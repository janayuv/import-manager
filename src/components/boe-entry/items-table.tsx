/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/items-table.tsx                 |
| (MODIFIED)                                                                   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Updated to import all types from the new central `src/types` file.           |
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
import type { InvoiceItem, BoeItemInput, CalculationMethod } from "@/types/boe-entry";
import type { Dispatch, SetStateAction } from "react";

interface ItemsTableProps {
  items: InvoiceItem[];
  itemInputs: BoeItemInput[];
  setItemInputs: Dispatch<SetStateAction<BoeItemInput[]>>;
}

export function ItemsTable({
  items,
  itemInputs,
  setItemInputs,
}: ItemsTableProps) {
  const handleInputChange = (
    index: number,
    field: keyof BoeItemInput,
    value: string | number
  ) => {
    const updatedInputs = [...itemInputs];
    // @ts-expect-error - TS can't infer that 'field' is a valid key here, but the logic is sound.
    updatedInputs[index][field] = value;
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
                  value={itemInputs[index]?.boeBcdRate || 0}
                  onChange={(e) =>
                    handleInputChange(index, "boeBcdRate", parseFloat(e.target.value))
                  }
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  className="text-right"
                  value={itemInputs[index]?.boeSwsRate || 0}
                   onChange={(e) =>
                    handleInputChange(index, "boeSwsRate", parseFloat(e.target.value))
                  }
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  className="text-right"
                  value={itemInputs[index]?.boeIgstRate || 0}
                   onChange={(e) =>
                    handleInputChange(index, "boeIgstRate", parseFloat(e.target.value))
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
