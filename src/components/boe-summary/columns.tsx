"use client";

import { Badge } from "@/components/ui/badge";
import type { SavedBoe } from "@/types/boe-entry";

const statusToVariant: Record<SavedBoe["status"], { color: string; label: string }> = {
  "Awaiting BOE Data": { color: "bg-blue-600", label: "Awaiting BOE Data" },
  "Discrepancy Found": { color: "bg-red-600", label: "Discrepancy Found" },
  "Reconciled": { color: "bg-green-600", label: "Reconciled" },
  "Investigation": { color: "bg-yellow-600", label: "Investigation" },
  "Closed": { color: "bg-gray-500", label: "Closed" },
};

export function StatusBadge({ status }: { status: SavedBoe["status"] }) {
  const v = statusToVariant[status] ?? statusToVariant["Awaiting BOE Data"];
  return (
    <Badge className={`${v.color} text-white`}>{v.label}</Badge>
  );
}


