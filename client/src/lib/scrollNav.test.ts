import { describe, expect, it } from "vitest";
import {
  computeActiveSection,
  DOM_SECTION_ORDER,
  getVisibleNavIdsForRole,
  type SectionPosition,
} from "./scrollNav";

describe("scrollNav active section & DOM order alignment", () => {
  const mockSections: SectionPosition[] = [
    { id: "overview", top: 0 },
    { id: "recommendations", top: 600 },
    { id: "customers", top: 1200 },
    { id: "roi", top: 2000 },
    { id: "cohorts", top: 2800 },
    { id: "integrations", top: 3600 },
    { id: "team", top: 4400 },
    { id: "billing", top: 5200 },
    { id: "metadata", top: 6000 },
  ];
  const viewportHeight = 800;
  const documentHeight = 6200;

  it("aligns visible nav order with exact DOM order for every role", () => {
    const adminIds = getVisibleNavIdsForRole("admin");
    expect(adminIds).toEqual([...DOM_SECTION_ORDER]);

    const csmIds = getVisibleNavIdsForRole("csm");
    expect(csmIds).toEqual([
      "overview",
      "recommendations",
      "customers",
      "roi",
      "cohorts",
      "metadata",
    ]);

    const analystIds = getVisibleNavIdsForRole("analyst");
    expect(analystIds).toEqual(["overview", "roi", "cohorts", "metadata"]);

    const viewerIds = getVisibleNavIdsForRole("viewer");
    expect(viewerIds).toEqual(["overview", "roi", "cohorts"]);

    // Verify every role's list is a strict subsequence of DOM_SECTION_ORDER
    for (const roleIds of [adminIds, csmIds, analystIds, viewerIds]) {
      const indices = roleIds.map(id => DOM_SECTION_ORDER.indexOf(id));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThan(indices[i - 1]);
      }
    }
  });

  it("returns the first visible section at the top of the page (scrollY <= 10)", () => {
    const visibleIds = getVisibleNavIdsForRole("admin");
    expect(
      computeActiveSection({
        sections: mockSections,
        visibleIds,
        scrollY: 0,
        viewportHeight,
        documentHeight,
      })
    ).toBe("overview");

    expect(
      computeActiveSection({
        sections: mockSections,
        visibleIds,
        scrollY: 10,
        viewportHeight,
        documentHeight,
      })
    ).toBe("overview");
  });

  it.each([
    { scrollY: 400, expected: "recommendations" }, // 400 + 280 = 680 >= 600
    { scrollY: 1000, expected: "customers" },      // 1000 + 280 = 1280 >= 1200
    { scrollY: 1800, expected: "roi" },            // 1800 + 280 = 2080 >= 2000
    { scrollY: 2600, expected: "cohorts" },        // 2600 + 280 = 2880 >= 2800
    { scrollY: 3400, expected: "integrations" },   // 3400 + 280 = 3680 >= 3600
    { scrollY: 4200, expected: "team" },           // 4200 + 280 = 4480 >= 4400
    { scrollY: 5000, expected: "billing" },        // 5000 + 280 = 5280 >= 5200
  ])("selects section '$expected' when scrolled to scrollY=$scrollY", ({ scrollY, expected }) => {
    const visibleIds = getVisibleNavIdsForRole("admin");
    expect(
      computeActiveSection({
        sections: mockSections,
        visibleIds,
        scrollY,
        viewportHeight,
        documentHeight,
      })
    ).toBe(expected);
  });

  it("selects the last visible section at the bottom of the page per role", () => {
    // Admin bottom -> metadata
    expect(
      computeActiveSection({
        sections: mockSections,
        visibleIds: getVisibleNavIdsForRole("admin"),
        scrollY: documentHeight - viewportHeight,
        viewportHeight,
        documentHeight,
      })
    ).toBe("metadata");

    // CSM bottom -> metadata
    expect(
      computeActiveSection({
        sections: mockSections.filter(s =>
          getVisibleNavIdsForRole("csm").includes(s.id as any)
        ),
        visibleIds: getVisibleNavIdsForRole("csm"),
        scrollY: 5400,
        viewportHeight,
        documentHeight,
      })
    ).toBe("metadata");

    // Analyst bottom -> metadata
    expect(
      computeActiveSection({
        sections: mockSections.filter(s =>
          getVisibleNavIdsForRole("analyst").includes(s.id as any)
        ),
        visibleIds: getVisibleNavIdsForRole("analyst"),
        scrollY: 5400,
        viewportHeight,
        documentHeight,
      })
    ).toBe("metadata");

    // Viewer bottom -> cohorts (since metadata, admin, recommendations, customers are hidden)
    const viewerDocHeight = 3100;
    expect(
      computeActiveSection({
        sections: mockSections,
        visibleIds: getVisibleNavIdsForRole("viewer"),
        scrollY: viewerDocHeight - viewportHeight,
        viewportHeight,
        documentHeight: viewerDocHeight,
      })
    ).toBe("cohorts");
  });

  it("never selects hidden sections for restricted roles even if present in input", () => {
    const viewerIds = getVisibleNavIdsForRole("viewer");
    // At scrollY where "integrations" (3600) or "customers" (1200) would trigger for admin
    expect(
      computeActiveSection({
        sections: mockSections,
        visibleIds: viewerIds,
        scrollY: 1000,
        viewportHeight,
        documentHeight,
      })
    ).toBe("overview");

    expect(
      computeActiveSection({
        sections: mockSections,
        visibleIds: viewerIds,
        scrollY: 3400,
        viewportHeight,
        documentHeight,
      })
    ).toBe("cohorts");
  });
});
