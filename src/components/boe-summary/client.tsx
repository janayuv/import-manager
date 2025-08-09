// src/app/dashboard/boe-summary/client.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SavedBoe, Shipment, CalculatedDutyItem } from "@/types/boe-entry";
import type { BoeDetails } from "@/types/boe";
import { StatusBadge } from "./columns";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as XLSX from "xlsx";
import { computeLandedCostPerUnit, computePerUnitDuty, computeDutyFromRates, computeSavingsFromActualVsBoe } from "@/lib/financial";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
};

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (val: string | number) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type SummaryRow = { label: string; calculated: number; boe: number | null; variance: number | null };

function exportXlsx(params: { itemsRows?: Array<Record<string, string | number>>; summary: SummaryRow[] }) {
  const { itemsRows = [], summary } = params;
  const summaryRows = summary.map((r) => ({
    Metric: r.label,
    Calculated: r.calculated,
    BOE: r.boe ?? "",
    Variance: r.variance ?? "",
  }));
  const wb = XLSX.utils.book_new();
  if (itemsRows.length) {
    const ws1 = XLSX.utils.json_to_sheet(itemsRows);
    XLSX.utils.book_append_sheet(wb, ws1, "Items");
  }
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");
  XLSX.writeFile(wb, "boe-report.xlsx");
}

