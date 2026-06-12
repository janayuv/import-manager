import * as ExcelJS from 'exceljs';

import { formatDateDDMMMYYYY } from '@/lib/date-format';
import type { SavedBoe } from '@/types/boe-entry';

const AMBER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFC000' },
};

function buildFilename(invoiceNumber: string): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `BOE-CALC-${invoiceNumber}-${yyyy}-${mm}-${dd}.xlsx`;
}

function autoWidthColumns(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach(col => {
    if (!col.values) return;
    const maxLen = Math.max(
      ...col.values.map((v: unknown) => (v != null ? String(v).length : 0))
    );
    col.width = Math.min(maxLen + 4, 60);
  });
}

export async function exportSavedBoeToExcel(savedBoe: SavedBoe): Promise<void> {
  const { formValues, calculationResult, itemInputs } = savedBoe;
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet('Summary');

  summarySheet.mergeCells('A1:B1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = 'BOE DUTY CALCULATION';
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  summarySheet.addRow([]);

  summarySheet.addRow(['Invoice No', savedBoe.invoiceNumber]);
  summarySheet.addRow(['Supplier', savedBoe.supplierName]);
  summarySheet.addRow(['Shipment ID', savedBoe.shipmentId]);
  summarySheet.addRow(['Linked BE No', savedBoe.boeId ?? '—']);
  summarySheet.addRow(['Status', savedBoe.status]);
  summarySheet.addRow(['Created', formatDateDDMMMYYYY(savedBoe.createdAt)]);

  summarySheet.addRow([]);

  summarySheet.addRow(['Exchange Rate', `1 USD = ₹${formValues.exchangeRate}`]);
  summarySheet.addRow(['Freight Cost (INR)', formValues.freightCost]);
  summarySheet.addRow(['EXW Cost (INR)', formValues.exwCost]);
  summarySheet.addRow(['Insurance Rate', `${formValues.insuranceRate}%`]);
  summarySheet.addRow(['Interest (INR)', formValues.interest ?? 0]);

  summarySheet.addRow([]);

  const dutyLabelRows: [string, number][] = [
    ['BCD Total', calculationResult.bcdTotal],
    ['SWS Total', calculationResult.swsTotal],
    ['IGST Total', calculationResult.igstTotal],
    ['Interest', calculationResult.interest],
    ['TOTAL CUSTOMS DUTY', calculationResult.customsDutyTotal],
  ];

  dutyLabelRows.forEach(([label, value], idx) => {
    const row = summarySheet.addRow([label, value]);
    const labelCell = row.getCell(1);
    const valueCell = row.getCell(2);
    labelCell.fill = AMBER_FILL;
    valueCell.numFmt = '#,##0.00';
    if (idx === dutyLabelRows.length - 1) {
      row.font = { bold: true };
    }
  });

  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 22;

  const itemSheet = workbook.addWorksheet('Item Duties');

  const itemHeaders = [
    'S.No',
    'Part No',
    'Description',
    'Calc Method',
    'BCD Rate %',
    'BCD Amount (₹)',
    'SWS Rate %',
    'SWS Amount (₹)',
    'IGST Rate %',
    'IGST Amount (₹)',
    'Assessable Value (₹)',
    'Total Duty (₹)',
  ];

  const itemHeaderRow = itemSheet.addRow(itemHeaders);
  itemHeaderRow.font = { bold: true };
  itemHeaderRow.eachCell(cell => {
    cell.fill = AMBER_FILL;
  });

  const amountColIndices = [6, 8, 10, 11, 12];

  calculationResult.calculatedItems.forEach((item, idx) => {
    const input = itemInputs.find(i => i.partNo === item.partNo);
    const totalDuty = item.bcdValue + item.swsValue + item.igstValue;

    const row = itemSheet.addRow([
      idx + 1,
      item.partNo,
      item.description,
      input?.calculationMethod ?? 'Standard',
      input?.boeBcdRate ?? 0,
      item.bcdValue,
      input?.boeSwsRate ?? 0,
      item.swsValue,
      input?.boeIgstRate ?? 0,
      item.igstValue,
      item.assessableValue,
      totalDuty,
    ]);

    amountColIndices.forEach(colIdx => {
      row.getCell(colIdx).numFmt = '#,##0.00';
    });
  });

  autoWidthColumns(itemSheet);

  const inputSheet = workbook.addWorksheet('Input Parameters');

  const inputHeaderRow = inputSheet.addRow(['Parameter', 'Value']);
  inputHeaderRow.font = { bold: true };

  const inputRows: [string, string | number][] = [
    ['Supplier Name', formValues.supplierName],
    ['Shipment ID', formValues.shipmentId],
    ['Exchange Rate (INR/USD)', formValues.exchangeRate],
    ['Freight Cost (INR)', formValues.freightCost],
    ['EXW Cost (INR)', formValues.exwCost],
    ['Insurance Rate (%)', formValues.insuranceRate],
    ['Interest (INR)', formValues.interest ?? 0],
    ['Calculation Date', savedBoe.createdAt],
  ];

  inputRows.forEach(([param, val]) => {
    inputSheet.addRow([param, val]);
  });

  inputSheet.getColumn(1).width = 30;
  inputSheet.getColumn(2).width = 25;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', buildFilename(savedBoe.invoiceNumber));
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
