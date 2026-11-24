import { describe, expect, it } from "vitest";
import { tenantStorage } from "./tenantStorage";
import { appRouter } from "./routers";
import { TRPCError } from "@trpc/server";

describe("Phase 1: Multi-Tenancy & RBAC", () => {
  it("initializes with Default Workspace and Local Development User as Admin", () => {
    const ws = tenantStorage.getWorkspace("ws_default");
    expect(ws).toBeDefined();
    expect(ws?.name).toBe("Default Workspace");

    const member = tenantStorage.getMember("ws_default", 1);
    expect(member).toBeDefined();
    expect(member?.role).toBe("admin");
  });

  it("lists workspaces for user including default workspace", () => {
    const workspaces = tenantStorage.listWorkspacesForUser(1);
    expect(workspaces.length).toBeGreaterThanOrEqual(1);
    expect(workspaces.some(w => w.id === "ws_default")).toBe(true);
    expect(workspaces.find(w => w.id === "ws_default")?.userRole).toBe("admin");
  });

  it("creates a new isolated workspace with the creator as admin", () => {
    const newWs = tenantStorage.createWorkspace({
      name: "Acme Corp SaaS",
      userId: 42,
      userName: "Jane Founder",
      userEmail: "jane@acmecorp.com",
    });

    expect(newWs.id).toMatch(/^ws_/);
    expect(newWs.name).toBe("Acme Corp SaaS");
    expect(newWs.userRole).toBe("admin");

    const fetched = tenantStorage.getWorkspace(newWs.id);
    expect(fetched?.name).toBe("Acme Corp SaaS");

    const member = tenantStorage.getMember(newWs.id, 42);
    expect(member?.role).toBe("admin");
    expect(member?.userName).toBe("Jane Founder");
  });

  it("manages invites and member roles securely", () => {
    const ws = tenantStorage.createWorkspace({
      name: "Team Test WS",
      userId: 99,
    });

    // Invite new CSM
    const invite = tenantStorage.createInvite({
      workspaceId: ws.id,
      email: "csm-agent@team.com",
      role: "csm",
      invitedBy: 99,
    });
    expect(invite.status).toBe("pending");
    expect(invite.role).toBe("csm");

    // Accept invite
    const accepted = tenantStorage.acceptInvite(invite.token, {
      id: 101,
      name: "Alex CSM",
      email: "csm-agent@team.com",
    });
    expect(accepted.role).toBe("csm");

    // Member listed
    const members = tenantStorage.listMembers(ws.id);
    expect(members.some(m => m.userId === 101 && m.role === "csm")).toBe(true);

    // Update role
    const updated = tenantStorage.updateMemberRole(ws.id, 101, "analyst", 99);
    expect(updated.role).toBe("analyst");

    // Remove member
    const removed = tenantStorage.removeMember(ws.id, 101, 99);
    expect(removed).toBe(true);
    const membersAfter = tenantStorage.listMembers(ws.id);
    expect(membersAfter.some(m => m.userId === 101)).toBe(false);
  });

  it("strictly blocks non-members from accessing workspace procedures (cross-tenant isolation)", async () => {
    const wsB = tenantStorage.createWorkspace({
      name: "Tenant B Secure",
      userId: 200,
    });

    // User 50 is NOT a member of Tenant B
    const nonMemberCaller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: 50, openId: "user-50", name: "Stranger", role: "user", email: "stranger@b.com" } as any,
      workspace: wsB,
      membership: null,
      role: null,
    });

    // Any workspace procedure should throw FORBIDDEN
    await expect(nonMemberCaller.workspace.current()).rejects.toThrowError(
      /You are not a member of this workspace/
    );
  });

  it("enforces RBAC role restrictions across viewer, csm, and admin", async () => {
    const ws = tenantStorage.createWorkspace({
      name: "RBAC Test Workspace",
      userId: 300,
    });

    // 1. Viewer caller
    const viewerCaller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: 301, openId: "viewer-1", name: "Viewer", role: "user", email: "viewer@test.com" } as any,
      workspace: ws,
      membership: { id: 10, workspaceId: ws.id, userId: 301, role: "viewer", createdAt: new Date(), updatedAt: new Date() },
      role: "viewer",
    });

    // Viewer cannot invite
    await expect(
      viewerCaller.workspace.invite({ email: "new@test.com", role: "viewer" })
    ).rejects.toThrow();

    // Viewer cannot execute playbooks
    await expect(
      viewerCaller.actions.executePlaybook({
        customerId: 17850,
        sourceCustomerId: "CUST17850",
        playbookType: "VIP Concierge Check-in",
      })
    ).rejects.toThrow();

    // 2. CSM caller
    const csmCaller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: 302, openId: "csm-1", name: "CSM", role: "user", email: "csm@test.com" } as any,
      workspace: ws,
      membership: { id: 11, workspaceId: ws.id, userId: 302, role: "csm", createdAt: new Date(), updatedAt: new Date() },
      role: "csm",
    });

    // CSM cannot invite or create API keys (admin only)
    await expect(
      csmCaller.workspace.invite({ email: "another@test.com", role: "viewer" })
    ).rejects.toThrow();
    await expect(
      csmCaller.integrations.createApiKey({ name: "Hacker Key" })
    ).rejects.toThrow();

    // CSM can execute playbooks
    const playbookRes = await csmCaller.actions.executePlaybook({
      customerId: 17850,
      sourceCustomerId: "CUST17850",
      playbookType: "VIP Concierge Check-in",
      notes: "High value outreach",
    });
    expect(playbookRes.success).toBe(true);

    // 3. Admin caller can invite and create API keys
    const adminCaller = appRouter.createCaller({
      req: {} as any,
      res: {} as any,
      user: { id: 300, openId: "admin-1", name: "Admin", role: "admin", email: "admin@test.com" } as any,
      workspace: ws,
      membership: { id: 1, workspaceId: ws.id, userId: 300, role: "admin", createdAt: new Date(), updatedAt: new Date() },
      role: "admin",
    });

    const inviteRes = await adminCaller.workspace.invite({
      email: "invited-by-admin@test.com",
      role: "analyst",
    });
    expect(inviteRes.email).toBe("invited-by-admin@test.com");
  });
});
