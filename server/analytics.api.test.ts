import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const authenticated = context({
  id: 1,
  openId: "phase9-test-user",
  name: "Phase 9 Test User",
  email: "phase9@example.test",
  loginMethod: "test",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
});

describe.skipIf(
  !process.env.DATABASE_URL || process.env.RUN_DATABASE_TESTS !== "true"
)("Phase 9 analytics APIs", () => {
  it("rejects unauthenticated executive access", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.analytics.executiveOverview()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects invalid pagination and risk filters", async () => {
    const caller = appRouter.createCaller(authenticated);
    await expect(
      caller.analytics.customers({ page: 0, pageSize: 25 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.analytics.customers({ page: 1, pageSize: 101, minRisk: 2 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns real executive metrics and metadata", async () => {
    const result = await appRouter
      .createCaller(authenticated)
      .analytics.executiveOverview();
    expect(result.dataStatus).toBe("REAL_DATABASE_RECORDS");
    expect(result.summary.customerCount).toBeGreaterThan(0);
    expect(result.summary.totalRevenueAtRisk).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.modelRunId).toBeGreaterThan(0);
  });

  it("supports bounded customer pagination and consistent detail lookup", async () => {
    const caller = appRouter.createCaller(authenticated);
    const page = await caller.analytics.customers({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.pageSize).toBe(2);
    expect(page.items[0].customerId).toBeGreaterThan(0);
    expect(page.items[0].calibratedChurnProbability).toBeGreaterThanOrEqual(0);
    expect(page.items[0].calibratedChurnProbability).toBeLessThanOrEqual(1);

    const detail = await caller.analytics.customerDetail({
      customerId: page.items[0].customerId,
    });
    expect(detail?.dataStatus).toBe("REAL_DATABASE_RECORDS");
    expect(detail?.customer.customerId).toBe(page.items[0].customerId);
    expect(detail?.predictionAndValue.revenueAtRisk).toBe(
      page.items[0].revenueAtRisk
    );
    expect(detail?.predictionAndValue.rawProbability).toBeGreaterThanOrEqual(0);
    expect(detail?.predictionAndValue.predictedClass).toBeGreaterThanOrEqual(0);
    expect(detail?.predictionAndValue.predictionVersion).toBeTruthy();
    expect(detail?.explanations.length).toBeGreaterThan(0);
  });

  it("returns recommendations with supporting signals and supports empty filters", async () => {
    const caller = appRouter.createCaller(authenticated);
    const recommendations = await caller.analytics.recommendations({
      page: 1,
      pageSize: 3,
      priorityBand: "Urgent",
    });
    expect(recommendations.items.length).toBeGreaterThan(0);
    expect(recommendations.items.length).toBeLessThanOrEqual(3);
    expect(
      recommendations.items.every(item => item.priorityBand === "Urgent")
    ).toBe(true);
    expect(recommendations.items[0].supportingSignals).toHaveProperty(
      "calibratedChurnProbability"
    );
    expect(recommendations.items[0].benefitEvidence).toContain(
      "No experimental uplift"
    );

    const empty = await caller.analytics.customers({
      page: 1,
      pageSize: 25,
      search: "definitely-not-a-real-customer-9c8a",
    });
    expect(empty.total).toBe(0);
    expect(empty.items).toEqual([]);
  });

  it("exposes bounded quality and model metadata", async () => {
    const caller = appRouter.createCaller(authenticated);
    const [quality, models] = await Promise.all([
      caller.analytics.dataQuality(),
      caller.analytics.modelRuns(),
    ]);
    expect(quality.dataStatus).toBe("REAL_DATABASE_RECORDS");
    expect(quality.runs.length).toBeGreaterThan(0);
    expect(quality.issues.length).toBeLessThanOrEqual(100);
    expect(models.dataStatus).toBe("REAL_DATABASE_RECORDS");
    expect(models.runs.length).toBeGreaterThan(0);
    expect(models.runs[0].artifactSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
