export type DashboardRole = "admin" | "csm" | "analyst" | "viewer";

/**
 * Exact top-to-bottom DOM order of navigable sections inside <main> in Home.tsx.
 * Sidebar navigation order MUST stay aligned with this array.
 */
export const DOM_SECTION_ORDER = [
  "overview",
  "recommendations",
  "customers",
  "roi",
  "cohorts",
  "integrations",
  "team",
  "billing",
  "metadata",
] as const;

export type NavSectionId = (typeof DOM_SECTION_ORDER)[number];

export interface SectionPosition {
  id: string;
  top: number;
}

export interface ActiveSectionParams {
  sections: SectionPosition[];
  visibleIds: readonly string[];
  scrollY: number;
  viewportHeight: number;
  documentHeight: number;
}

/**
 * Returns the list of navigable section IDs visible to a given workspace role,
 * strictly preserving DOM_SECTION_ORDER.
 */
export function getVisibleNavIdsForRole(
  role: DashboardRole | null | undefined,
  isSystemAdmin = false
): NavSectionId[] {
  const effectiveRole: DashboardRole = isSystemAdmin ? "admin" : (role ?? "viewer");
  const isAdmin = effectiveRole === "admin";
  const canViewCustomers = isAdmin || effectiveRole === "csm";
  const isViewer = effectiveRole === "viewer";

  return DOM_SECTION_ORDER.filter(id => {
    if (id === "recommendations" || id === "customers") return canViewCustomers;
    if (id === "integrations" || id === "team" || id === "billing") return isAdmin;
    if (id === "metadata") return !isViewer;
    return true;
  });
}

/**
 * Pure scroll-tracking calculation to determine the active navigation section.
 */
export function computeActiveSection({
  sections,
  visibleIds,
  scrollY,
  viewportHeight,
  documentHeight,
}: ActiveSectionParams): string | null {
  const visibleSet = new Set(visibleIds);
  const ordered = sections
    .filter(section => visibleSet.has(section.id))
    .sort((a, b) => a.top - b.top);

  if (ordered.length === 0) return null;

  // Scrolled to the very top: first visible section is active
  if (scrollY <= 10) {
    return ordered[0].id;
  }

  // Scrolled to the very bottom: last visible section is active
  if (scrollY + viewportHeight >= documentHeight - 15) {
    return ordered[ordered.length - 1].id;
  }

  // Active section = last section whose top edge has crossed the 35% viewport trigger line
  const triggerY = scrollY + viewportHeight * 0.35;
  let activeId = ordered[0].id;
  for (const section of ordered) {
    if (section.top <= triggerY) {
      activeId = section.id;
    }
  }
  return activeId;
}
