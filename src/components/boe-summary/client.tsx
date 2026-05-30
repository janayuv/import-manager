'use client';

import { convertFileSrc } from '@tauri-apps/api/core';
import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { open as openDialog } from '@/lib/tauri-bridge';
import * as ExcelJS from 'exceljs';
import { toast } from 'sonner';

import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  computeDutyFromRates,
  computeLandedCostPerUnit,
  computePerUnitDuty,
  computeSavingsFromActualVsBoe,
} from '@/lib/financial';
import {
  formatCurrency as formatCurrencyWithSettings,
  loadSettings,
} from '@/lib/settings';
import type { BoeDetails } from '@/types/boe';
import type { CalculatedDutyItem, SavedBoe, Shipment } from '@/types/boe-entry';

import { StatusBadge } from './status-badge';

/* ── Design tokens ─────────────────────────────────────────────── */
const IM = {
  panel: '#101010',
  alt: '#0C0C0B',
  header: '#0D0D0B',
  text: '#EFEDE8',
  muted: '#8C8A82',
  faint: '#56544E',
  rule: '#1F1E1A',
  hover: '#161513',
  accent: '#E8A23A',
  accentBg: 'rgba(232,162,58,0.10)',
  accentBdr: 'rgba(232,162,58,0.25)',
  good: '#5FCB7D',
  goodBg: 'rgba(95,203,125,0.10)',
  goodBdr: 'rgba(95,203,125,0.22)',
  bad: '#F87171',
  badBg: 'rgba(248,113,113,0.09)',
  badBdr: 'rgba(248,113,113,0.20)',
  mono: "Consolas, 'Courier New', monospace",
} as const;

const panelStyle: React.CSSProperties = {
  border: `1px solid ${IM.rule}`,
  background: IM.panel,
  display: 'flex',
  flexDirection: 'column',
};

const panelHeaderStyle: React.CSSProperties = {
  background: IM.header,
  borderBottom: `1px solid ${IM.rule}`,
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap' as const,
};

const panelTitleStyle: React.CSSProperties = {
  fontFamily: IM.mono,
  fontSize: 11,
  fontWeight: 700,
  color: IM.text,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontFamily: IM.mono,
  fontSize: 10.5,
  fontWeight: 700,
  color: IM.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: `1px solid ${IM.rule}`,
  whiteSpace: 'nowrap' as const,
};

const thRightStyle: React.CSSProperties = { ...thStyle, textAlign: 'right' };

const tdStyle: React.CSSProperties = {
  padding: '0 12px',
  height: 36,
  fontSize: 12,
  color: IM.text,
  fontFamily: IM.mono,
  borderBottom: `1px solid ${IM.rule}`,
  whiteSpace: 'nowrap' as const,
};

const tdRightStyle: React.CSSProperties = { ...tdStyle, textAlign: 'right' };

const fieldLabelStyle: React.CSSProperties = {
  fontFamily: IM.mono,
  fontSize: 10,
  color: IM.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  display: 'block',
  marginBottom: 4,
};

/* ── Helpers (logic unchanged) ─────────────────────────────────── */
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatCurrencyNoDecimals = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '-';
  return formatCurrencyWithSettings(amount);
};

const getOrderedFields = () => {
  const settings = loadSettings();
  const boeSummaryFields = settings.modules.boeSummary.fields;
  return Object.entries(boeSummaryFields)
    .filter(([, config]) => config.visible)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([fieldName]) => fieldName);
};

const getFieldDisplayName = (fieldName: string) => {
  const fieldMap: Record<string, string> = {
    partNo: 'Part No',
    description: 'Description',
    assessableValue: 'Assessable',
    bcd: 'BCD',
    sws: 'SWS',
    igst: 'IGST',
    totalDuty: 'Total Duty',
    qty: 'Qty',
    perUnitDuty: 'Per-Unit Duty',
    landedCostPerUnit: 'Landed Cost / Unit',
    actualDuty: 'Actual Duty',
    savings: 'Savings',
  };
  return fieldMap[fieldName] || fieldName;
};

