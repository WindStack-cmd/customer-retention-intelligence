export const CUSTOMER_VALUE_METHODOLOGY_VERSION = "behavioral-clv-v1";
export const CUSTOMER_VALUE_HORIZON_DAYS = 90;

export type CustomerValueInput = {
  historicalGrossRevenue: number;
  historicalNetRevenue: number;
  returnValue: number;
  orderCount: number;
  averageOrderValue: number;
  purchaseFrequency: number;
  lifetimeActivityDays: number;
  calibratedChurnProbability: number;
  horizonDays?: number;
};

export type CustomerValue = {
  historicalGrossRevenue: number;
  historicalNetRevenue: number;
  returnValue: number;
  orderCount: number;
  averageOrderValue: number;
  purchaseFrequency: number;
  lifetimeActivityDays: number;
  calibratedChurnProbability: number;
  expectedFutureValue: number;
  behavioralClv: number;
  revenueAtRisk: number;
  horizonDays: number;
};

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCustomerValue(
  input: CustomerValueInput
): CustomerValue {
  const horizonDays = input.horizonDays ?? CUSTOMER_VALUE_HORIZON_DAYS;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 365)
    throw new Error("horizonDays must be an integer between 1 and 365");
  const historicalGrossRevenue = finite(
    input.historicalGrossRevenue,
    "historicalGrossRevenue"
  );
  const historicalNetRevenue = finite(
    input.historicalNetRevenue,
    "historicalNetRevenue"
  );
  const returnValue = finite(input.returnValue, "returnValue");
  const orderCount = finite(input.orderCount, "orderCount");
  const averageOrderValue = finite(
    input.averageOrderValue,
    "averageOrderValue"
  );
  const purchaseFrequency = finite(
    input.purchaseFrequency,
    "purchaseFrequency"
  );
  const lifetimeActivityDays = finite(
    input.lifetimeActivityDays,
    "lifetimeActivityDays"
  );
  const calibratedChurnProbability = finite(
    input.calibratedChurnProbability,
    "calibratedChurnProbability"
  );
  if (historicalGrossRevenue < 0)
    throw new Error("historicalGrossRevenue cannot be negative");
  if (orderCount < 1 || !Number.isInteger(orderCount))
    throw new Error("orderCount must be a positive integer");
  if (purchaseFrequency < 0)
    throw new Error("purchaseFrequency cannot be negative");
  if (lifetimeActivityDays < 0 || !Number.isInteger(lifetimeActivityDays))
    throw new Error("lifetimeActivityDays cannot be negative");
  if (calibratedChurnProbability < 0 || calibratedChurnProbability > 1)
    throw new Error("calibratedChurnProbability must be in [0, 1]");
  if (returnValue > 0.01)
    throw new Error(
      "returnValue must be non-positive under signed return semantics"
    );

  const expectedFutureValue = roundMoney(
    Math.max(0, averageOrderValue) * purchaseFrequency * (horizonDays / 30)
  );
  const revenueAtRisk = roundMoney(
    expectedFutureValue * calibratedChurnProbability
  );
  const behavioralClv = roundMoney(
    historicalNetRevenue +
      expectedFutureValue * (1 - calibratedChurnProbability)
  );
  return {
    historicalGrossRevenue: roundMoney(historicalGrossRevenue),
    historicalNetRevenue: roundMoney(historicalNetRevenue),
    returnValue: roundMoney(returnValue),
    orderCount,
    averageOrderValue: roundMoney(averageOrderValue),
    purchaseFrequency,
    lifetimeActivityDays,
    calibratedChurnProbability,
    expectedFutureValue,
    behavioralClv,
    revenueAtRisk,
    horizonDays,
  };
}
