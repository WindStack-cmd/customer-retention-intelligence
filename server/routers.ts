import { COOKIE_NAME } from "@shared/const";
import { demoOverview } from "@shared/retentionData";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  customerDetail,
  customerIdSchema,
  customerListSchema,
  dataQualityMetadata,
  executiveOverview,
  listCustomers,
  listRecommendations,
  modelMetadata,
  recommendationListSchema,
} from "./analyticsApi";
import { analystQuestionSchema, answerAnalystQuestion } from "./analyst";

async function readOnly<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error("[Analytics API] read failed", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to read analytics data",
    });
  }
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  retention: router({
    overview: publicProcedure.query(() => demoOverview),
  }),

  analytics: router({
    executiveOverview: protectedProcedure.query(() =>
      readOnly(executiveOverview)
    ),
    customers: protectedProcedure
      .input(customerListSchema)
      .query(({ input }) => readOnly(() => listCustomers(input))),
    customerDetail: protectedProcedure
      .input(customerIdSchema)
      .query(({ input }) => readOnly(() => customerDetail(input.customerId))),
    recommendations: protectedProcedure
      .input(recommendationListSchema)
      .query(({ input }) => readOnly(() => listRecommendations(input))),
    dataQuality: protectedProcedure.query(() => readOnly(dataQualityMetadata)),
    modelRuns: protectedProcedure.query(() => readOnly(modelMetadata)),
  }),

  analyst: router({
    ask: protectedProcedure
      .input(analystQuestionSchema)
      .mutation(({ input }) => readOnly(() => answerAnalystQuestion(input))),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