/* renderCellValue — logic unchanged, now returns <td> instead of <TableCell> */
const renderCellValue = (
  fieldName: string,
  row: {
    partNo: string;
    description: string;
    assessableValue: number;
    bcdValue: number;
    swsValue: number;
    igstValue: number;
    totalDuty: number;
    qty: number;
    perUnitDuty: number;
    landedCostPerUnit: number;
    actualDuty: number | null;
    dutySavings: number;
  }
) => {
  switch (fieldName) {
    case 'partNo':
      return <td style={{ ...tdStyle, fontWeight: 700 }}>{row.partNo}</td>;
    case 'description':
      return <td style={tdStyle}>{row.description}</td>;
    case 'assessableValue':
      return (
        <td style={tdRightStyle}>
          {formatCurrencyNoDecimals(row.assessableValue)}
        </td>
      );
    case 'bcd':
      return (
        <td style={tdRightStyle}>{formatCurrencyNoDecimals(row.bcdValue)}</td>
      );
    case 'sws':
      return (
        <td style={tdRightStyle}>{formatCurrencyNoDecimals(row.swsValue)}</td>
      );
    case 'igst':
      return (
        <td style={tdRightStyle}>{formatCurrencyNoDecimals(row.igstValue)}</td>
      );
    case 'totalDuty':
      return (
        <td style={tdRightStyle}>{formatCurrencyNoDecimals(row.totalDuty)}</td>
      );
    case 'qty':
      return <td style={tdRightStyle}>{row.qty || '-'}</td>;
    case 'perUnitDuty':
      return (
        <td style={tdRightStyle}>
          {row.qty ? formatCurrency(row.perUnitDuty) : '-'}
        </td>
      );
    case 'landedCostPerUnit':
      return (
        <td style={tdRightStyle}>
          {row.qty ? formatCurrency(row.landedCostPerUnit) : '-'}
        </td>
      );
    case 'actualDuty':
      return (
        <td style={tdRightStyle}>
          {row.actualDuty != null
            ? formatCurrencyNoDecimals(row.actualDuty)
            : '-'}
        </td>
      );
    case 'savings':
      return (
        <td style={tdRightStyle}>
          {formatCurrencyNoDecimals(row.dutySavings)}
        </td>
      );
    default:
      return <td style={tdStyle}>-</td>;
  }
};

/* renderTotalsCellValue — logic unchanged, now returns <td> */
const renderTotalsCellValue = (
  fieldName: string,
  totals: {
    assessableValue: number;
    bcdValue: number;
    swsValue: number;
    igstValue: number;
    totalDuty: number;
    dutySavings: number;
    actualDuty: number;
  },
  orderedFields: string[]
) => {
  const fieldIndex = orderedFields.indexOf(fieldName);

  if (fieldIndex === 0) {
    return (
      <td
        colSpan={2}
        style={{
          ...tdStyle,
          textAlign: 'right',
          fontWeight: 700,
          color: IM.accent,
          background: IM.accentBg,
        }}
      >
        Totals
      </td>
    );
  }

  if (fieldIndex === 1) {
    return null;
  }

  const totalTdStyle: React.CSSProperties = {
    ...tdRightStyle,
    fontWeight: 700,
    color: IM.accent,
    background: IM.accentBg,
  };

  switch (fieldName) {
    case 'assessableValue':
      return (
        <td style={totalTdStyle}>
          {formatCurrencyNoDecimals(totals.assessableValue)}
        </td>
      );
    case 'bcd':
      return (
        <td style={totalTdStyle}>
          {formatCurrencyNoDecimals(totals.bcdValue)}
        </td>
      );
    case 'sws':
      return (
        <td style={totalTdStyle}>
          {formatCurrencyNoDecimals(totals.swsValue)}
        </td>
      );
    case 'igst':
      return (
        <td style={totalTdStyle}>
          {formatCurrencyNoDecimals(totals.igstValue)}
        </td>
      );
    case 'totalDuty':
      return (
        <td style={totalTdStyle}>
          {formatCurrencyNoDecimals(totals.totalDuty)}
        </td>
      );
    case 'qty':
      return <td style={totalTdStyle}>-</td>;
    case 'perUnitDuty':
      return <td style={totalTdStyle}>-</td>;
    case 'landedCostPerUnit':
      return <td style={totalTdStyle}>-</td>;
    case 'actualDuty':
      return (
        <td style={totalTdStyle}>
          {formatCurrencyNoDecimals(totals.actualDuty)}
        </td>
      );
    case 'savings':
      return (
        <td style={totalTdStyle}>
          {formatCurrencyNoDecimals(totals.dutySavings)}
        </td>
      );
    default:
      return <td style={totalTdStyle}>-</td>;
  }
};

