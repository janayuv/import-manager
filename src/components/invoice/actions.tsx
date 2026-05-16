// src/components/invoice/actions.tsx (MODIFIED - Added Delete action)
import { Eye, Pencil, Trash2, Zap } from 'lucide-react';

import type { FlattenedInvoiceLine } from '@/types/invoice';

interface InvoiceLineActionsProps {
  lineItem: FlattenedInvoiceLine;
  onView: (invoiceId: string) => void;
  onEdit: (invoiceId: string) => void;
  onDelete: (invoiceId: string, invoiceNumber: string) => void;
  onQuickFinalize: (invoiceId: string, invoiceNumber: string) => void;
}

export function InvoiceLineActions({
  lineItem,
  onView,
  onEdit,
  onDelete,
  onQuickFinalize,
}: InvoiceLineActionsProps) {
  const isFinalized = lineItem.status === 'Finalized';
  const invoiceTotalDecimals = lineItem.invoiceTotalDecimals === 0 ? 0 : 2;
  const tolerance = invoiceTotalDecimals === 0 ? 0.5 : 0.01;
  const roundedShipmentTotal =
    Math.round(lineItem.shipmentTotal * 10 ** invoiceTotalDecimals) /
    10 ** invoiceTotalDecimals;
  const isMatched =
    Math.abs(roundedShipmentTotal - lineItem.invoiceTotal) < tolerance;

  return (
    <div className="im-row-actions">
      <button
        type="button"
        className="im-row-act-btn"
        title="View"
        onClick={e => {
          e.stopPropagation();
          onView(lineItem.invoiceId);
        }}
      >
        <Eye size={11} />
      </button>
      <button
        type="button"
        className="im-row-act-btn"
        title="Edit"
        disabled={isFinalized}
        onClick={e => {
          e.stopPropagation();
          if (!isFinalized) onEdit(lineItem.invoiceId);
        }}
      >
        <Pencil size={11} />
      </button>
      {!isFinalized && isMatched && (
        <button
          type="button"
          className="im-row-act-btn im-row-act-btn--finalize"
          title="Quick finalize"
          onClick={e => {
            e.stopPropagation();
            onQuickFinalize(lineItem.invoiceId, lineItem.invoiceNumber);
          }}
        >
          <Zap size={11} />
        </button>
      )}
      <button
        type="button"
        className="im-row-act-btn im-row-act-btn--danger"
        title="Delete"
        onClick={e => {
          e.stopPropagation();
          onDelete(lineItem.invoiceId, lineItem.invoiceNumber);
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}
