/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/
'use client';
import React from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SavedBoe } from '@/types/boe-entry';

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

/*
================================================================================
| FILE: src/app/dashboard/boe-entry/components/saved-boe-list.tsx (MODIFIED)   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Connected the "View" button's `onClick` handler to a new `onView` prop,      |
| which will be used to trigger the view dialog from the parent page.          |
================================================================================
*/

interface SavedBoeListProps {
  savedBoes: SavedBoe[];
  onView: (boeId: string) => void;
  onEdit: (boeId: string) => void;
  onDelete: (boeId: string) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};

export function SavedBoeList({
  savedBoes,
  onView,
  onEdit,
  onDelete,
}: SavedBoeListProps) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(320);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rowHeight = 56;
  const overscan = 6;

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setViewportHeight(node.clientHeight || 320);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const shouldVirtualize = savedBoes.length > 20;
  const start = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    : 0;
  const count = shouldVirtualize
    ? Math.ceil(viewportHeight / rowHeight) + overscan * 2
    : savedBoes.length;
  const end = shouldVirtualize
    ? Math.min(savedBoes.length, start + count)
    : savedBoes.length;
  const visibleBoes = savedBoes.slice(start, end);
  const topSpacer = shouldVirtualize ? start * rowHeight : 0;
  const bottomSpacer = shouldVirtualize
    ? Math.max(0, (savedBoes.length - end) * rowHeight)
    : 0;

  if (savedBoes.length === 0) {
    return null; // Don't render anything if there are no saved BOEs
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved BOE Calculations</CardTitle>
        <CardDescription>
          Here is a list of all the BOE calculations you have saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="max-h-[420px] overflow-auto rounded-md border"
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        >
          <Table>
            <TableHeader className="bg-primary text-primary-foreground">
              <TableRow>
                <TableHead className="text-primary-foreground">
                  Invoice Number
                </TableHead>
                <TableHead className="text-primary-foreground">
                  Supplier
                </TableHead>
                <TableHead className="text-primary-foreground text-right">
                  Total Duty
                </TableHead>
                <TableHead className="text-primary-foreground text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topSpacer > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    style={{
                      height: `${topSpacer}px`,
                      padding: 0,
                      border: 'none',
                    }}
                  />
                </TableRow>
              )}
              {visibleBoes.map(boe => (
                <TableRow key={boe.id}>
                  <TableCell className="font-medium">
                    {boe.invoiceNumber}
                  </TableCell>
                  <TableCell>{boe.supplierName}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(boe.calculationResult.customsDutyTotal)}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      variant="default"
                      size="sm"
                      useAccentColor
                      onClick={() => onView(boe.id)}
                    >
                      View
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      useAccentColor
                      onClick={() => onEdit(boe.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onDelete(boe.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {bottomSpacer > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    style={{
                      height: `${bottomSpacer}px`,
                      padding: 0,
                      border: 'none',
                    }}
                  />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
