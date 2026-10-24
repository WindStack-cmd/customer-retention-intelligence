import { describe, expect, it } from "vitest";
import {
  brierPerformance,
  compareNumericFeature,
  missingnessRate,
} from "./monitoring";

describe("monitoring calculations", () => {
  it("reports missingness without treating missing values as zero", () => {
    expect(missingnessRate([1, null, 2, undefined])).toBe(0.5);
  });

  it("flags material mean drift", () => {
    expect(compareNumericFeature("risk", [1, 1], [2, 2]).status).toBe(
      "warning"
    );
  });

  it("does not fabricate performance without aligned labels", () => {
    expect(brierPerformance([0.2], []).status).toBe("unavailable");
  });

  it("calculates Brier score for aligned binary outcomes", () => {
    expect(brierPerformance([0.2, 0.8], [0, 1]).brierScore).toBeCloseTo(0.04);
  });
});