function printReport(params: {
  itemsRows: Array<Record<string, string | number>>;
  summary: SummaryRow[];
  title: string;
}) {
  const { itemsRows, summary, title } = params;
  const itemRowsHtml = itemsRows
    .map((r) => `
      <tr>
        <td>${r["Part No"]}</td>
        <td>${r["Description"]}</td>
        <td class="num">${r["Assessable Value"]}</td>
        <td class="num">${r["BCD"]}</td>
        <td class="num">${r["SWS"]}</td>
        <td class="num">${r["IGST"]}</td>
        <td class="num">${r["Total Duty"]}</td>
        <td class="num">${r["Qty"] ?? "-"}</td>
        <td class="num">${r["Per-Unit Duty"] ?? "-"}</td>
        <td class="num">${r["Landed Cost / Unit"] ?? "-"}</td>
        <td class="num">${r["Actual Duty"] ?? "-"}</td>
        <td class="num">${r["Savings"] ?? "-"}</td>
      </tr>`)
    .join("");
  const summaryRowsHtml = summary
    .map(
      (r: { label: string; calculated: number; boe: number | null; variance: number | null }) => `
      <tr>
        <td>${r.label}</td>
        <td class="num">${r.calculated.toFixed(2)}</td>
        <td class="num">${r.boe != null ? r.boe.toFixed(2) : "-"}</td>
        <td class="num">${r.variance != null ? r.variance.toFixed(2) : "-"}</td>
      </tr>`
    )
    .join("");
  const html = `<!doctype html>
  <html><head>
    <meta charset="utf-8"/>
    <title>${title}</title>
    <style>
      body { font: 12px system-ui, -apple-system, Segoe UI, Roboto, Arial; color: #111; margin: 24px; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; }
      th { background: #f5f5f5; text-align: left; }
      td.num, th.num { text-align: right; font-feature-settings: "tnum"; font-variant-numeric: tabular-nums; }
      @media print { button { display: none; } }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <h2>Item Details</h2>
    <table>
      <thead>
        <tr>
          <th>Part No</th><th>Description</th><th class="num">Assessable</th><th class="num">BCD</th><th class="num">SWS</th><th class="num">IGST</th><th class="num">Total Duty</th><th class="num">Qty</th><th class="num">Per-Unit Duty</th><th class="num">Landed Cost / Unit</th><th class="num">Actual Duty</th><th class="num">Savings</th>
        </tr>
      </thead>
      <tbody>${itemRowsHtml}</tbody>
    </table>
    <h2>BOE Summary & Variance</h2>
    <table>
      <thead>
        <tr>
          <th>Metric</th><th class="num">Calculated</th><th class="num">BOE</th><th class="num">Variance (Calc - BOE)</th>
        </tr>
      </thead>
      <tbody>${summaryRowsHtml}</tbody>
    </table>
    <script>window.onload = () => window.print();</script>
  </body></html>`;
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function ItemDetailsTable({ items, quantities, actualRatesByPart, methodByPart }: { items: CalculatedDutyItem[]; quantities?: Record<string, number>; actualRatesByPart?: Record<string, { bcdRate: number; swsRate: number; igstRate: number }>; methodByPart?: Record<string, "Standard" | "CEPA" | "Rodtep"> }) {
  const rows = items.map((it) => {
    const qty = quantities?.[it.partNo] ?? 0;
    const perUnitDuty = computePerUnitDuty(it.bcdValue + it.swsValue + it.igstValue, qty);
    const landedCostPerUnit = computeLandedCostPerUnit(it.assessableValue, it.bcdValue + it.swsValue + it.igstValue, qty);
    const boeDuty = { bcd: it.bcdValue, sws: it.swsValue, igst: it.igstValue, total: it.bcdValue + it.swsValue + it.igstValue };
    const ratesForItem = actualRatesByPart?.[it.partNo];
    const methodForItem = methodByPart?.[it.partNo] ?? "Standard";
    const actual = ratesForItem ? computeDutyFromRates(it.assessableValue, ratesForItem) : null;
    const savings = actual && methodForItem !== "Standard" ? computeSavingsFromActualVsBoe({ method: methodForItem, assessableValue: it.assessableValue, actualRates: ratesForItem!, boe: boeDuty }) : 0;
    return {
    partNo: it.partNo,
    description: it.description,
    assessableValue: it.assessableValue,
    bcdValue: it.bcdValue,
    swsValue: it.swsValue,
    igstValue: it.igstValue,
      totalDuty: Math.round((it.bcdValue + it.swsValue + it.igstValue) * 100) / 100,
      qty,
      perUnitDuty,
      landedCostPerUnit,
      actualDuty: actual?.total ?? null,
      dutySavings: savings,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.assessableValue += r.assessableValue;
      acc.bcdValue += r.bcdValue;
      acc.swsValue += r.swsValue;
      acc.igstValue += r.igstValue;
      acc.totalDuty += r.totalDuty;
      return acc;
    },
    { assessableValue: 0, bcdValue: 0, swsValue: 0, igstValue: 0, totalDuty: 0 }
  );

  const exportRows = rows.map((r) => ({
    "Part No": r.partNo,
    "Description": r.description,
    "Assessable Value": r.assessableValue,
    "BCD": r.bcdValue,
    "SWS": r.swsValue,
    "IGST": r.igstValue,
    "Total Duty": r.totalDuty,
    "Qty": r.qty,
    "Per-Unit Duty": r.qty ? r.perUnitDuty : "",
    "Landed Cost / Unit": r.qty ? r.landedCostPerUnit : "",
    "Actual Duty": r.actualDuty ?? "",
    "Savings": r.dutySavings,
  }));

  const handleExport = () => {
    downloadCsv("boe-item-details.csv", exportRows);
  };

  const handleExportXlsx = () =>
    exportXlsx({ itemsRows: exportRows, summary: [] });

  const handlePrint = () =>
    printReport({ itemsRows: exportRows, summary: [], title: "BOE Item Details" });

  return (
    <Card className="mt-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Item Details</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>CSV</Button>
          <Button size="sm" variant="outline" onClick={handleExportXlsx}>Excel</Button>
          <Button size="sm" variant="outline" onClick={handlePrint}>Print</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Part No</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Assessable</TableHead>
                <TableHead className="text-right">BCD</TableHead>
                <TableHead className="text-right">SWS</TableHead>
                <TableHead className="text-right">IGST</TableHead>
                <TableHead className="text-right">Total Duty</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Per-Unit Duty</TableHead>
                <TableHead className="text-right">Landed Cost / Unit</TableHead>
                <TableHead className="text-right">Actual Duty</TableHead>
                <TableHead className="text-right">Savings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.partNo}>
                  <TableCell className="font-medium">{r.partNo}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.assessableValue)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.bcdValue)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.swsValue)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.igstValue)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.totalDuty)}</TableCell>
                  <TableCell className="text-right font-mono">{r.qty || '-'}</TableCell>
                  <TableCell className="text-right font-mono">{r.qty ? formatCurrency(r.perUnitDuty) : '-'}</TableCell>
                  <TableCell className="text-right font-mono">{r.qty ? formatCurrency(r.landedCostPerUnit) : '-'}</TableCell>
                  <TableCell className="text-right font-mono">{r.actualDuty != null ? formatCurrency(r.actualDuty) : '-'}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.dutySavings)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30">
                <TableCell colSpan={2} className="text-right font-semibold">Totals</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatCurrency(totals.assessableValue)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatCurrency(totals.bcdValue)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatCurrency(totals.swsValue)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatCurrency(totals.igstValue)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatCurrency(totals.totalDuty)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function BoeSummaryTable({
  assessableTotal,
  bcdTotal,
  swsTotal,
  igstTotal,
  interest,
  calcDutyTotal,
  boeAssessable,
  boeDutyPaid,
}: {
  assessableTotal: number;
  bcdTotal: number;
  swsTotal: number;
  igstTotal: number;
  interest: number;
  calcDutyTotal: number;
  boeAssessable?: number;
  boeDutyPaid?: number;
}) {
  const summaryRows = [
    {
      label: "Assessable Total",
      calculated: assessableTotal,
      boe: boeAssessable ?? null,
      variance: boeAssessable != null ? assessableTotal - boeAssessable : null,
    },
    { label: "BCD Total", calculated: bcdTotal, boe: null, variance: null },
    { label: "SWS Total", calculated: swsTotal, boe: null, variance: null },
    { label: "IGST Total", calculated: igstTotal, boe: null, variance: null },
    { label: "Interest", calculated: interest, boe: null, variance: null },
    {
      label: "Duty Total",
      calculated: calcDutyTotal,
      boe: boeDutyPaid ?? null,
      variance: boeDutyPaid != null ? calcDutyTotal - boeDutyPaid : null,
    },
  ];

  const handleExport = () => {
    downloadCsv(
      "boe-summary.csv",
      summaryRows.map((r) => ({
        Metric: r.label,
        Calculated: r.calculated,
        BOE: r.boe ?? "",
        Variance: r.variance ?? "",
      }))
    );
  };

  const handleExportXlsx = () => exportXlsx({ itemsRows: [], summary: summaryRows });

  const handlePrint = () => printReport({ itemsRows: [], summary: summaryRows, title: "BOE Summary" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>BOE Summary & Variance</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>CSV</Button>
          <Button size="sm" variant="outline" onClick={handleExportXlsx}>Excel</Button>
          <Button size="sm" variant="outline" onClick={handlePrint}>Print</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Calculated</TableHead>
                <TableHead className="text-right">BOE</TableHead>
                <TableHead className="text-right">Variance (Calc - BOE)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.calculated)}</TableCell>
                  <TableCell className="text-right font-mono">{r.boe != null ? formatCurrency(r.boe) : "-"}</TableCell>
                  <TableCell className="text-right font-mono">{r.variance != null ? formatCurrency(r.variance) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface BoeSummaryClientProps {
  savedBoes: SavedBoe[];
  shipments: Shipment[];
  allBoes: BoeDetails[];
}

export function BoeSummaryClient({ savedBoes, shipments, allBoes }: BoeSummaryClientProps) {
  const [selectedSupplier, setSelectedSupplier] = React.useState<string>("");
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("All");
  const [pendingStatus, setPendingStatus] = React.useState<string>("");
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState<boolean>(false);

  const suppliers = React.useMemo(() => {
    const supplierSet = new Set(savedBoes.map((boe) => boe.supplierName));
    return Array.from(supplierSet);
  }, [savedBoes]);

  const availableInvoices = React.useMemo(() => {
    if (!selectedSupplier) return [];
    return savedBoes.filter((boe) => boe.supplierName === selectedSupplier && (statusFilter === "All" || boe.status === statusFilter));
  }, [selectedSupplier, savedBoes, statusFilter]);

  const selectedData = React.useMemo(() => {
    if (!selectedInvoiceId) return null;
    const savedBoe = savedBoes.find((b) => b.id === selectedInvoiceId);
    if (!savedBoe) return null;
    // NOTE: shipments passed earlier might exclude some; fetch fresh for summary
    const shipment = shipments.find((s) => s.id === savedBoe.shipmentId) || null;
    const boeDetails = savedBoe.boeId ? allBoes.find((b) => b.id === savedBoe.boeId) || null : null;

    const assessableTotal = savedBoe.calculationResult.calculatedItems.reduce(
      (sum, it) => sum + it.assessableValue,
      0
    );
    const { bcdTotal, swsTotal, igstTotal, interest, customsDutyTotal } = savedBoe.calculationResult;

    return {
      savedBoe,
      shipment,
      boeDetails,
      assessableTotal,
      bcdTotal,
      swsTotal,
      igstTotal,
      interest,
      customsDutyTotal,
    };
  }, [selectedInvoiceId, savedBoes, shipments, allBoes]);

  React.useEffect(() => {
    // Keep local pending status in sync when selection changes
    if (selectedData?.savedBoe?.status) {
      setPendingStatus(selectedData.savedBoe.status);
    } else {
      setPendingStatus("");
    }
  }, [selectedData?.savedBoe?.id, selectedData?.savedBoe?.status]);

  const handleSupplierChange = (supplier: string) => {
      setSelectedSupplier(supplier);
    setSelectedInvoiceId("");
  };

  return (
    <Card>
        <CardHeader>
            <div className="flex flex-col md:flex-row gap-4">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="supplier-select">Supplier</Label>
                    <Select onValueChange={handleSupplierChange} value={selectedSupplier}>
                        <SelectTrigger id="supplier-select">
                            <SelectValue placeholder="Select a supplier" />
                        </SelectTrigger>
                        <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
                        </SelectContent>
                    </Select>
                </div>
                 <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="invoice-select">Invoice</Label>
            <Select onValueChange={setSelectedInvoiceId} value={selectedInvoiceId} disabled={!selectedSupplier}>
                        <SelectTrigger id="invoice-select">
                            <SelectValue placeholder="Select an invoice" />
                        </SelectTrigger>
                        <SelectContent>
                {availableInvoices.map((inv) => (
                                <SelectItem key={inv.id} value={inv.id}>
                                    {inv.invoiceNumber}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="status-filter">Status</Label>
                    <Select onValueChange={setStatusFilter} value={statusFilter}>
                        <SelectTrigger id="status-filter">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            {['All','Awaiting BOE Data','Discrepancy Found','Reconciled','Investigation','Closed'].map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </CardHeader>
        <CardContent className="mt-6 space-y-8">
            {selectedData ? (
                <>
            <ItemDetailsTable 
              items={selectedData.savedBoe.calculationResult.calculatedItems}
              quantities={Object.fromEntries((selectedData.shipment?.items ?? []).map((it: { partNo: string; qty?: number }) => [it.partNo, it.qty ?? 0]))}
              actualRatesByPart={Object.fromEntries((selectedData.shipment?.items ?? []).map(it => [it.partNo, { bcdRate: it.actualBcdRate, swsRate: it.actualSwsRate, igstRate: it.actualIgstRate }]))}
              methodByPart={Object.fromEntries((selectedData.savedBoe.itemInputs ?? []).map(ii => [ii.partNo, ii.calculationMethod]))}
            />
            <BoeSummaryTable
              assessableTotal={selectedData.assessableTotal}
              bcdTotal={selectedData.bcdTotal}
              swsTotal={selectedData.swsTotal}
              igstTotal={selectedData.igstTotal}
              interest={selectedData.interest}
              calcDutyTotal={selectedData.customsDutyTotal}
              boeAssessable={selectedData.boeDetails?.totalAssessmentValue}
              boeDutyPaid={selectedData.boeDetails?.dutyPaid}
            />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Status <StatusBadge status={selectedData.savedBoe.status} /></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                  <div className="grid w-full max-w-xs items-center gap-1.5">
                    <Label htmlFor="status-change">Change Status</Label>
                    <Select value={pendingStatus || selectedData.savedBoe.status} onValueChange={setPendingStatus}>
                      <SelectTrigger id="status-change">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Awaiting BOE Data','Discrepancy Found','Reconciled','Investigation','Closed'].map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={isUpdatingStatus || !pendingStatus || pendingStatus === selectedData.savedBoe.status}
                    onClick={async () => {
                      const idx = savedBoes.findIndex(b => b.id === selectedData.savedBoe!.id);
                      if (idx < 0) return;
                      const old = savedBoes[idx];
                      const next = { ...old, status: pendingStatus as SavedBoe["status"] } as SavedBoe;
                      savedBoes[idx] = next;
                      setIsUpdatingStatus(true);
                      const toastId = toast.loading('Updating status...');
                      try {
                        await invoke('update_boe_status', { id: next.id, status: pendingStatus });
                        toast.success('Status updated', { id: toastId });
                      } catch {
                        savedBoes[idx] = old; // revert
                        toast.error('Failed to update status', { id: toastId });
                      } finally {
                        setIsUpdatingStatus(false);
                      }
                    }}
                  >
                    {isUpdatingStatus ? 'Updating...' : 'Update Status'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Attached Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedData.savedBoe.attachments?.length ? (
                    <ul className="space-y-2">
                      {selectedData.savedBoe.attachments.map(att => (
                        <li key={att.id} className="flex items-center justify-between border rounded-md p-2">
                          <div>
                            <a className="text-blue-600 hover:underline" href={convertFileSrc(att.url)} target="_blank" rel="noreferrer">{att.fileName}</a>
                            <div className="text-sm text-muted-foreground">{att.documentType} • {new Date(att.uploadedAt).toLocaleString()}</div>
                          </div>
                          <Button size="sm" variant="outline" asChild>
                            <a href={convertFileSrc(att.url)} download={att.fileName}>Download</a>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-muted-foreground">No documents attached.</div>
                  )}
                  <Button
                    onClick={async () => {
                      console.log("📄 Starting BOE document upload process...");
                      console.log("📋 Selected BOE ID:", selectedData.savedBoe.id);
                      
                      const picked = await openDialog({
                        multiple: false,
                        directory: false,
                        filters: [
                          { name: "Documents", extensions: ["pdf", "png", "jpg", "jpeg", "xlsx", "xls", "csv", "doc", "docx"] },
                        ],
                      });
                      console.log("📁 Picked file result:", picked);
                      
                      if (!picked || Array.isArray(picked)) {
                        console.log("❌ No file selected or multiple files selected");
                        return;
                      }

                      const srcPath = picked as string;
                      console.log("📤 Source file path:", srcPath);
                      
                      const toastId = toast.loading("Saving document...");
                      try {
                        console.log("🔄 Invoking backend command to save BOE attachment...");
                        console.log("📤 Sending parameters:", { id: selectedData.savedBoe.id, srcPath: srcPath });
                        
                        const destPath = await invoke<string>('save_boe_attachment_file', { id: selectedData.savedBoe.id, srcPath: srcPath });
                        console.log("✅ Document saved successfully at:", destPath);
                        
                        const idx = savedBoes.findIndex(b => b.id === selectedData.savedBoe.id);
                        console.log("🔍 Found BOE at index:", idx);
                        
                        if (idx >= 0) {
                          const current = savedBoes[idx];
                          const fileName = srcPath.split(/\\|\//).pop() || `file-${Date.now()}`;
                          console.log("📝 Extracted filename:", fileName);
                          
                          const att = {
                            id: `ATT-${Date.now()}`,
                            documentType: 'Attachment',
                            fileName,
                            url: destPath,
                            uploadedAt: new Date().toISOString(),
                          };
                          console.log("📎 Created attachment object:", att);
                          
                          const next = {
                            ...current,
                            attachments: [ ...(current.attachments ?? []), att ],
                          } as SavedBoe;
                          savedBoes[idx] = next;
                          
                          console.log("💾 Saving attachment to database...");
                          await invoke('add_boe_attachment', { id: next.id, attachment: att });
                          console.log("✅ Attachment saved to database successfully");
                          
                          toast.success("Document saved", { id: toastId, description: destPath });
                        } else {
                          console.error("❌ Failed to locate BOE in savedBoes array");
                          toast.error("Failed to locate BOE to attach", { id: toastId });
                        }
                      } catch (error) {
                        console.error("💥 Failed to save BOE document:", error);
                        console.error("Error details:", {
                          message: error instanceof Error ? error.message : String(error),
                          stack: error instanceof Error ? error.stack : undefined
                        });
                        toast.error("Failed to save document", { id: toastId });
                      }
                    }}
                  >
                    Upload Document
                  </Button>
                </div>
              </CardContent>
            </Card>
                </>
            ) : (
                <div className="text-center text-muted-foreground py-12">
                    <p>Please select a supplier and invoice to view the report.</p>
                </div>
            )}
        </CardContent>
    </Card>
  );
}
