import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const workspaceProcedure = protectedProcedure.use(async opts => {
  const { ctx, next } = opts;

  if (!ctx.workspace) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Workspace not found",
    });
  }

  if (!ctx.membership || !ctx.role) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this workspace",
    });
  }

  return next({
    ctx: {
      ...ctx,
      workspace: ctx.workspace,
      membership: ctx.membership,
      role: ctx.role,
    },
  });
});

export const adminProcedure = workspaceProcedure.use(async opts => {
  const { ctx, next } = opts;

  if (ctx.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }

  return next({ ctx });
});

export const csmProcedure = workspaceProcedure.use(async opts => {
  const { ctx, next } = opts;

  if (ctx.role !== "admin" && ctx.role !== "csm") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSM or Admin permission required for this action",
    });
  }

  return next({ ctx });
});

export const analystProcedure = workspaceProcedure.use(async opts => {
  const { ctx, next } = opts;

  if (
    ctx.role !== "admin" &&
    ctx.role !== "csm" &&
    ctx.role !== "analyst"
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Analyst, CSM, or Admin permission required for this action",
    });
  }

  return next({ ctx });
});

export const viewerProcedure = workspaceProcedure.use(async opts => {
  const { ctx, next } = opts;

  const validRoles = ["admin", "csm", "analyst", "viewer"];
  if (!validRoles.includes(ctx.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Viewer permission required for this action",
    });
  }

  return next({ ctx });
});
