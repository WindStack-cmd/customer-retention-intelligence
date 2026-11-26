import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { tenantStorage, type Role } from "./tenantStorage";

type RoleExpectation = Record<Role, "allow" | "FORBIDDEN">;

interface MatrixEntry {
  group: string;
  name: string;
  invoke: (caller: ReturnType<typeof appRouter.createCaller>) => Promise<unknown>;
  expected: RoleExpectation;
}

describe("Permission Matrix RBAC Verification", () => {
  const ws = tenantStorage.createWorkspace({
    name: "Permission Matrix WS",
    plan: "enterprise",
    userId: 700,
  });
  tenantStorage.populateSampleCustomers(ws.id, 5);

  const roles: Role[] = ["admin", "csm", "analyst", "viewer"];

  function createRoleCaller(role: Role, userId: number) {
    return appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: {
        id: userId,
        openId: `${role}-matrix-user`,
        name: role.toUpperCase(),
        role: role === "admin" ? "admin" : "user",
        email: `${role}@matrix.test`,
      } as any,
      workspace: ws,
      membership: {
        id: userId,
        workspaceId: ws.id,
        userId,
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      role,
    });
  }

  const callers: Record<Role, ReturnType<typeof appRouter.createCaller>> = {
    admin: createRoleCaller("admin", 701),
    csm: createRoleCaller("csm", 702),
    analyst: createRoleCaller("analyst", 703),
    viewer: createRoleCaller("viewer", 704),
  };

  const matrix: MatrixEntry[] = [
    // 1. Admin-only group
    {
      group: "Admin: Team & Invites",
      name: "workspace.members",
      invoke: c => c.workspace.members(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Team & Invites",
      name: "workspace.invite",
      invoke: c => c.workspace.invite({ email: "invite@matrix.test", role: "viewer" }),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Integrations & API Keys",
      name: "integrations.status",
      invoke: c => c.integrations.status(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Integrations & API Keys",
      name: "integrations.apiKeys",
      invoke: c => c.integrations.apiKeys(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Integrations & API Keys",
      name: "integrations.events",
      invoke: c => c.integrations.events(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Scoring Runs & Sync",
      name: "integrations.scoringRuns",
      invoke: c => c.integrations.scoringRuns(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Scoring Runs & Sync",
      name: "integrations.schedulerStatus",
      invoke: c => c.integrations.schedulerStatus(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Scoring Runs & Sync",
      name: "integrations.triggerScoring",
      invoke: c => c.integrations.triggerScoring(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Scoring Runs & Sync",
      name: "integrations.triggerSync",
      invoke: c => c.integrations.triggerSync({ source: "sample" }),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Billing",
      name: "billing.plans",
      invoke: c => c.billing.plans(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: Billing",
      name: "billing.subscription",
      invoke: c => c.billing.subscription(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: SSO, Audit & GDPR",
      name: "security.ssoConfig",
      invoke: c => c.security.ssoConfig(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: SSO, Audit & GDPR",
      name: "security.auditLogs",
      invoke: c => c.security.auditLogs(),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "Admin: SSO, Audit & GDPR",
      name: "security.gdprExport",
      invoke: c => c.security.gdprExport({ customerId: 17850 }),
      expected: { admin: "allow", csm: "FORBIDDEN", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },

    // 2. CSM group (customers, notes, playbooks, alerts view)
    {
      group: "CSM: Customers",
      name: "analytics.customers",
      invoke: c => c.analytics.customers({ page: 1, pageSize: 5 }),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Customers",
      name: "analytics.recommendations",
      invoke: c => c.analytics.recommendations({ page: 1, pageSize: 5 }),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Customers",
      name: "analytics.shapWaterfall",
      invoke: c => c.analytics.shapWaterfall({ customerId: 17850 }),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Customers",
      name: "analytics.journeyTimeline",
      invoke: c => c.analytics.journeyTimeline({ customerId: 17850 }),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Notes",
      name: "actions.notes",
      invoke: c => c.actions.notes({ customerId: 17850 }),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Notes",
      name: "actions.addNote",
      invoke: c => c.actions.addNote({ customerId: 17850, note: "Matrix note" }),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Playbooks",
      name: "actions.playbooks",
      invoke: c => c.actions.playbooks(),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Playbooks",
      name: "actions.interventions",
      invoke: c => c.actions.interventions(),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Playbooks",
      name: "actions.executePlaybook",
      invoke: c =>
        c.actions.executePlaybook({
          customerId: 17850,
          sourceCustomerId: "17850",
          playbookType: "winback-discount-15",
        }),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },
    {
      group: "CSM: Alerts View",
      name: "actions.alerts",
      invoke: c => c.actions.alerts(),
      expected: { admin: "allow", csm: "allow", analyst: "FORBIDDEN", viewer: "FORBIDDEN" },
    },

    // 3. Analyst group (model/data-quality views & AI analyst)
    {
      group: "Analyst: Model & Data Quality",
      name: "analytics.dataQuality",
      invoke: c => c.analytics.dataQuality(),
      expected: { admin: "allow", csm: "allow", analyst: "allow", viewer: "FORBIDDEN" },
    },
    {
      group: "Analyst: Model & Data Quality",
      name: "analytics.modelRuns",
      invoke: c => c.analytics.modelRuns(),
      expected: { admin: "allow", csm: "allow", analyst: "allow", viewer: "FORBIDDEN" },
    },
    {
      group: "Analyst: Model & Data Quality",
      name: "analyst.quota",
      invoke: c => c.analyst.quota(),
      expected: { admin: "allow", csm: "allow", analyst: "allow", viewer: "FORBIDDEN" },
    },

    // 4. Viewer group (read-only high-level metrics)
    {
      group: "Viewer: High-Level Metrics",
      name: "workspace.current",
      invoke: c => c.workspace.current(),
      expected: { admin: "allow", csm: "allow", analyst: "allow", viewer: "allow" },
    },
    {
      group: "Viewer: High-Level Metrics",
      name: "analytics.executiveOverview",
      invoke: c => c.analytics.executiveOverview(),
      expected: { admin: "allow", csm: "allow", analyst: "allow", viewer: "allow" },
    },
    {
      group: "Viewer: High-Level Metrics",
      name: "analytics.cohortHeatmap",
      invoke: c => c.analytics.cohortHeatmap(),
      expected: { admin: "allow", csm: "allow", analyst: "allow", viewer: "allow" },
    },
    {
      group: "Viewer: High-Level Metrics",
      name: "actions.roiSummary",
      invoke: c => c.actions.roiSummary(),
      expected: { admin: "allow", csm: "allow", analyst: "allow", viewer: "allow" },
    },
  ];

  const cases = matrix.flatMap(entry =>
    roles.map(role => ({
      ...entry,
      role,
      outcome: entry.expected[role],
    }))
  );

  it.each(cases)(
    "[$group] $name as $role -> $outcome",
    async ({ invoke, role, outcome }) => {
      const caller = callers[role];
      if (outcome === "FORBIDDEN") {
        await expect(invoke(caller)).rejects.toMatchObject({ code: "FORBIDDEN" });
      } else {
        const res = await invoke(caller);
        expect(res).toBeDefined();
      }
    }
  );
});
