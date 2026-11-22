import { describe, expect, it } from "vitest";
import { tenantStorage } from "./tenantStorage";

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
});
