// src/components/boe-entry/boe-details-table.tsx (CORRECTED)
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow,} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { BoeDetails } from "@/types/boe";
import { formatDateForDisplay } from '@/lib/date-format';

interface BoeDetailsTableProps {
 boe: BoeDetails;
}

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat("en-IN", {
       style: "currency",
        currency: "INR",
      }).format(amount);
}

export function BoeDetailsTable({ boe }: BoeDetailsTableProps) {
  return (
    <Card className="mt-6 bg-gray-900">
      <CardHeader>
        <CardTitle>Details for Selected BOE: #{boe.beNumber}</CardTitle>
          <CardDescription>
              This is the official data for the selected Bill of Entry.
              </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
            <Table>
              <TableHeader>
                  <TableRow className="bg-muted/50">
                  <TableHead>BE Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Assess. Value</TableHead>
                  <TableHead className="text-right">Duty Paid</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
 <TableCell>{formatDateForDisplay(boe.beDate)}</TableCell>
 <TableCell>{boe.location}</TableCell>
 <TableCell className="text-right font-mono">{formatCurrency(boe.totalAssessmentValue)}</TableCell>
 <TableCell className="text-right font-mono">{formatCurrency(boe.dutyPaid)}</TableCell>
                    </TableRow>
                </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}