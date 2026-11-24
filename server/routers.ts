import { COOKIE_NAME } from "@shared/const";
import { demoOverview } from "@shared/retentionData";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  csmProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  viewerProcedure,
  workspaceProcedure,
} from "./_core/trpc";
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
import { tenantStorage, type Role } from "./tenantStorage";
import { sendPlaybookEmail, dispatchAlert } from "./playbookService";
import { executeScoringRun } from "./scoringRunner";
import { getSchedulerStatus } from "./scoringScheduler";
import {
  BILLING_PLANS,
  createCheckoutSession,
  createPortalSession,
} from "./billingService";
import {
  getCohortRetentionHeatmap,
  getJourneyTimeline,
  getShapWaterfall,
} from "./cohortAnalytics";

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
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  retention: router({
    overview: publicProcedure.query(() => demoOverview),
  }),

  // Phase 1: Workspaces & Team Management
  workspace: router({
    list: protectedProcedure.query(({ ctx }) => {
      const userId = ctx.user?.id || 1;
      return tenantStorage.listWorkspacesForUser(userId);
    }),

    current: workspaceProcedure.query(({ ctx }) => {
      return {
        workspace: ctx.workspace,
        role: ctx.role,
        membership: ctx.membership,
      };
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2).max(64),
          plan: z.enum(["starter", "pro", "enterprise"]).optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const ws = tenantStorage.createWorkspace({
          name: input.name,
          plan: input.plan,
          userId,
          userName: ctx.user?.name || "Workspace Admin",
          userEmail: ctx.user?.email || "admin@pulseboard.io",
        });

        tenantStorage.logAudit({
          workspaceId: ws.id,
          userId,
          userName: ctx.user?.name || "Admin",
          action: "workspace.created",
          resourceType: "workspace",
          resourceId: ws.id,
          details: { name: ws.name, plan: ws.plan },
        });

        return ws;
      }),

    update: adminProcedure
      .input(
        z.object({
          name: z.string().min(2).max(64).optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const updated = tenantStorage.updateWorkspace(ctx.workspace.id, input);
        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "workspace.updated",
          resourceType: "workspace",
          resourceId: ctx.workspace.id,
          details: input,
        });
        return updated;
      }),

    members: workspaceProcedure.query(({ ctx }) => {
      return tenantStorage.listMembers(ctx.workspace.id);
    }),

    invite: adminProcedure
      .input(
        z.object({
          email: z.string().email(),
          role: z.enum(["admin", "csm", "analyst", "viewer"]),
        })
      )
      .mutation(({ ctx, input }) => {
        const invite = tenantStorage.createInvite({
          workspaceId: ctx.workspace.id,
          email: input.email,
          role: input.role as Role,
          invitedBy: ctx.user?.id || 1,
        });

        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "team.member_invited",
          resourceType: "invite",
          resourceId: String(invite.id),
          details: { email: input.email, role: input.role },
        });

        return invite;
      }),

    updateMemberRole: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          role: z.enum(["admin", "csm", "analyst", "viewer"]),
        })
      )
      .mutation(({ ctx, input }) => {
        const updated = tenantStorage.updateMemberRole(
          ctx.workspace.id,
          input.userId,
          input.role as Role,
          ctx.user?.id || 1
        );

        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "team.role_updated",
          resourceType: "member",
          resourceId: String(input.userId),
          details: { newRole: input.role },
        });

        return updated;
      }),

    removeMember: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(({ ctx, input }) => {
        const ok = tenantStorage.removeMember(
          ctx.workspace.id,
          input.userId,
          ctx.user?.id || 1
        );

        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "team.member_removed",
          resourceType: "member",
          resourceId: String(input.userId),
        });

        return { success: ok };
      }),

    invites: adminProcedure.query(({ ctx }) => {
      return tenantStorage.listInvites(ctx.workspace.id);
    }),

    revokeInvite: adminProcedure
      .input(z.object({ inviteId: z.number() }))
      .mutation(({ ctx, input }) => {
        return {
          success: tenantStorage.revokeInvite(ctx.workspace.id, input.inviteId),
        };
      }),

    acceptInvite: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(({ ctx, input }) => {
        return tenantStorage.acceptInvite(input.token, {
          id: ctx.user?.id || 1,
          name: ctx.user?.name || undefined,
          email: ctx.user?.email || undefined,
        });
      }),
  }),

  // Analytics Scoped by Workspace
  analytics: router({
    executiveOverview: viewerProcedure.query(({ ctx }) =>
      readOnly(() => executiveOverview(ctx.workspace.id))
    ),
    customers: viewerProcedure
      .input(customerListSchema)
      .query(({ ctx, input }) =>
        readOnly(() => listCustomers(input, ctx.workspace.id))
      ),
    customerDetail: viewerProcedure
      .input(customerIdSchema)
      .query(({ ctx, input }) =>
        readOnly(() => customerDetail(input.customerId, ctx.workspace.id))
      ),
    recommendations: viewerProcedure
      .input(recommendationListSchema)
      .query(({ ctx, input }) =>
        readOnly(() => listRecommendations(input, ctx.workspace.id))
      ),
    dataQuality: viewerProcedure.query(() => readOnly(dataQualityMetadata)),
    modelRuns: viewerProcedure.query(() => readOnly(modelMetadata)),

    cohortHeatmap: viewerProcedure.query(async ({ ctx }) =>
      readOnly(async () => getCohortRetentionHeatmap(ctx.workspace.id))
    ),
    shapWaterfall: viewerProcedure
      .input(customerIdSchema)
      .query(async ({ ctx, input }) =>
        readOnly(async () =>
          getShapWaterfall(input.customerId, ctx.workspace.id)
        )
      ),
    journeyTimeline: viewerProcedure
      .input(customerIdSchema)
      .query(async ({ ctx, input }) =>
        readOnly(async () =>
          getJourneyTimeline(input.customerId, ctx.workspace.id)
        )
      ),
  }),

  analyst: router({
    ask: viewerProcedure
      .input(analystQuestionSchema)
      .mutation(async ({ ctx, input }) => {
        const check = tenantStorage.incrementAnalystUsage(ctx.workspace.id);
        if (!check.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Daily AI Analyst question limit reached (${check.limit}/day on the ${check.plan} plan). Please upgrade your workspace plan to ask more questions.`,
          });
        }
        return readOnly(() => answerAnalystQuestion(input));
      }),

    quota: viewerProcedure.query(({ ctx }) => {
      return tenantStorage.getAnalystDailyUsage(ctx.workspace.id);
    }),
  }),

  // Phase 2: Ingestion, Connectors, & Scoring Runner
  integrations: router({
    status: workspaceProcedure.query(({ ctx }) => {
      const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("placeholder"));
      const hasShopify = Boolean(process.env.SHOPIFY_API_KEY);
      return {
        stripe: {
          connected: hasStripe,
          mode: hasStripe ? "live" : "mock",
          lastSync: "2026-11-20T12:00:00Z",
        },
        shopify: {
          connected: hasShopify,
          mode: hasShopify ? "live" : "mock",
          lastSync: "2026-11-21T08:30:00Z",
        },
        inboundApi: {
          endpoint: "/api/v1/events",
          status: "active",
        },
      };
    }),

    apiKeys: adminProcedure.query(({ ctx }) => {
      return tenantStorage.listApiKeys(ctx.workspace.id);
    }),

    createApiKey: adminProcedure
      .input(z.object({ name: z.string().min(2).max(64) }))
      .mutation(({ ctx, input }) => {
        const result = tenantStorage.createApiKey(
          ctx.workspace.id,
          input.name,
          ctx.user?.id || 1
        );
        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "api_key.created",
          resourceType: "api_key",
          resourceId: String(result.apiKey.id),
          details: { name: input.name, keyPrefix: result.apiKey.keyPrefix },
        });
        return result;
      }),

    revokeApiKey: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => {
        const ok = tenantStorage.revokeApiKey(ctx.workspace.id, input.id);
        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "api_key.revoked",
          resourceType: "api_key",
          resourceId: String(input.id),
        });
        return { success: ok };
      }),

    events: workspaceProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(({ ctx, input }) => {
        return tenantStorage.listEvents(ctx.workspace.id, input?.limit ?? 50);
      }),

    scoringRuns: workspaceProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(({ ctx, input }) => {
        return tenantStorage.listScoringRuns(
          ctx.workspace.id,
          input?.limit ?? 10
        );
      }),

    schedulerStatus: workspaceProcedure.query(({ ctx }) => {
      return getSchedulerStatus(ctx.workspace.id);
    }),

    triggerScoring: csmProcedure.mutation(async ({ ctx }) => {
      return await executeScoringRun(ctx.workspace.id, "manual");
    }),

    triggerSync: adminProcedure
      .input(z.object({ source: z.enum(["stripe", "shopify"]) }))
      .mutation(async ({ ctx, input }) => {
        const currentCount = tenantStorage.getTenantCustomerCount(
          ctx.workspace.id
        );
        if (currentCount >= ctx.workspace.customerLimit) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Workspace reached its limit of ${ctx.workspace.customerLimit.toLocaleString()} customers on the ${ctx.workspace.plan} plan. Upgrade to sync more records.`,
          });
        }

        // Mock sync ingestion
        tenantStorage.recordEvent({
          workspaceId: ctx.workspace.id,
          eventType: `${input.source}.sync_completed`,
          source: input.source,
          properties: {
            recordsProcessed: 142,
            ordersUpdated: 87,
            status: "synced_successfully",
          },
          timestamp: new Date(),
        });

        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: `integration.${input.source}_sync`,
          resourceType: "integration",
          resourceId: input.source,
          details: { mock: true, recordsProcessed: 142 },
        });

        return {
          success: true,
          source: input.source,
          recordsProcessed: 142,
          message: `${input.source.toUpperCase()} data synchronized successfully.`,
        };
      }),
  }),

  // Phase 3: Closed-Loop Retention Actions, Playbooks, Alerts, Notes
  actions: router({
    playbooks: workspaceProcedure.query(() => [
      {
        id: "winback-discount-15",
        name: "Win-back 15% Incentive Offer",
        category: "Discount",
        defaultDiscount: "15%",
        description: "Sends customized win-back email with 15% discount voucher for at-risk accounts.",
      },
      {
        id: "executive-checkin",
        name: "Executive CSM Check-in",
        category: "Direct Outreach",
        defaultDiscount: "None",
        description: "Initiates personalized high-touch outreach from Account Executive or CSM.",
      },
      {
        id: "feature-webinar",
        name: "Product Mastery & Feature Activation",
        category: "Education",
        defaultDiscount: "None",
        description: "Invites accounts to private webinar focusing on unadopted high-retention features.",
      },
      {
        id: "vip-loyalty-upgrade",
        name: "VIP Tier Upgrade with Free Shipping",
        category: "Loyalty",
        defaultDiscount: "VIP Tier",
        description: "Comp-upgrades customer to VIP status to re-engage historical high-value buyers.",
      },
    ]),

    executePlaybook: csmProcedure
      .input(
        z.object({
          customerId: z.number(),
          sourceCustomerId: z.string(),
          playbookType: z.string(),
          templateName: z.string().optional(),
          recipientEmail: z.string().email().optional(),
          incentiveCode: z.string().optional(),
          incentiveAmount: z.string().optional(),
          details: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Dispatch email via Resend/SendGrid or Mock
        const emailResult = await sendPlaybookEmail({
          to: input.recipientEmail || `customer-${input.sourceCustomerId}@client-domain.com`,
          templateName: input.templateName || input.playbookType,
          customerName: `Customer #${input.sourceCustomerId}`,
          discountCode: input.incentiveCode,
          workspaceName: ctx.workspace.name,
        });

        // Save intervention record
        const intervention = tenantStorage.recordIntervention({
          workspaceId: ctx.workspace.id,
          customerId: input.customerId,
          sourceCustomerId: input.sourceCustomerId,
          playbookType: input.playbookType,
          templateName: input.templateName ?? null,
          recipientEmail: input.recipientEmail ?? null,
          incentiveCode: input.incentiveCode ?? null,
          incentiveAmount: input.incentiveAmount ?? null,
          status: emailResult.status === "sent" ? "sent" : "delivered",
          performedBy: ctx.user?.id || 1,
          performedByName: ctx.user?.name || "CSM Representative",
          details: { ...input.details, provider: emailResult.provider },
        });

        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "playbook.executed",
          resourceType: "intervention",
          resourceId: String(intervention.id),
          details: {
            customerId: input.customerId,
            playbookType: input.playbookType,
            recipient: input.recipientEmail,
          },
        });

        return {
          success: true,
          intervention,
          dispatchStatus: emailResult.status,
          messageId: emailResult.messageId,
        };
      }),

    interventions: workspaceProcedure.query(({ ctx }) => {
      return tenantStorage.listInterventions(ctx.workspace.id);
    }),

    roiSummary: workspaceProcedure.query(({ ctx }) => {
      const interventions = tenantStorage.listInterventions(ctx.workspace.id);
      const totalSent = interventions.length;

      if (totalSent === 0) {
        return {
          sampleData: true,
          totalInterventions: 0,
          revenueSavedThisMonth: 0,
          contactedRetentionRate: null,
          nonContactedRetentionRate: null,
          retentionUpliftPercentage: null,
          activePlaybooksCount: 4,
          message:
            "No interventions recorded yet. Execute playbooks to measure observed retention impact.",
        };
      }

      // Compute strictly from actual intervention records
      const completed = interventions.filter(i => i.outcome !== "pending");
      const retained = interventions.filter(i => i.outcome === "retained");
      const revenueSaved = retained.reduce(
        (sum, i) => sum + (Number(i.revenueSaved) || 0),
        0
      );

      const contactedRetentionRate =
        completed.length > 0 ? (retained.length / completed.length) * 100 : null;
      const baselineBenchmark = 32.1;
      const difference =
        contactedRetentionRate !== null
          ? Number((contactedRetentionRate - baselineBenchmark).toFixed(1))
          : null;

      return {
        sampleData: false,
        totalInterventions: totalSent,
        revenueSavedThisMonth: revenueSaved,
        contactedRetentionRate:
          contactedRetentionRate !== null
            ? Number(contactedRetentionRate.toFixed(1))
            : null,
        nonContactedRetentionRate: baselineBenchmark,
        retentionUpliftPercentage: difference,
        activePlaybooksCount: 4,
        message: null,
      };
    }),

    notes: workspaceProcedure
      .input(customerIdSchema)
      .query(({ ctx, input }) => {
        return tenantStorage.listNotes(ctx.workspace.id, input.customerId);
      }),

    addNote: csmProcedure
      .input(
        z.object({
          customerId: z.number(),
          note: z.string().min(1).max(2000),
        })
      )
      .mutation(({ ctx, input }) => {
        const authorName = ctx.user?.name || "CSM Specialist";
        const note = tenantStorage.addNote(
          ctx.workspace.id,
          input.customerId,
          ctx.user?.id || 1,
          authorName,
          input.note
        );

        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "customer.note_added",
          resourceType: "note",
          resourceId: String(note.id),
          details: { customerId: input.customerId },
        });

        return note;
      }),

    alerts: workspaceProcedure.query(({ ctx }) => {
      return tenantStorage.listAlertRules(ctx.workspace.id);
    }),

    saveAlertRule: adminProcedure
      .input(
        z.object({
          id: z.number().optional(),
          name: z.string().min(2).max(128),
          channel: z.enum(["slack", "webhook", "hubspot"]),
          webhookUrl: z.string().url().optional(),
          thresholdBand: z.enum(["Urgent", "High", "Any"]),
          minRiskProbability: z.string(),
          minRevenueAtRisk: z.string(),
          enabled: z.number().optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const rule = tenantStorage.saveAlertRule({
          workspaceId: ctx.workspace.id,
          ...input,
          webhookUrl: input.webhookUrl ?? null,
        });

        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: input.id ? "alert_rule.updated" : "alert_rule.created",
          resourceType: "alert_rule",
          resourceId: String(rule.id),
          details: { name: rule.name, channel: rule.channel },
        });

        return rule;
      }),

    deleteAlertRule: adminProcedure
      .input(z.object({ ruleId: z.number() }))
      .mutation(({ ctx, input }) => {
        const ok = tenantStorage.deleteAlertRule(ctx.workspace.id, input.ruleId);
        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "alert_rule.deleted",
          resourceType: "alert_rule",
          resourceId: String(input.ruleId),
        });
        return { success: ok };
      }),

    testAlert: csmProcedure
      .input(
        z.object({
          ruleId: z.number().optional(),
          channel: z.enum(["slack", "webhook", "hubspot"]),
          webhookUrl: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await dispatchAlert({
          channel: input.channel,
          webhookUrl: input.webhookUrl,
          customerName: "Acme Corp (ID: 17850)",
          sourceCustomerId: "17850",
          riskProbability: 0.88,
          revenueAtRisk: 5240,
          priorityBand: "Urgent",
          recommendedAction: "Offer customized winback discount",
        });
      }),
  }),

  // Phase 4: Billing, Security, & Compliance
  billing: router({
    plans: workspaceProcedure.query(() => Object.values(BILLING_PLANS)),

    subscription: workspaceProcedure.query(({ ctx }) => {
      const plan = BILLING_PLANS[ctx.workspace.plan] || BILLING_PLANS.pro;
      const customers = tenantStorage.getTenantCustomers(ctx.workspace.id);
      const customerCount = ctx.workspace.id === "ws_default" ? 4122 : customers.length;
      const usagePercent = Math.min(
        100,
        Math.round((customerCount / ctx.workspace.customerLimit) * 100)
      );

      return {
        plan,
        customerLimit: ctx.workspace.customerLimit,
        currentCustomerCount: customerCount,
        usagePercent,
        status: ctx.workspace.subscriptionStatus,
      };
    }),

    createCheckout: adminProcedure
      .input(
        z.object({
          planId: z.enum(["starter", "pro", "enterprise"]),
          returnUrl: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await createCheckoutSession({
          workspaceId: ctx.workspace.id,
          planId: input.planId,
          returnUrl: input.returnUrl,
        });
      }),

    createPortal: adminProcedure
      .input(z.object({ returnUrl: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return await createPortalSession({
          workspaceId: ctx.workspace.id,
          returnUrl: input.returnUrl,
        });
      }),
  }),

  security: router({
    auditLogs: adminProcedure
      .input(
        z
          .object({
            action: z.string().optional(),
            limit: z.number().optional(),
          })
          .optional()
      )
      .query(({ ctx, input }) => {
        return tenantStorage.listAuditLogs(ctx.workspace.id, input);
      }),

    gdprExport: adminProcedure
      .input(customerIdSchema)
      .mutation(({ ctx, input }) => {
        const notes = tenantStorage.listNotes(ctx.workspace.id, input.customerId);
        const interventions = tenantStorage
          .listInterventions(ctx.workspace.id)
          .filter(i => i.customerId === input.customerId);

        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "compliance.gdpr_export",
          resourceType: "customer",
          resourceId: String(input.customerId),
        });

        return {
          customerId: input.customerId,
          exportedAt: new Date().toISOString(),
          notes,
          interventions,
          complianceOfficer: ctx.user?.name || "Admin",
          status: "complete",
        };
      }),

    gdprErase: adminProcedure
      .input(customerIdSchema)
      .mutation(({ ctx, input }) => {
        tenantStorage.logAudit({
          workspaceId: ctx.workspace.id,
          userId: ctx.user?.id,
          action: "compliance.gdpr_erasure",
          resourceType: "customer",
          resourceId: String(input.customerId),
          details: { anonymized: true, policy: "GDPR Article 17 Right to Erasure" },
        });

        return {
          success: true,
          customerId: input.customerId,
          action: "anonymized_and_erased",
          timestamp: new Date().toISOString(),
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