/* ── Download / export helpers (logic unchanged) ─────────────── */
function downloadCsv(
  filename: string,
  rows: Array<Record<string, string | number>>
) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('\n') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type SummaryRow = {
  label: string;
  calculated: number;
  boe: number | null;
  variance: number | null;
};

async function exportXlsx(params: {
  itemsRows?: Array<Record<string, string | number>>;
  summary: SummaryRow[];
}) {
  const { itemsRows = [], summary } = params;
  const summaryRows = summary.map(r => ({
    Metric: r.label,
    Calculated: r.calculated,
    BOE: r.boe ?? '',
    Variance: r.variance ?? '',
  }));

  const workbook = new ExcelJS.Workbook();

  if (itemsRows.length) {
    const itemsSheet = workbook.addWorksheet('Items');
    const headers = Object.keys(itemsRows[0]);
    itemsSheet.addRow(headers);
    itemsRows.forEach(row => {
      itemsSheet.addRow(headers.map(header => row[header]));
    });
  }

  const summarySheet = workbook.addWorksheet('Summary');
  const summaryHeaders = ['Metric', 'Calculated', 'BOE', 'Variance'];
  summarySheet.addRow(summaryHeaders);
  summaryRows.forEach(row => {
    summarySheet.addRow([row.Metric, row.Calculated, row.BOE, row.Variance]);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'boe-report.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

function printReport(params: {
  itemsRows: Array<Record<string, string | number>>;
  summary: SummaryRow[];
  title: string;
}) {
  const { itemsRows, summary, title } = params;

  try {
    const orderedFields = getOrderedFields();
    const fieldDisplayNames = orderedFields.map(fieldName =>
      getFieldDisplayName(fieldName)
    );

    const itemRowsHtml = itemsRows
      .map(r => {
        const cells = orderedFields
          .map(fieldName => {
            const displayName = getFieldDisplayName(fieldName);
            const value = r[displayName] ?? '-';
            const isNumeric = [
              'assessableValue',
              'bcd',
              'sws',
              'igst',
              'totalDuty',
              'qty',
              'perUnitDuty',
              'landedCostPerUnit',
              'actualDuty',
              'savings',
            ].includes(fieldName);
            return `<td class="${isNumeric ? 'num' : ''}">${value}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    const summaryRowsHtml = summary
      .map(
        (r: {
          label: string;
          calculated: number;
          boe: number | null;
          variance: number | null;
        }) => `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.calculated.toFixed(2)}</td>
            <td class="num">${r.boe != null ? r.boe.toFixed(2) : '-'}</td>
            <td class="num">${r.variance != null ? r.variance.toFixed(2) : '-'}</td>
          </tr>`
      )
      .join('');

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
            ${fieldDisplayNames
              .map(displayName => {
                const isNumeric = [
                  'Assessable',
                  'BCD',
                  'SWS',
                  'IGST',
                  'Total Duty',
                  'Qty',
                  'Per-Unit Duty',
                  'Landed Cost / Unit',
                  'Actual Duty',
                  'Savings',
                ].includes(displayName);
                return `<th class="${isNumeric ? 'num' : ''}">${displayName}</th>`;
              })
              .join('')}
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

    const printWindow = window.open(
      '',
      '_blank',
      'noopener,noreferrer,width=1024,height=768'
    );

    if (!printWindow) {
      console.error('❌ Failed to open print window - popup blocked?');
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);
        const iframeDoc =
          iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(html);
          iframeDoc.close();
          setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        } else {
          console.error('❌ Failed to access iframe document');
          alert(
            'Print failed: Popup blocked and iframe method unavailable. Please allow popups for this site.'
          );
        }
      } catch (error) {
        console.error('💥 Error in iframe print method:', error);
        alert(
          'Print failed: Popup blocked and alternative method failed. Please allow popups for this site.'
        );
      }
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } catch (error) {
    console.error('💥 Error in printReport function:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/* ── ImBtn — amber industrial button ─────────────────────────── */
function ImBtn({
  onClick,
  children,
  disabled,
  primary = false,
  type = 'button',
}: {
  onClick?: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  type?: 'button' | 'submit';
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      type={type}
      onClick={onClick ? () => void onClick() : undefined}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '5px 14px',
        fontFamily: IM.mono,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'filter 80ms',
        background: primary ? IM.accent : 'transparent',
        border: `1px solid ${primary ? IM.accent : hovered ? IM.faint : IM.rule}`,
        color: primary ? '#100c04' : hovered ? IM.text : IM.muted,
        filter: primary && hovered && !disabled ? 'brightness(1.08)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

/* ── ImRow helper ─────────────────────────────────────────────── */
function ImRow({
  children,
  even,
  totals,
}: {
  children: React.ReactNode;
  even: boolean;
  totals?: boolean;
}) {
  const [hovered, setHovered] = React.useState(false);
  const base = totals ? IM.accentBg : even ? IM.panel : IM.alt;
  return (
    <tr
      style={{
        background: hovered && !totals ? IM.hover : base,
        transition: 'background 80ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </tr>
  );
}

/* ── ItemDetailsTable ─────────────────────────────────────────── */
function ItemDetailsTable({
  items,
  quantities,
  actualRatesByPart,
  methodByPart,
}: {
  items: CalculatedDutyItem[];
  quantities?: Record<string, number>;
  actualRatesByPart?: Record<
    string,
    { bcdRate: number; swsRate: number; igstRate: number }
  >;
  methodByPart?: Record<string, 'Standard' | 'CEPA' | 'Rodtep'>;
}) {
  const rows = items.map(it => {
    const qty = quantities?.[it.partNo] ?? 0;
    const perUnitDuty = computePerUnitDuty(
      it.bcdValue + it.swsValue + it.igstValue,
      qty
    );
    const landedCostPerUnit = computeLandedCostPerUnit(
      it.assessableValue,
      it.bcdValue + it.swsValue + it.igstValue,
      qty
    );
    const boeDuty = {
      bcd: it.bcdValue,
      sws: it.swsValue,
      igst: it.igstValue,
      total: it.bcdValue + it.swsValue + it.igstValue,
    };
    const ratesForItem = actualRatesByPart?.[it.partNo];
    const methodForItem = methodByPart?.[it.partNo] ?? 'Standard';
    const actual = ratesForItem
      ? computeDutyFromRates(it.assessableValue, ratesForItem)
      : null;
    const savings =
      actual && methodForItem !== 'Standard'
        ? computeSavingsFromActualVsBoe({
            method: methodForItem,
            assessableValue: it.assessableValue,
            actualRates: ratesForItem!,
            boe: boeDuty,
          })
        : 0;
    return {
      partNo: it.partNo,
      description: it.description,
      assessableValue: it.assessableValue,
      bcdValue: it.bcdValue,
      swsValue: it.swsValue,
      igstValue: it.igstValue,
      totalDuty:
        Math.round((it.bcdValue + it.swsValue + it.igstValue) * 100) / 100,
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
      acc.dutySavings += r.dutySavings;
      acc.actualDuty += r.actualDuty || 0;
      return acc;
    },
    {
      assessableValue: 0,
      bcdValue: 0,
      swsValue: 0,
      igstValue: 0,
      totalDuty: 0,
      dutySavings: 0,
      actualDuty: 0,
    }
  );

  const exportRows = rows.map(r => ({
    'Part No': r.partNo,
    Description: r.description,
    Assessable: Math.round(r.assessableValue),
    BCD: Math.round(r.bcdValue),
    SWS: Math.round(r.swsValue),
    IGST: Math.round(r.igstValue),
    'Total Duty': Math.round(r.totalDuty),
    Qty: r.qty,
    'Per-Unit Duty': r.qty ? r.perUnitDuty : '',
    'Landed Cost / Unit': r.qty ? r.landedCostPerUnit : '',
    'Actual Duty': r.actualDuty != null ? Math.round(r.actualDuty) : '',
    Savings: Math.round(r.dutySavings),
  }));

  const handleExport = () => downloadCsv('boe-item-details.csv', exportRows);
  const handleExportXlsx = async () =>
    await exportXlsx({ itemsRows: exportRows, summary: [] });
  const handlePrint = () => {
    toast.info(
      'Printing... If nothing happens, please allow popups for this site.',
      { duration: 3000 }
    );
    printReport({
      itemsRows: exportRows,
      summary: [],
      title: 'BOE Item Details',
    });
  };

  const orderedFields = getOrderedFields();

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelTitleStyle}>Item Details</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <ImBtn onClick={handleExport}>CSV</ImBtn>
          <ImBtn onClick={handleExportXlsx}>Excel</ImBtn>
          <ImBtn onClick={handlePrint}>Print</ImBtn>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: IM.header }}>
              {orderedFields.map(fieldName => (
                <th
                  key={fieldName}
                  style={
                    fieldName !== 'partNo' && fieldName !== 'description'
                      ? thRightStyle
                      : thStyle
                  }
                >
                  {getFieldDisplayName(fieldName)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <ImRow key={r.partNo} even={i % 2 === 0}>
                {orderedFields.map(fieldName => (
                  <React.Fragment key={fieldName}>
                    {renderCellValue(fieldName, r)}
                  </React.Fragment>
                ))}
              </ImRow>
            ))}
            <ImRow even={rows.length % 2 === 0} totals>
              {orderedFields.map(fieldName => {
                const cell = renderTotalsCellValue(
                  fieldName,
                  totals,
                  orderedFields
                );
                return cell ? (
                  <React.Fragment key={fieldName}>{cell}</React.Fragment>
                ) : null;
              })}
            </ImRow>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── BoeSummaryTable ──────────────────────────────────────────── */
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
      label: 'Assessable Total',
      calculated: assessableTotal,
      boe: boeAssessable ?? null,
      variance: boeAssessable != null ? assessableTotal - boeAssessable : null,
    },
    { label: 'BCD Total', calculated: bcdTotal, boe: null, variance: null },
    { label: 'SWS Total', calculated: swsTotal, boe: null, variance: null },
    { label: 'IGST Total', calculated: igstTotal, boe: null, variance: null },
    { label: 'Interest', calculated: interest, boe: null, variance: null },
    {
      label: 'Duty Total',
      calculated: calcDutyTotal,
      boe: boeDutyPaid ?? null,
      variance: boeDutyPaid != null ? calcDutyTotal - boeDutyPaid : null,
    },
  ];

  const handleExport = () =>
    downloadCsv(
      'boe-summary.csv',
      summaryRows.map(r => ({
        Metric: r.label,
        Calculated: r.calculated,
        BOE: r.boe ?? '',
        Variance: r.variance ?? '',
      }))
    );
  const handleExportXlsx = async () =>
    await exportXlsx({ itemsRows: [], summary: summaryRows });
  const handlePrint = () => {
    toast.info(
      'Printing... If nothing happens, please allow popups for this site.',
      { duration: 3000 }
    );
    printReport({ itemsRows: [], summary: summaryRows, title: 'BOE Summary' });
  };

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelTitleStyle}>BOE Summary &amp; Variance</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <ImBtn onClick={handleExport}>CSV</ImBtn>
          <ImBtn onClick={handleExportXlsx}>Excel</ImBtn>
          <ImBtn onClick={handlePrint}>Print</ImBtn>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: IM.header }}>
              <th style={thStyle}>Metric</th>
              <th style={thRightStyle}>Calculated</th>
              <th style={thRightStyle}>BOE</th>
              <th style={thRightStyle}>Variance (Calc − BOE)</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((r, i) => {
              const hasVariance = r.variance != null;
              const isPositive = hasVariance && r.variance! > 0;
              const isNegative = hasVariance && r.variance! < 0;
              return (
                <ImRow key={r.label} even={i % 2 === 0}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.label}</td>
                  <td style={tdRightStyle}>{formatCurrency(r.calculated)}</td>
                  <td style={tdRightStyle}>
                    {r.boe != null ? formatCurrency(r.boe) : '-'}
                  </td>
                  <td
                    style={{
                      ...tdRightStyle,
                      color: isPositive
                        ? IM.bad
                        : isNegative
                          ? IM.good
                          : IM.muted,
                      fontWeight: hasVariance ? 700 : undefined,
                    }}
                  >
                    {r.variance != null ? formatCurrency(r.variance) : '-'}
                  </td>
                </ImRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main client component ────────────────────────────────────── */
interface BoeSummaryClientProps {
  savedBoes: SavedBoe[];
  shipments: Shipment[];
  allBoes: BoeDetails[];
  initialSavedBoeId?: string | null;
}

export function BoeSummaryClient({
  savedBoes,
  shipments,
  allBoes,
  initialSavedBoeId = null,
}: BoeSummaryClientProps) {
  const navigate = useNavigate();
  const [selectedSupplier, setSelectedSupplier] = React.useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string>('');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [pendingStatus, setPendingStatus] = React.useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] =
    React.useState<boolean>(false);
  const [boeOverrides, setBoeOverrides] = React.useState<
    Record<string, Partial<SavedBoe>>
  >({});

  const mergedSavedBoes = React.useMemo(
    () => savedBoes.map(boe => ({ ...boe, ...(boeOverrides[boe.id] ?? {}) })),
    [savedBoes, boeOverrides]
  );

  const suppliers = React.useMemo(() => {
    const supplierSet = new Set(mergedSavedBoes.map(boe => boe.supplierName));
    return Array.from(supplierSet);
  }, [mergedSavedBoes]);

  const availableInvoices = React.useMemo(() => {
    if (!selectedSupplier) return [];
    return mergedSavedBoes.filter(
      boe =>
        boe.supplierName === selectedSupplier &&
        (statusFilter === 'All' || boe.status === statusFilter)
    );
  }, [selectedSupplier, mergedSavedBoes, statusFilter]);

  const selectedData = React.useMemo(() => {
    if (!selectedInvoiceId) return null;
    const savedBoe = mergedSavedBoes.find(b => b.id === selectedInvoiceId);
    if (!savedBoe) return null;
    const shipment = shipments.find(s => s.id === savedBoe.shipmentId) || null;
    const boeDetails = savedBoe.boeId
      ? allBoes.find(b => b.id === savedBoe.boeId) || null
      : null;
    const assessableTotal = savedBoe.calculationResult.calculatedItems.reduce(
      (sum, it) => sum + it.assessableValue,
      0
    );
    const { bcdTotal, swsTotal, igstTotal, interest, customsDutyTotal } =
      savedBoe.calculationResult;
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
  }, [selectedInvoiceId, mergedSavedBoes, shipments, allBoes]);

  React.useEffect(() => {
    if (selectedData?.savedBoe?.status) {
      setPendingStatus(selectedData.savedBoe.status);
    } else {
      setPendingStatus('');
    }
  }, [selectedData?.savedBoe?.id, selectedData?.savedBoe?.status]);

  React.useEffect(() => {
    if (!initialSavedBoeId || mergedSavedBoes.length === 0) return;
    const b = mergedSavedBoes.find(x => x.id === initialSavedBoeId);
    if (b) {
      setSelectedSupplier(b.supplierName);
      setSelectedInvoiceId(b.id);
    }
  }, [initialSavedBoeId, mergedSavedBoes]);

  const shipmentQuantityMap = React.useMemo(
    () =>
      Object.fromEntries(
        (selectedData?.shipment?.items ?? []).map(
          (it: { partNo: string; qty?: number }) => [it.partNo, it.qty ?? 0]
        )
      ),
    [selectedData?.shipment?.items]
  );
  const shipmentRatesMap = React.useMemo(
    () =>
      Object.fromEntries(
        (selectedData?.shipment?.items ?? []).map(it => [
          it.partNo,
          {
            bcdRate: it.actualBcdRate,
            swsRate: it.actualSwsRate,
            igstRate: it.actualIgstRate,
          },
        ])
      ),
    [selectedData?.shipment?.items]
  );
  const methodByPartMap = React.useMemo(
    () =>
      Object.fromEntries(
        (selectedData?.savedBoe.itemInputs ?? []).map(ii => [
          ii.partNo,
          ii.calculationMethod,
        ])
      ),
    [selectedData?.savedBoe.itemInputs]
  );

  React.useEffect(() => {
    if (initialSavedBoeId) return;
    setSelectedInvoiceId('');
  }, [initialSavedBoeId]);

  const handleSupplierChange = (supplier: string) => {
    setSelectedSupplier(supplier);
    setSelectedInvoiceId('');
    navigate('/boe-summary');
  };

  const handleInvoiceChange = (id: string) => {
    setSelectedInvoiceId(id);
    if (id) {
      navigate(`/boe-summary/${encodeURIComponent(id)}`);
    } else {
      navigate('/boe-summary');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filter controls panel */}
      <div style={panelStyle}>
        <div style={panelHeaderStyle}>
          <span style={panelTitleStyle}>Select BOE Calculation</span>
        </div>
        <div style={{ padding: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
            <div>
              <Label htmlFor="supplier-select" style={fieldLabelStyle}>
                Supplier
              </Label>
              <Select
                onValueChange={handleSupplierChange}
                value={selectedSupplier}
              >
                <SelectTrigger id="supplier-select">
                  <SelectValue placeholder="Select a supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="invoice-select" style={fieldLabelStyle}>
                Invoice
              </Label>
              <Select
                onValueChange={handleInvoiceChange}
                value={selectedInvoiceId}
                disabled={!selectedSupplier}
              >
                <SelectTrigger id="invoice-select">
                  <SelectValue placeholder="Select an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {availableInvoices.map(inv => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoiceNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status-filter" style={fieldLabelStyle}>
                Status Filter
              </Label>
              <Select onValueChange={setStatusFilter} value={statusFilter}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    'All',
                    'Awaiting BOE Data',
                    'Discrepancy Found',
                    'Reconciled',
                    'Investigation',
                    'Closed',
                  ].map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Content area */}
      {selectedData ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ItemDetailsTable
            items={selectedData.savedBoe.calculationResult.calculatedItems}
            quantities={shipmentQuantityMap}
            actualRatesByPart={shipmentRatesMap}
            methodByPart={methodByPartMap}
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

          {/* Status panel */}
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={panelTitleStyle}>Status</span>
                <StatusBadge status={selectedData.savedBoe.status} />
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <Label htmlFor="status-change" style={fieldLabelStyle}>
                    Change Status
                  </Label>
                  <Select
                    value={pendingStatus || selectedData.savedBoe.status}
                    onValueChange={setPendingStatus}
                  >
                    <SelectTrigger id="status-change" className="w-52">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'Awaiting BOE Data',
                        'Discrepancy Found',
                        'Reconciled',
                        'Investigation',
                        'Closed',
                      ].map(s => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ImBtn
                  primary
                  disabled={
                    isUpdatingStatus ||
                    !pendingStatus ||
                    pendingStatus === selectedData.savedBoe.status
                  }
                  onClick={async () => {
                    const existing = mergedSavedBoes.find(
                      b => b.id === selectedData.savedBoe!.id
                    );
                    if (!existing) return;
                    const next = {
                      ...existing,
                      status: pendingStatus as SavedBoe['status'],
                    } as SavedBoe;

                    setBoeOverrides(prev => ({
                      ...prev,
                      [next.id]: { status: next.status },
                    }));
                    setIsUpdatingStatus(true);
                    const toastId = toast.loading('Updating status...');
                    try {
                      await invoke('update_boe_status', {
                        id: next.id,
                        status: pendingStatus,
                      });
                      toast.success('Status updated', { id: toastId });
                    } catch {
                      setBoeOverrides(prev => ({
                        ...prev,
                        [next.id]: { status: existing.status },
                      }));
                      toast.error('Failed to update status', { id: toastId });
                    } finally {
                      setIsUpdatingStatus(false);
                    }
                  }}
                >
                  {isUpdatingStatus ? 'Updating...' : 'Update Status'}
                </ImBtn>
              </div>
            </div>
          </div>

          {/* Attached Documents panel */}
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <span style={panelTitleStyle}>Attached Documents</span>
              {selectedData.savedBoe.attachments?.length ? (
                <span
                  style={{
                    fontFamily: IM.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    color: IM.accent,
                    background: IM.accentBg,
                    border: `1px solid ${IM.accentBdr}`,
                    padding: '1px 6px',
                  }}
                >
                  {selectedData.savedBoe.attachments.length}
                </span>
              ) : null}
            </div>
            <div
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {selectedData.savedBoe.attachments?.length ? (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  {selectedData.savedBoe.attachments.map(att => (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: IM.alt,
                        border: `1px solid ${IM.rule}`,
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        <a
                          style={{
                            fontFamily: IM.mono,
                            fontSize: 12,
                            color: IM.accent,
                            textDecoration: 'none',
                          }}
                          href={convertFileSrc(att.url)}
                          target="_blank"
                          rel="noreferrer"
                          onMouseEnter={e =>
                            ((e.target as HTMLElement).style.textDecoration =
                              'underline')
                          }
                          onMouseLeave={e =>
                            ((e.target as HTMLElement).style.textDecoration =
                              'none')
                          }
                        >
                          {att.fileName}
                        </a>
                        <span
                          style={{
                            fontFamily: IM.mono,
                            fontSize: 10,
                            color: IM.muted,
                          }}
                        >
                          {att.documentType} ·{' '}
                          {new Date(att.uploadedAt).toLocaleString()}
                        </span>
                      </div>
                      <a
                        href={convertFileSrc(att.url)}
                        download={att.fileName}
                        style={{
                          padding: '4px 12px',
                          fontFamily: IM.mono,
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          background: 'transparent',
                          border: `1px solid ${IM.rule}`,
                          color: IM.muted,
                          textDecoration: 'none',
                          display: 'inline-block',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.color =
                            IM.text;
                          (e.currentTarget as HTMLElement).style.borderColor =
                            IM.faint;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.color =
                            IM.muted;
                          (e.currentTarget as HTMLElement).style.borderColor =
                            IM.rule;
                        }}
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    fontFamily: IM.mono,
                    fontSize: 11,
                    color: IM.muted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    margin: 0,
                  }}
                >
                  No documents attached
                </p>
              )}
              <div>
                <ImBtn
                  primary
                  onClick={async () => {
                    const picked = await openDialog({
                      multiple: false,
                      directory: false,
                      filters: [
                        {
                          name: 'Documents',
                          extensions: [
                            'pdf',
                            'png',
                            'jpg',
                            'jpeg',
                            'xlsx',
                            'xls',
                            'csv',
                            'doc',
                            'docx',
                          ],
                        },
                      ],
                    });

                    if (!picked || Array.isArray(picked)) return;

                    const srcPath = picked as string;
                    const toastId = toast.loading('Saving document...');
                    try {
                      const destPath = await invoke<string>(
                        'save_boe_attachment_file',
                        { id: selectedData.savedBoe.id, srcPath }
                      );

                      const idx = mergedSavedBoes.findIndex(
                        b => b.id === selectedData.savedBoe.id
                      );

                      if (idx >= 0) {
                        const current = mergedSavedBoes[idx];
                        const fileName =
                          srcPath.split(/\\|\//).pop() || `file-${Date.now()}`;

                        const att = {
                          id: `ATT-${Date.now()}`,
                          documentType: 'Attachment',
                          fileName,
                          url: destPath,
                          uploadedAt: new Date().toISOString(),
                        };

                        const next = {
                          ...current,
                          attachments: [...(current.attachments ?? []), att],
                        } as SavedBoe;

                        setBoeOverrides(prev => ({
                          ...prev,
                          [next.id]: { attachments: next.attachments },
                        }));

                        await invoke('add_boe_attachment', {
                          id: next.id,
                          attachment: att,
                        });

                        toast.success('Document saved', {
                          id: toastId,
                          description: destPath,
                        });
                      } else {
                        console.error(
                          '❌ Failed to locate BOE in savedBoes array'
                        );
                        toast.error('Failed to locate BOE to attach', {
                          id: toastId,
                        });
                      }
                    } catch (error) {
                      console.error('💥 Failed to save BOE document:', error);
                      console.error('Error details:', {
                        message:
                          error instanceof Error
                            ? error.message
                            : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                      });
                      toast.error('Failed to save document', { id: toastId });
                    }
                  }}
                >
                  Upload Document
                </ImBtn>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 24px',
            border: `1px solid ${IM.rule}`,
            background: IM.panel,
          }}
        >
          <p
            style={{
              fontFamily: IM.mono,
              fontSize: 11,
              color: IM.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              margin: 0,
            }}
          >
            Select a supplier and invoice to view the report
          </p>
        </div>
      )}
    </div>
  );
}
