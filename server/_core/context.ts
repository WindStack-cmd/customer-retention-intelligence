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
  role: Role;
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
  const membership = tenantStorage.getMember(workspace.id, userId);
  let role: Role = membership ? (membership.role as Role) : "viewer";

  // Local development user or admin user is always admin of ws_default
  if (
    user?.role === "admin" ||
    userId === 1 ||
    user?.openId === "local-development-user"
  ) {
    if (workspace.id === "ws_default") {
      role = "admin";
    }
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
