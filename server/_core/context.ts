import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, Workspace, WorkspaceMember } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { isDevLike } from "./env";
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

  // Development auth bypass only active when explicitly enabled in dev-like development mode
  const isDevAuthBypass =
    isDevLike() &&
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "true";

  if (!user && isDevAuthBypass) {
    user = {
      id: 1,
      openId: "local-development-user",
      name: "Local Development User",
      email: "local-development@example.invalid",
      loginMethod: "local-development",
      role: "admin",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      lastSignedIn: new Date("2026-10-01T00:00:00Z"),
    } as User;
  }

  let membership: (WorkspaceMember & { userName?: string; userEmail?: string }) | null = null;
  let role: Role | null = null;

  if (user) {
    membership = tenantStorage.getMember(workspace.id, user.id);

    // Auto-admin for default workspace strictly restricted to explicit dev bypass or verified system admin
    if (
      !membership &&
      workspace.id === "ws_default" &&
      (isDevAuthBypass || user.role === "admin")
    ) {
      membership = {
        id: 1,
        workspaceId: "ws_default",
        userId: user.id,
        role: "admin",
        userName: user.name || "Local Development User",
        userEmail: user.email || "local-development@example.invalid",
        createdAt: new Date("2026-10-01T00:00:00Z"),
        updatedAt: new Date("2026-10-01T00:00:00Z"),
      };
    }

    role = membership ? (membership.role as Role) : null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    workspace,
    membership,
    role,
  };
}
