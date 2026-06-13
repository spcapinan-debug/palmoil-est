export type RoundingMethod = "nearest_half" | "always_up" | "always_down" | "no_round" | "decimal_2";

export type RequisitionQuantityInput = {
  baseQty: number;
  conversionRate: number;
  roundingMethod: RoundingMethod;
};

export type RequisitionQuantityResult = {
  rawQty: number;
  roundedQty: number;
  differenceQty: number;
  differenceBaseQty: number;
};

export function calculateRequisitionQuantity(params: RequisitionQuantityInput): RequisitionQuantityResult {
  const conversionRate = params.conversionRate || 1;
  const rawQty = params.baseQty / conversionRate;
  const roundedQty = roundQuantity(rawQty, params.roundingMethod);
  const differenceQty = roundedQty - rawQty;
  return {
    rawQty,
    roundedQty,
    differenceQty,
    differenceBaseQty: differenceQty * conversionRate,
  };
}

function roundQuantity(value: number, method: RoundingMethod): number {
  if (method === "always_up") return Math.ceil(value);
  if (method === "always_down") return Math.floor(value);
  if (method === "decimal_2") return Math.round(value * 100) / 100;
  if (method === "no_round") return value;
  return Math.round(value);
}
