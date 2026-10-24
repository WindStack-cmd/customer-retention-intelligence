export const FEATURE_VERSION = "phase4-rfm-behavioral-v1";

export type FeatureOrder = {
  orderId: number;
  invoiceDate: Date;
  isCancellation: number;
};

export type FeatureItem = {
  orderId: number;
  productId: number;
  quantity: number;
  lineRevenue: number;
  isCancellation: number;
};

export type CustomerFeatureInput = {
  cutoffAt: Date;
  horizonDays: number;
  orders: FeatureOrder[];
  items: FeatureItem[];
};

export type CustomerFeatures = {
  daysSinceLastPurchase: number;
  totalOrders: number;
  purchaseFrequency: number;
  totalGrossValue: number;
  totalNetValue: number;
  averageOrderValue: number;
  totalItems: number;
  averageItemsPerOrder: number;
  uniqueProducts: number;
  activeMonths: number;
  purchaseCount: number;
  averageQuantityPerOrder: number;
  averageDaysBetweenOrders: number | null;
  purchaseIntervalVariance: number | null;
  firstPurchaseDate: Date;
  lastPurchaseDate: Date;
  customerLifetimeDays: number;
  inactiveDays: number;
  returnCount: number;
  returnQuantity: number;
  returnValue: number;
  returnRate: number;
  cancellationCount: number;
  cancellationRate: number;
  productDiversity: number;
  purchasesLast7d: number;
  purchasesLast30d: number;
  purchasesLast60d: number;
  purchasesLast90d: number;
  spendLast30d: number;
  spendLast60d: number;
  spendLast90d: number;
  ordersLast30d: number;
  ordersLast60d: number;
  ordersLast90d: number;
  recentVsPreviousOrderRate: number;
  recentVsPreviousSpend: number;
  recentVsPreviousQuantity: number;
  acquisitionMonth: string;
  acquisitionQuarter: string;
  cohortMonth: string;
  customerAgeAtCutoff: number;
};

const DAY_MS = 86_400_000;

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

function inWindow(date: Date, cutoff: Date, days: number): boolean {
  const lower = cutoff.getTime() - days * DAY_MS;
  return date.getTime() <= cutoff.getTime() && date.getTime() > lower;
}

