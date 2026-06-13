export type PayrollMethod = "daily" | "hourly" | "piece" | "team_pool" | "per_weight" | "per_area" | "per_trip" | "mixed" | "driver_rate";

export type PayrollInput = {
  method: PayrollMethod;
  rate: number;
  quantity?: number;
  hours?: number;
  days?: number;
  poolAmount?: number;
  poolShare?: number;
  additions?: number;
  deductions?: number;
};

export function calculatePayrollAmount(input: PayrollInput) {
  const quantity = input.quantity ?? 0;
  const hours = input.hours ?? 0;
  const days = input.days ?? 0;
  const base = calculateBaseAmount(input.method, input.rate, { quantity, hours, days, poolAmount: input.poolAmount ?? 0, poolShare: input.poolShare ?? 0 });
  const additions = input.additions ?? 0;
  const deductions = input.deductions ?? 0;
  return {
    baseAmount: base,
    additions,
    deductions,
    netAmount: base + additions - deductions,
  };
}

function calculateBaseAmount(method: PayrollMethod, rate: number, values: { quantity: number; hours: number; days: number; poolAmount: number; poolShare: number }) {
  if (method === "hourly") return rate * values.hours;
  if (method === "daily") return rate * Math.max(1, values.days || 1);
  if (method === "team_pool") return values.poolAmount * values.poolShare;
  return rate * values.quantity;
}
