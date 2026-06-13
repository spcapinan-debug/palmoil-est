export type OvertimeInput = {
  actualHours: number;
  normalHours: number;
  multiplier?: number;
  rate?: number;
};

export function calculateOvertime(input: OvertimeInput) {
  const otHours = Math.max(0, input.actualHours - input.normalHours);
  const multiplier = input.multiplier ?? 1.5;
  const rate = input.rate ?? 0;
  return {
    otHours,
    otAmount: otHours * rate * multiplier,
  };
}