function month(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function quarter(date: Date): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function safeRatio(numerator: number, denominator: number): number {
  if (Math.abs(denominator) < 0.000001) return round(numerator);
  return round(
    Math.min(9999999999, Math.max(-9999999999, numerator / denominator))
  );
}

function trend(recent: number, previous: number): number {
  return safeRatio(recent, Math.abs(previous));
}

export function calculateCustomerFeatures(
  input: CustomerFeatureInput
): CustomerFeatures {
  const { cutoffAt: cutoff } = input;
  const eligibleOrders = input.orders
    .filter(order => order.invoiceDate.getTime() <= cutoff.getTime())
    .sort(
      (left, right) =>
        left.invoiceDate.getTime() - right.invoiceDate.getTime() ||
        left.orderId - right.orderId
    );
  if (eligibleOrders.length === 0)
    throw new Error("At least one order before cutoff is required");

  const eligibleOrderIds = new Set(eligibleOrders.map(order => order.orderId));
  const eligibleItems = input.items.filter(item =>
    eligibleOrderIds.has(item.orderId)
  );
  const orderById = new Map(
    eligibleOrders.map(order => [order.orderId, order])
  );
  const firstPurchaseDate = eligibleOrders[0].invoiceDate;
  const lastPurchaseDate =
    eligibleOrders[eligibleOrders.length - 1].invoiceDate;
  const totalOrders = eligibleOrders.length;
  const totalGrossValue = eligibleItems.reduce(
    (sum, item) => sum + Math.max(0, item.lineRevenue),
    0
  );
  const totalNetValue = eligibleItems.reduce(
    (sum, item) => sum + item.lineRevenue,
    0
  );
  const returnItems = eligibleItems.filter(
    item => item.isCancellation === 1 || item.quantity < 0
  );
  const cancellationItems = eligibleItems.filter(
    item => item.isCancellation === 1
  );
  const uniqueProducts = new Set(eligibleItems.map(item => item.productId))
    .size;
  const totalItems = eligibleItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  const totalQuantityAbsolute = eligibleItems.reduce(
    (sum, item) => sum + Math.abs(item.quantity),
    0
  );
  const intervals: number[] = [];
  for (let index = 1; index < eligibleOrders.length; index += 1) {
    intervals.push(
      daysBetween(
        eligibleOrders[index - 1].invoiceDate,
        eligibleOrders[index].invoiceDate
      )
    );
  }
  const averageInterval = intervals.length
    ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    : null;
  const intervalVariance =
    averageInterval === null
      ? null
      : intervals.reduce(
          (sum, value) => sum + (value - averageInterval) ** 2,
          0
        ) / intervals.length;
  const activeMonths = new Set(
    eligibleOrders.map(order => month(order.invoiceDate))
  ).size;
  const cutoffDays = daysBetween(firstPurchaseDate, cutoff);
  const lifetimeDays = daysBetween(firstPurchaseDate, lastPurchaseDate);
  const inactiveDays = daysBetween(lastPurchaseDate, cutoff);
  const orderStats = (days: number) => {
    const orders = eligibleOrders.filter(order =>
      inWindow(order.invoiceDate, cutoff, days)
    );
    const orderIds = new Set(orders.map(order => order.orderId));
    const items = eligibleItems.filter(item => orderIds.has(item.orderId));
    return {
      orders: orderIds.size,
      spend: items.reduce((sum, item) => sum + item.lineRevenue, 0),
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  };
  const last7 = orderStats(7);
  const last30 = orderStats(30);
  const last60 = orderStats(60);
  const last90 = orderStats(90);
  const previousOrders = eligibleOrders.filter(order => {
    const time = order.invoiceDate.getTime();
    return (
      time <= cutoff.getTime() - 30 * DAY_MS &&
      time > cutoff.getTime() - 60 * DAY_MS
    );
  });
  const previousOrderIds = new Set(previousOrders.map(order => order.orderId));
  const previousItems = eligibleItems.filter(item =>
    previousOrderIds.has(item.orderId)
  );
  const recentOrders = last30.orders;
  const recentQuantity = last30.quantity;
  const previousQuantity = previousItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  const returnQuantity = returnItems.reduce(
    (sum, item) => sum + Math.max(0, -item.quantity),
    0
  );
  const acquisitionMonth = month(firstPurchaseDate);

  return {
    daysSinceLastPurchase: inactiveDays,
    totalOrders,
    purchaseFrequency: round(totalOrders / Math.max(1, cutoffDays / 30)),
    totalGrossValue: round(totalGrossValue, 2),
    totalNetValue: round(totalNetValue, 2),
    averageOrderValue: round(totalNetValue / totalOrders, 2),
    totalItems: round(totalItems, 3),
    averageItemsPerOrder: round(totalQuantityAbsolute / totalOrders),
    uniqueProducts,
    activeMonths,
    purchaseCount: eligibleItems.length,
    averageQuantityPerOrder: round(totalItems / totalOrders),
    averageDaysBetweenOrders:
      averageInterval === null ? null : round(averageInterval),
    purchaseIntervalVariance:
      intervalVariance === null ? null : round(intervalVariance),
    firstPurchaseDate,
    lastPurchaseDate,
    customerLifetimeDays: lifetimeDays,
    inactiveDays,
    returnCount: returnItems.length,
    returnQuantity: round(returnQuantity, 3),
    returnValue: round(
      returnItems.reduce((sum, item) => sum + item.lineRevenue, 0),
      2
    ),
    returnRate: round(returnItems.length / Math.max(1, eligibleItems.length)),
    cancellationCount: cancellationItems.length,
    cancellationRate: round(
      cancellationItems.length / Math.max(1, eligibleItems.length)
    ),
    productDiversity: round(uniqueProducts / Math.max(1, eligibleItems.length)),
    purchasesLast7d: last7.orders,
    purchasesLast30d: last30.orders,
    purchasesLast60d: last60.orders,
    purchasesLast90d: last90.orders,
    spendLast30d: round(last30.spend, 2),
    spendLast60d: round(last60.spend, 2),
    spendLast90d: round(last90.spend, 2),
    ordersLast30d: last30.orders,
    ordersLast60d: last60.orders,
    ordersLast90d: last90.orders,
    recentVsPreviousOrderRate: trend(recentOrders, previousOrders.length),
    recentVsPreviousSpend: trend(last30.spend, last60.spend - last30.spend),
    recentVsPreviousQuantity: trend(recentQuantity, previousQuantity),
    acquisitionMonth,
    acquisitionQuarter: quarter(firstPurchaseDate),
    cohortMonth: acquisitionMonth,
    customerAgeAtCutoff: cutoffDays,
  };
}

export function observedInactivityProxy(
  hasFutureOrderWithinHorizon: boolean
): number {
  return hasFutureOrderWithinHorizon ? 0 : 1;
}
