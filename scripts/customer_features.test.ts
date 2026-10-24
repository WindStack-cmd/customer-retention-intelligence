import { describe, expect, it } from "vitest";
import {
  calculateCustomerFeatures,
  observedInactivityProxy,
} from "./customer_features";

const cutoffAt = new Date("2021-02-15T00:00:00Z");

const baseOrders = [
  {
    orderId: 1,
    invoiceDate: new Date("2021-01-01T00:00:00Z"),
    isCancellation: 0,
  },
  {
    orderId: 2,
    invoiceDate: new Date("2021-01-11T00:00:00Z"),
    isCancellation: 0,
  },
  {
    orderId: 3,
    invoiceDate: new Date("2021-02-10T00:00:00Z"),
    isCancellation: 0,
  },
  {
    orderId: 4,
    invoiceDate: new Date("2021-02-20T00:00:00Z"),
    isCancellation: 0,
  },
];

const baseItems = [
  {
    orderId: 1,
    productId: 10,
    quantity: 2,
    lineRevenue: 20,
    isCancellation: 0,
  },
  {
    orderId: 2,
    productId: 11,
    quantity: 1,
    lineRevenue: 10,
    isCancellation: 0,
  },
  {
    orderId: 2,
    productId: 12,
    quantity: -1,
    lineRevenue: -5,
    isCancellation: 1,
  },
  {
    orderId: 3,
    productId: 10,
    quantity: 3,
    lineRevenue: 30,
    isCancellation: 0,
  },
  {
    orderId: 4,
    productId: 13,
    quantity: 9,
    lineRevenue: 90,
    isCancellation: 0,
  },
];

describe("customer feature calculations", () => {
  it("uses only transactions at or before the cutoff", () => {
    const features = calculateCustomerFeatures({
      cutoffAt,
      horizonDays: 30,
      orders: baseOrders,
      items: baseItems,
    });
    expect(features.totalOrders).toBe(3);
    expect(features.purchaseCount).toBe(4);
    expect(features.totalGrossValue).toBe(60);
    expect(features.totalNetValue).toBe(55);
    expect(features.lastPurchaseDate.toISOString()).toBe(
      "2021-02-10T00:00:00.000Z"
    );
    expect(features.lastPurchaseDate.getTime()).toBeLessThanOrEqual(
      cutoffAt.getTime()
    );
  });

  it("preserves negative return quantity/value and cancellation counts", () => {
    const features = calculateCustomerFeatures({
      cutoffAt,
      horizonDays: 30,
      orders: baseOrders,
      items: baseItems,
    });
    expect(features.returnCount).toBe(1);
    expect(features.returnQuantity).toBe(1);
    expect(features.returnValue).toBe(-5);
    expect(features.cancellationCount).toBe(1);
    expect(features.cancellationRate).toBe(0.25);
  });

  it("computes recent windows and trend inputs without using future rows", () => {
    const withoutFuture = calculateCustomerFeatures({
      cutoffAt,
      horizonDays: 30,
      orders: baseOrders.slice(0, 3),
      items: baseItems.slice(0, 4),
    });
    const withFuture = calculateCustomerFeatures({
      cutoffAt,
      horizonDays: 30,
      orders: baseOrders,
      items: baseItems,
    });
    expect(withFuture.purchasesLast30d).toBe(1);
    expect(withFuture.spendLast30d).toBe(30);
    expect(withFuture.recentVsPreviousOrderRate).toBe(
      withoutFuture.recentVsPreviousOrderRate
    );
    expect(withFuture.totalNetValue).toBe(withoutFuture.totalNetValue);
    expect(withFuture.customerAgeAtCutoff).toBe(45);
  });

  it("returns a deterministic binary observed inactivity proxy", () => {
    expect(observedInactivityProxy(true)).toBe(0);
    expect(observedInactivityProxy(false)).toBe(1);
  });
});
