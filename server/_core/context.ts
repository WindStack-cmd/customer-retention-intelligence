import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, Workspace, WorkspaceMember } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { tenantStorage, type Role } from "../tenantStorage";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  workspace: Workspace;
  membership: (WorkspaceMember & { userName?: string; userEmail?: string }) | null;
  role: Role | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (_error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Extract requested workspaceId from headers, cookies, or query
  const reqWsHeader = opts.req.headers["x-workspace-id"];
  const wsId =
    typeof reqWsHeader === "string" && reqWsHeader ? reqWsHeader : "ws_default";

  let workspace = tenantStorage.getWorkspace(wsId);
  if (!workspace) {
    workspace = tenantStorage.getWorkspace("ws_default")!;
  }

  const userId = user ? user.id : 1;
  let membership = tenantStorage.getMember(workspace.id, userId);

  // Local development user or admin user is granted admin on default workspace
  if (
    !membership &&
    workspace.id === "ws_default" &&
    (userId === 1 ||
      user?.openId === "local-development-user" ||
      user?.role === "admin")
  ) {
    membership = {
      id: 1,
      workspaceId: "ws_default",
      userId,
      role: "admin",
      userName: user?.name || "Local Development User",
      userEmail: user?.email || "local-development@example.invalid",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    };
  }

  // If user is not a member of the requested workspace, role is null (strictly no default viewer access!)
  const role: Role | null = membership ? (membership.role as Role) : null;

  return {
    req: opts.req,
    res: opts.res,
    user,
    workspace,
    membership,
    role,
  };
}
