import { describe, expect, it } from "vitest";
import { parseCsvLine, rowHash } from "./import_online_retail";

describe("Phase 3 import helpers", () => {
  it("parses quoted commas and escaped quotes without changing field boundaries", () => {
    expect(parseCsvLine('536365,"WHITE, HEART ""LIGHT""",6')).toEqual([
      "536365",
      'WHITE, HEART "LIGHT"',
      "6",
    ]);
  });

  it("creates stable source-row keys for idempotent re-import", () => {
    const first = rowHash("source-checksum", "42");
    expect(first).toHaveLength(64);
    expect(rowHash("source-checksum", "42")).toBe(first);
    expect(rowHash("source-checksum", "43")).not.toBe(first);
    expect(rowHash("different-source", "42")).not.toBe(first);
  });

  it("keeps source and processed row identities distinct by source row number", () => {
    expect(rowHash("same-workbook", "101")).not.toBe(
      rowHash("same-workbook", "102")
    );
  });
});
