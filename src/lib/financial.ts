export interface DutyBreakdown {
  bcd: number;
  sws: number;
  igst: number;
  total: number;
}

export function round(value: number, decimals = 2): number {
  return parseFloat(value.toFixed(decimals));
}

export function computePerUnitDuty(totalDuty: number, quantity: number | undefined | null): number {
  const qty = quantity && quantity > 0 ? quantity : 1;
  return round(totalDuty / qty, 2);
}

export function computeLandedCostPerUnit(assessableValue: number, totalDuty: number, quantity: number | undefined | null): number {
  const qty = quantity && quantity > 0 ? quantity : 1;
  const assessablePerUnit = assessableValue / qty;
  const dutyPerUnit = computePerUnitDuty(totalDuty, qty);
  return round(assessablePerUnit + dutyPerUnit, 2);
}

export function computePotentialDuty(
  assessableValue: number,
  rates: { bcdRate: number; swsRate: number; igstRate: number }
): DutyBreakdown {
  const bcd = assessableValue * (rates.bcdRate / 100);
  const sws = bcd * (rates.swsRate / 100);
  const igst = (assessableValue + bcd + sws) * (rates.igstRate / 100);
  const total = bcd + sws + igst;
  return {
    bcd: round(bcd, 2),
    sws: round(sws, 2),
    igst: round(igst, 2),
    total: round(total, 2),
  };
}

export function computeDutySavings(actualDutyTotal: number, potentialDutyTotal: number): number {
  return round(Math.max(potentialDutyTotal - actualDutyTotal, 0), 2);
}

// New: compute duty from exact rates (used as "Actual Duty")
export function computeDutyFromRates(
  assessableValue: number,
  rates: { bcdRate: number; swsRate: number; igstRate: number }
): DutyBreakdown {
  return computePotentialDuty(assessableValue, rates);
}

export type CalcMethod = "Standard" | "CEPA" | "Rodtep";

// New: savings based on Actual Duty (from shipment rates) minus BOE Duty (from calculation), only for CEPA/Rodtep
export function computeSavingsFromActualVsBoe(params: {
  method: CalcMethod;
  assessableValue: number;
  actualRates: { bcdRate: number; swsRate: number; igstRate: number };
  boe: DutyBreakdown;
}): number {
  if (params.method === "Standard") return 0;
  const actual = computeDutyFromRates(params.assessableValue, params.actualRates);
  const diff = actual.total - params.boe.total;
  return round(Math.max(diff, 0), 2);
}


