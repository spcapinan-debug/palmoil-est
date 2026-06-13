export type CostInput = {
  laborCost?: number;
  materialCost?: number;
  fuelCost?: number;
  machineCost?: number;
  contractorCost?: number;
  otherCost?: number;
  deductionAmount?: number;
};

export function calculateTotalCost(input: CostInput) {
  const laborCost = input.laborCost ?? 0;
  const materialCost = input.materialCost ?? 0;
  const fuelCost = input.fuelCost ?? 0;
  const machineCost = input.machineCost ?? 0;
  const contractorCost = input.contractorCost ?? 0;
  const otherCost = input.otherCost ?? 0;
  const deductionAmount = input.deductionAmount ?? 0;
  return {
    laborCost,
    materialCost,
    fuelCost,
    machineCost,
    contractorCost,
    otherCost,
    deductionAmount,
    totalCost: laborCost + materialCost + fuelCost + machineCost + contractorCost + otherCost - deductionAmount,
  };
}
