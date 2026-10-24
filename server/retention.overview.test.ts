import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("retention.overview", () => {
  it("returns a labeled demo overview with actionable priority customers", async () => {
    const result = await appRouter.createCaller(createContext()).retention.overview();

    expect(result.metadata.dataStatus).toBe("SIMULATED");
    expect(result.metadata.predictionHorizon).toBe("30 days");
    expect(result.summary.revenueAtRisk).toBeGreaterThan(0);
    expect(result.customers.length).toBeGreaterThan(0);
    expect(result.customers[0]).toMatchObject({
      name: "Maya Patel",
      risk: 92,
      action: "Executive check-in",
    });
  });
});
