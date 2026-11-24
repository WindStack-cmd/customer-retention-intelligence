import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
  WorkspaceApiKey,
  WorkspaceEvent,
  ScoringRun,
  Intervention,
  CustomerNote,
  AlertRule,
  AuditLog,
} from "../drizzle/schema";

export type Role = "admin" | "csm" | "analyst" | "viewer";

export interface WorkspaceWithRole extends Workspace {
  userRole: Role;
}

export interface MemberDetail extends WorkspaceMember {
  userName: string;
  userEmail: string;
}

const CACHE_FILE = path.resolve(process.env.TENANT_CACHE_FILE ?? "data/tenants_cache.json");

interface TenantCacheData {
  workspaces: Workspace[];
  members: (WorkspaceMember & { userName?: string; userEmail?: string })[];
  invites: WorkspaceInvite[];
  apiKeys: WorkspaceApiKey[];
  events: WorkspaceEvent[];
  scoringRuns: ScoringRun[];
  interventions: Intervention[];
  notes: CustomerNote[];
  alertRules: AlertRule[];
  auditLogs: AuditLog[];
  tenantCustomers: Record<string, any[]>;
  analystDailyUsage?: Record<string, number>;
  integrationsConfig?: Record<
    string,
    Record<
      string,
      {
        connected: boolean;
        mode: "mock" | "live";
        apiKeyMasked?: string;
        webhookUrl?: string;
        lastSyncAt?: string;
      }
    >
  >;
}

export const ANALYST_DAILY_LIMITS: Record<string, number> = {
  starter: 20,
  pro: 200,
  enterprise: 999999,
};

function loadInitialData(): TenantCacheData {
  const defaultWs: Workspace = {
    id: "ws_default",
    name: "Default Workspace",
    slug: "default",
    plan: "pro",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: "active",
    customerLimit: 10000,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };

  const defaultAdminMember: WorkspaceMember & { userName: string; userEmail: string } = {
    id: 1,
    workspaceId: "ws_default",
    userId: 1,
    role: "admin",
    userName: "Local Development User",
    userEmail: "local-development@example.invalid",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };

  const defaultAlertRules: AlertRule[] = [
    {
      id: 1,
      workspaceId: "ws_default",
      name: "Urgent Risk Slack Alert",
      channel: "slack",
      webhookUrl: "https://hooks.slack.com/services/MOCK/WEBHOOK/URL",
      thresholdBand: "Urgent",
      minRiskProbability: "0.7500",
      minRevenueAtRisk: "1500.00",
      enabled: 1,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
  ];

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      // Ensure default workspace and admin member always exist
      if (!parsed.workspaces?.some((w: Workspace) => w.id === "ws_default")) {
        parsed.workspaces = [defaultWs, ...(parsed.workspaces || [])];
      }
      if (!parsed.members?.some((m: WorkspaceMember) => m.workspaceId === "ws_default" && m.userId === 1)) {
        parsed.members = [defaultAdminMember, ...(parsed.members || [])];
      }
      if (!parsed.alertRules) parsed.alertRules = defaultAlertRules;
      if (!parsed.tenantCustomers) parsed.tenantCustomers = {};
      if (!parsed.analystDailyUsage) parsed.analystDailyUsage = {};
      if (!parsed.integrationsConfig) parsed.integrationsConfig = {};
      return parsed;
    } catch {
      // Corrupt cache file, start fresh
    }
  }

  return {
    workspaces: [defaultWs],
    members: [defaultAdminMember],
    invites: [],
    apiKeys: [],
    events: [],
    scoringRuns: [],
    interventions: [],
    notes: [],
    alertRules: defaultAlertRules,
    auditLogs: [],
    tenantCustomers: {},
    analystDailyUsage: {},
    integrationsConfig: {},
  };
}

class TenantStorage {
  private data: TenantCacheData;

  constructor() {
    this.data = loadInitialData();
  }

  private save() {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (err) {
      console.warn("[TenantStorage] Failed to persist cache:", err);
    }
  }

  // Workspaces
  listAllWorkspaces(): Workspace[] {
    return [...this.data.workspaces];
  }

  getWorkspace(id: string): Workspace | null {
    return this.data.workspaces.find(w => w.id === id) ?? null;
  }

  getWorkspaceBySlug(slug: string): Workspace | null {
    return this.data.workspaces.find(w => w.slug === slug) ?? null;
  }

  listWorkspacesForUser(userId: number): WorkspaceWithRole[] {
    const userMemberships = this.data.members.filter(m => m.userId === userId);
    const result: WorkspaceWithRole[] = [];

    for (const membership of userMemberships) {
      const ws = this.getWorkspace(membership.workspaceId);
      if (ws) {
        result.push({
          ...ws,
          userRole: membership.role as Role,
        });
      }
    }

    // Always include Default Workspace for local development user or fallback
    if (result.length === 0 || !result.some(w => w.id === "ws_default")) {
      const defaultWs = this.getWorkspace("ws_default")!;
      result.unshift({
        ...defaultWs,
        userRole: "admin",
      });
    }

    return result;
  }

  createWorkspace(params: {
    name: string;
    slug?: string;
    plan?: "starter" | "pro" | "enterprise";
    userId: number;
    userName?: string;
    userEmail?: string;
  }): WorkspaceWithRole {
    const id = `ws_${crypto.randomBytes(6).toString("hex")}`;
    const baseSlug = (params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "");
    let slug = baseSlug || "workspace";
    let counter = 1;
    while (this.data.workspaces.some(w => w.slug === slug)) {
      slug = `${baseSlug}-${counter++}`;
    }

    const plan = params.plan ?? "starter";
    const customerLimits = { starter: 1000, pro: 10000, enterprise: 100000 };

    const workspace: Workspace = {
      id,
      name: params.name,
      slug,
      plan,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: "active",
      customerLimit: customerLimits[plan],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.data.workspaces.push(workspace);

    const member: WorkspaceMember & { userName: string; userEmail: string } = {
      id: this.data.members.length + 1,
      workspaceId: id,
      userId: params.userId,
      role: "admin",
      userName: params.userName || `User ${params.userId}`,
      userEmail: params.userEmail || `user${params.userId}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.data.members.push(member);
    this.save();

    return {
      ...workspace,
      userRole: "admin",
    };
  }

  updateWorkspace(id: string, updates: Partial<Pick<Workspace, "name" | "plan" | "customerLimit" | "subscriptionStatus" | "stripeCustomerId" | "stripeSubscriptionId">>): Workspace {
    const ws = this.getWorkspace(id);
    if (!ws) throw new Error("Workspace not found");

    Object.assign(ws, updates, { updatedAt: new Date() });
    this.save();
    return ws;
  }

  updateSubscription(
    workspaceId: string,
    updates: {
      plan?: "starter" | "pro" | "enterprise";
      subscriptionStatus?: string;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      customerLimit?: number;
    }
  ): Workspace {
    const ws = this.getWorkspace(workspaceId);
    if (!ws) throw new Error("Workspace not found");
    if (updates.plan) {
      ws.plan = updates.plan;
      if (updates.customerLimit === undefined) {
        ws.customerLimit =
          updates.plan === "starter"
            ? 1000
            : updates.plan === "enterprise"
              ? 100000
              : 10000;
      }
    }
    if (updates.customerLimit !== undefined) ws.customerLimit = updates.customerLimit;
    if (updates.subscriptionStatus !== undefined)
      ws.subscriptionStatus = updates.subscriptionStatus;
    if (updates.stripeCustomerId !== undefined)
      ws.stripeCustomerId = updates.stripeCustomerId;
    if (updates.stripeSubscriptionId !== undefined)
      ws.stripeSubscriptionId = updates.stripeSubscriptionId;
    ws.updatedAt = new Date();
    this.save();
    return ws;
  }

  findWorkspaceByStripeCustomer(
    stripeCustomerId: string
  ): Workspace | undefined {
    return this.data.workspaces.find(
      w => w.stripeCustomerId === stripeCustomerId
    );
  }

  findWorkspaceByStripeSubscription(
    stripeSubscriptionId: string
  ): Workspace | undefined {
    return this.data.workspaces.find(
      w => w.stripeSubscriptionId === stripeSubscriptionId
    );
  }

  // Memberships & Roles
  getMember(workspaceId: string, userId: number): (WorkspaceMember & { userName: string; userEmail: string }) | null {
    // Local development user is always admin of ws_default
    if (workspaceId === "ws_default" && (userId === 1 || userId <= 0)) {
      return {
        id: 1,
        workspaceId: "ws_default",
        userId: 1,
        role: "admin",
        userName: "Local Development User",
        userEmail: "local-development@example.invalid",
        createdAt: new Date("2026-10-01T00:00:00Z"),
        updatedAt: new Date("2026-10-01T00:00:00Z"),
      };
    }
    return (this.data.members.find(m => m.workspaceId === workspaceId && m.userId === userId) as any) ?? null;
  }

  listMembers(workspaceId: string): MemberDetail[] {
    return this.data.members
      .filter(m => m.workspaceId === workspaceId)
      .map(m => ({
        ...m,
        userName: m.userName || `User ${m.userId}`,
        userEmail: m.userEmail || `user${m.userId}@company.com`,
      }));
  }

  addMember(workspaceId: string, user: { id: number; name?: string; email?: string }, role: Role): MemberDetail {
    const existing = this.getMember(workspaceId, user.id);
    if (existing) {
      existing.role = role;
      existing.updatedAt = new Date();
      this.save();
      return existing;
    }

    const member: WorkspaceMember & { userName: string; userEmail: string } = {
      id: this.data.members.length + 1,
      workspaceId,
      userId: user.id,
      role,
      userName: user.name || `User ${user.id}`,
      userEmail: user.email || `user${user.id}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.data.members.push(member);
    this.save();
    return member;
  }

  updateMemberRole(workspaceId: string, targetUserId: number, newRole: Role, requesterUserId: number): MemberDetail {
    if (targetUserId === requesterUserId && newRole !== "admin") {
      const admins = this.data.members.filter(m => m.workspaceId === workspaceId && m.role === "admin");
      if (admins.length <= 1) {
        throw new Error("Cannot demote the only workspace Admin");
      }
    }

    const member = this.data.members.find(m => m.workspaceId === workspaceId && m.userId === targetUserId);
    if (!member) throw new Error("Member not found in workspace");

    member.role = newRole;
    member.updatedAt = new Date();
    this.save();
    return {
      ...member,
      userName: member.userName || `User ${member.userId}`,
      userEmail: member.userEmail || `user${member.userId}@example.com`,
    };
  }

  removeMember(workspaceId: string, targetUserId: number, requesterUserId: number): boolean {
    if (targetUserId === requesterUserId) {
      throw new Error("Cannot remove yourself from workspace");
    }

    const index = this.data.members.findIndex(m => m.workspaceId === workspaceId && m.userId === targetUserId);
    if (index === -1) return false;

    this.data.members.splice(index, 1);
    this.save();
    return true;
  }

  // Invites
  createInvite(params: {
    workspaceId: string;
    email: string;
    role: Role;
    invitedBy: number;
  }): WorkspaceInvite {
    // Check if email already member
    const existingMember = this.data.members.find(
      m => m.workspaceId === params.workspaceId && m.userEmail?.toLowerCase() === params.email.toLowerCase()
    );
    if (existingMember) {
      throw new Error("This user is already a member of this workspace");
    }

    const token = `inv_${crypto.randomBytes(24).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite: WorkspaceInvite = {
      id: this.data.invites.length + 1,
      workspaceId: params.workspaceId,
      email: params.email.toLowerCase().trim(),
      role: params.role,
      token,
      invitedBy: params.invitedBy,
      status: "pending",
      expiresAt,
      createdAt: new Date(),
    };

    this.data.invites.push(invite);
    this.save();
    return invite;
  }

  listInvites(workspaceId: string): WorkspaceInvite[] {
    return this.data.invites.filter(i => i.workspaceId === workspaceId && i.status === "pending");
  }

  revokeInvite(workspaceId: string, inviteId: number): boolean {
    const invite = this.data.invites.find(i => i.workspaceId === workspaceId && i.id === inviteId);
    if (!invite) return false;
    invite.status = "revoked";
    this.save();
    return true;
  }

  acceptInvite(token: string, user: { id: number; name?: string; email?: string }): { workspace: Workspace; role: Role } {
    const invite = this.data.invites.find(i => i.token === token && i.status === "pending");
    if (!invite) throw new Error("Invalid or expired invite token");

    if (new Date(invite.expiresAt) < new Date()) {
      invite.status = "revoked";
      this.save();
      throw new Error("Invite token has expired");
    }

    const ws = this.getWorkspace(invite.workspaceId);
    if (!ws) throw new Error("Workspace no longer exists");

    this.addMember(ws.id, user, invite.role as Role);
    invite.status = "accepted";
    this.save();

    return { workspace: ws, role: invite.role as Role };
  }

  // API Keys
  createApiKey(workspaceId: string, name: string, userId: number): { apiKey: WorkspaceApiKey; rawSecret: string } {
    const secretPart = crypto.randomBytes(24).toString("hex");
    const rawSecret = `pk_live_${secretPart}`;
    const keyPrefix = rawSecret.slice(0, 12);
    const keyHash = crypto.createHash("sha256").update(rawSecret).digest("hex");

    const key: WorkspaceApiKey = {
      id: this.data.apiKeys.length + 1,
      workspaceId,
      name,
      keyPrefix,
      keyHash,
      createdBy: userId,
      revokedAt: null,
      createdAt: new Date(),
    };

    this.data.apiKeys.push(key);
    this.save();
    return { apiKey: key, rawSecret };
  }

  listApiKeys(workspaceId: string): WorkspaceApiKey[] {
    return this.data.apiKeys.filter(k => k.workspaceId === workspaceId && !k.revokedAt);
  }

  revokeApiKey(workspaceId: string, keyId: number): boolean {
    const key = this.data.apiKeys.find(k => k.workspaceId === workspaceId && k.id === keyId);
    if (!key) return false;
    key.revokedAt = new Date();
    this.save();
    return true;
  }

  verifyApiKey(rawSecret: string): WorkspaceApiKey | null {
    const keyHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
    const key = this.data.apiKeys.find(k => k.keyHash === keyHash && !k.revokedAt);
    return key ?? null;
  }

  // Events
  recordEvent(event: {
    workspaceId: string;
    eventType: string;
    customerId?: string | number | null;
    properties?: any;
    source?: string;
    timestamp?: Date;
  }): WorkspaceEvent {
    const entry: WorkspaceEvent = {
      id: this.data.events.length + 1,
      workspaceId: event.workspaceId,
      eventType: event.eventType,
      customerId: event.customerId != null ? String(event.customerId) : null,
      properties: event.properties
        ? typeof event.properties === "string"
          ? event.properties
          : JSON.stringify(event.properties)
        : null,
      source: event.source || "api",
      timestamp: event.timestamp || new Date(),
      createdAt: new Date(),
    };
    this.data.events.push(entry);
    this.save();
    return entry;
  }

  listEvents(workspaceId: string, limit = 50): WorkspaceEvent[] {
    return this.data.events
      .filter(e => e.workspaceId === workspaceId)
      .slice(-limit)
      .reverse();
  }

  // Scoring Runs
  createScoringRun(workspaceId: string, triggerType: "scheduled" | "manual" | "sync"): ScoringRun {
    // Expire stale runs older than 30 minutes
    const staleThreshold = Date.now() - 30 * 60 * 1000;
    for (const r of this.data.scoringRuns) {
      if (
        r.workspaceId === workspaceId &&
        (r.status === "running" || r.status === "pending") &&
        new Date(r.startedAt).getTime() < staleThreshold
      ) {
        r.status = "failed";
        r.error = "Scoring run timed out (stale execution)";
        r.completedAt = new Date();
      }
    }

    // Ensure no job is currently running for this tenant
    const active = this.data.scoringRuns.find(
      r => r.workspaceId === workspaceId && (r.status === "running" || r.status === "pending")
    );
    if (active) {
      throw new Error("A scoring run is already active for this workspace");
    }

    const run: ScoringRun = {
      id: this.data.scoringRuns.length + 1,
      workspaceId,
      status: "running",
      triggerType,
      customersScored: 0,
      revenueAtRisk: "0.00",
      summary: null,
      startedAt: new Date(),
      completedAt: null,
      error: null,
    };
    this.data.scoringRuns.push(run);
    this.save();
    return run;
  }

  completeScoringRun(runId: number, result: { customersScored: number; revenueAtRisk: number; summary: string }): ScoringRun {
    const run = this.data.scoringRuns.find(r => r.id === runId);
    if (!run) throw new Error("Scoring run not found");
    run.status = "completed";
    run.customersScored = result.customersScored;
    run.revenueAtRisk = result.revenueAtRisk.toFixed(2);
    run.summary = result.summary;
    run.completedAt = new Date();
    this.save();
    return run;
  }

  failScoringRun(runId: number, error: string): ScoringRun {
    const run = this.data.scoringRuns.find(r => r.id === runId);
    if (!run) throw new Error("Scoring run not found");
    run.status = "failed";
    run.error = error;
    run.completedAt = new Date();
    this.save();
    return run;
  }

  listScoringRuns(workspaceId: string, limit = 10): ScoringRun[] {
    return this.data.scoringRuns
      .filter(r => r.workspaceId === workspaceId)
      .slice(-limit)
      .reverse();
  }

  // Interventions & Playbooks
  recordIntervention(intervention: {
    workspaceId: string;
    customerId: number;
    sourceCustomerId: string;
    playbookType: string;
    templateName?: string | null;
    recipientEmail?: string | null;
    incentiveCode?: string | null;
    incentiveAmount?: string | null;
    status: "sent" | "delivered" | "failed" | "simulated";
    performedBy: number;
    performedByName?: string | null;
    details?: any;
  }): Intervention {
    const item: Intervention = {
      id: this.data.interventions.length + 1,
      workspaceId: intervention.workspaceId,
      customerId: intervention.customerId,
      sourceCustomerId: intervention.sourceCustomerId,
      playbookType: intervention.playbookType,
      templateName: intervention.templateName ?? null,
      recipientEmail: intervention.recipientEmail ?? null,
      incentiveCode: intervention.incentiveCode ?? null,
      incentiveAmount: intervention.incentiveAmount ?? null,
      status: intervention.status,
      performedBy: intervention.performedBy,
      performedByName: intervention.performedByName ?? null,
      outcome: "pending",
      revenueSaved: "0.00",
      details: intervention.details
        ? typeof intervention.details === "string"
          ? intervention.details
          : JSON.stringify(intervention.details)
        : null,
      createdAt: new Date(),
    };
    this.data.interventions.push(item);
    this.save();
    return item;
  }

  listInterventions(workspaceId: string): Intervention[] {
    return this.data.interventions
      .filter(i => i.workspaceId === workspaceId)
      .reverse();
  }

  // Customer Notes
  addNote(workspaceId: string, customerId: number, authorId: number, authorName: string, note: string): CustomerNote {
    const entry: CustomerNote = {
      id: this.data.notes.length + 1,
      workspaceId,
      customerId,
      authorId,
      authorName,
      note,
      createdAt: new Date(),
    };
    this.data.notes.push(entry);
    this.save();
    return entry;
  }

  listNotes(workspaceId: string, customerId: number): CustomerNote[] {
    return this.data.notes
      .filter(n => n.workspaceId === workspaceId && n.customerId === customerId)
      .reverse();
  }

  // Alert Rules
  listAlertRules(workspaceId: string): AlertRule[] {
    return this.data.alertRules.filter(r => r.workspaceId === workspaceId);
  }

  saveAlertRule(rule: {
    id?: number;
    workspaceId: string;
    name: string;
    channel: "slack" | "webhook" | "hubspot";
    webhookUrl?: string | null;
    thresholdBand: "Urgent" | "High" | "Any";
    minRiskProbability: string;
    minRevenueAtRisk: string;
    enabled?: number;
  }): AlertRule {
    if (rule.id) {
      const existing = this.data.alertRules.find(r => r.id === rule.id && r.workspaceId === rule.workspaceId);
      if (existing) {
        Object.assign(existing, rule, { webhookUrl: rule.webhookUrl ?? null });
        this.save();
        return existing;
      }
    }
    const newRule: AlertRule = {
      id: this.data.alertRules.length + 1,
      workspaceId: rule.workspaceId,
      name: rule.name,
      channel: rule.channel,
      webhookUrl: rule.webhookUrl ?? null,
      thresholdBand: rule.thresholdBand,
      minRiskProbability: rule.minRiskProbability,
      minRevenueAtRisk: rule.minRevenueAtRisk,
      enabled: rule.enabled ?? 1,
      createdAt: new Date(),
    };
    this.data.alertRules.push(newRule);
    this.save();
    return newRule;
  }

  deleteAlertRule(workspaceId: string, ruleId: number): boolean {
    const idx = this.data.alertRules.findIndex(r => r.workspaceId === workspaceId && r.id === ruleId);
    if (idx === -1) return false;
    this.data.alertRules.splice(idx, 1);
    this.save();
    return true;
  }

  // Audit Logs
  logAudit(log: {
    workspaceId: string;
    action: string;
    resourceType: string;
    userId?: number | null;
    userName?: string | null;
    resourceId?: string | null;
    details?: any;
    ipAddress?: string | null;
  }): AuditLog {
    const item: AuditLog = {
      id: this.data.auditLogs.length + 1,
      workspaceId: log.workspaceId,
      userId: log.userId ?? null,
      userName: log.userName ?? null,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId ?? null,
      details: log.details
        ? typeof log.details === "string"
          ? log.details
          : JSON.stringify(log.details)
        : null,
      ipAddress: log.ipAddress ?? null,
      createdAt: new Date(),
    };
    this.data.auditLogs.push(item);
    this.save();
    return item;
  }

  listAuditLogs(workspaceId: string, filters?: { action?: string; userId?: number; limit?: number }): AuditLog[] {
    let logs = this.data.auditLogs.filter(l => l.workspaceId === workspaceId);
    if (filters?.action) {
      logs = logs.filter(l => l.action.toLowerCase().includes(filters.action!.toLowerCase()));
    }
    if (filters?.userId) {
      logs = logs.filter(l => l.userId === filters.userId);
    }
    return logs
      .slice(-(filters?.limit ?? 100))
      .map(l => ({
        ...l,
        details:
          typeof l.details === "object" && l.details !== null
            ? JSON.stringify(l.details)
            : l.details
              ? String(l.details)
              : null,
      }))
      .reverse();
  }

  // Dynamic / Imported Tenant Customers
  getTenantCustomers(workspaceId: string): any[] {
    return this.data.tenantCustomers[workspaceId] || [];
  }

  setTenantCustomers(workspaceId: string, customers: any[]): void {
    this.data.tenantCustomers[workspaceId] = customers;
    this.save();
  }

  getTenantCustomerCount(workspaceId: string): number {
    if (workspaceId === "ws_default") {
      return 4122;
    }
    const customers = this.getTenantCustomers(workspaceId);
    if (customers.length > 0) return customers.length;
    const events = this.data.events.filter(
      e => e.workspaceId === workspaceId && e.customerId
    );
    const uniqueIds = new Set(events.map(e => e.customerId));
    return uniqueIds.size;
  }

  getAnalystDailyUsage(workspaceId: string): {
    used: number;
    limit: number;
    remaining: number;
    plan: string;
  } {
    const ws = this.getWorkspace(workspaceId);
    const plan = ws?.plan || "pro";
    const limit = ANALYST_DAILY_LIMITS[plan] ?? 200;
    const today = new Date().toISOString().slice(0, 10);
    const key = `${workspaceId}:${today}`;
    const used =
      (this.data.analystDailyUsage && this.data.analystDailyUsage[key]) || 0;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      plan,
    };
  }

  incrementAnalystUsage(workspaceId: string): {
    allowed: boolean;
    used: number;
    limit: number;
    plan: string;
  } {
    const ws = this.getWorkspace(workspaceId);
    const plan = ws?.plan || "pro";
    const limit = ANALYST_DAILY_LIMITS[plan] ?? 200;
    const today = new Date().toISOString().slice(0, 10);
    const key = `${workspaceId}:${today}`;
    if (!this.data.analystDailyUsage) {
      this.data.analystDailyUsage = {};
    }
    const current = this.data.analystDailyUsage[key] || 0;
    if (current >= limit) {
      return { allowed: false, used: current, limit, plan };
    }
    this.data.analystDailyUsage[key] = current + 1;
    this.save();
    return { allowed: true, used: current + 1, limit, plan };
  }

  getIntegrationConfig(workspaceId: string): Record<
    string,
    {
      connected: boolean;
      mode: "mock" | "live";
      apiKeyMasked?: string;
      lastSyncAt?: string;
    }
  > {
    const wsConfig =
      (this.data.integrationsConfig &&
        this.data.integrationsConfig[workspaceId]) ||
      {};
    const hasStripeEnv = Boolean(
      process.env.STRIPE_SECRET_KEY &&
        !process.env.STRIPE_SECRET_KEY.includes("placeholder")
    );
    const hasShopifyEnv = Boolean(process.env.SHOPIFY_API_KEY);

    return {
      stripe: wsConfig.stripe || {
        connected: true,
        mode: hasStripeEnv ? "live" : "mock",
        lastSyncAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      },
      shopify: wsConfig.shopify || {
        connected: true,
        mode: hasShopifyEnv ? "live" : "mock",
        lastSyncAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      },
    };
  }

  updateIntegrationConfig(
    workspaceId: string,
    source: "stripe" | "shopify",
    config: {
      connected: boolean;
      mode?: "mock" | "live";
      apiKey?: string;
      webhookUrl?: string;
    }
  ) {
    if (!this.data.integrationsConfig) this.data.integrationsConfig = {};
    if (!this.data.integrationsConfig[workspaceId])
      this.data.integrationsConfig[workspaceId] = {};

    const existing =
      this.data.integrationsConfig[workspaceId][source] || {};
    const apiKeyMasked = config.apiKey
      ? `${config.apiKey.slice(0, 6)}••••••••${config.apiKey.slice(-4)}`
      : existing.apiKeyMasked;

    this.data.integrationsConfig[workspaceId][source] = {
      connected: config.connected,
      mode:
        config.mode ||
        (config.apiKey?.startsWith("live_") || config.apiKey?.startsWith("sk_live")
          ? "live"
          : "mock"),
      apiKeyMasked,
      webhookUrl: config.webhookUrl || existing.webhookUrl,
      lastSyncAt: existing.lastSyncAt || new Date().toISOString(),
    };
    this.save();
    return this.data.integrationsConfig[workspaceId][source];
  }

  updateIntegrationSyncTime(workspaceId: string, source: "stripe" | "shopify") {
    if (!this.data.integrationsConfig) this.data.integrationsConfig = {};
    if (!this.data.integrationsConfig[workspaceId])
      this.data.integrationsConfig[workspaceId] = {};
    const existing = this.data.integrationsConfig[workspaceId][source] || {
      connected: true,
      mode: "mock",
    };
    existing.lastSyncAt = new Date().toISOString();
    this.data.integrationsConfig[workspaceId][source] = existing;
    this.save();
  }

  populateSampleCustomers(workspaceId: string): number {
    const existing = this.getTenantCustomers(workspaceId);
    if (existing.length > 0) return existing.length;

    const sampleBands = ["Urgent", "High", "Monitor"] as const;
    const countries = [
      "United Kingdom",
      "Germany",
      "France",
      "United States",
      "Australia",
      "Canada",
    ];
    const actions = [
      "VIP Concierge Check-in",
      "Executive outreach & contract discount",
      "Win-back 15% Incentive Offer",
      "Proactive Support Check-in",
      "Feature adoption walkthrough",
    ];

    const samples = Array.from({ length: 15 }, (_, idx) => {
      const id = 90001 + idx;
      const band = sampleBands[idx % sampleBands.length];
      const risk =
        band === "Urgent"
          ? 0.75 + (idx % 20) * 0.01
          : band === "High"
            ? 0.55 + (idx % 15) * 0.01
            : 0.25 + (idx % 10) * 0.01;
      const clv = 1500 + idx * 450;
      const revAtRisk = Number((clv * risk).toFixed(2));
      const score = Math.round(risk * 100);

      return {
        customerId: id,
        sourceCustomerId: `EXT-${10000 + idx}`,
        country: countries[idx % countries.length],
        firstActivityAt: new Date(
          Date.now() - (180 + idx * 10) * 86400000
        ).toISOString(),
        lastActivityAt: new Date(
          Date.now() - (15 + idx * 2) * 86400000
        ).toISOString(),
        priorityScore: score,
        priorityBand: band,
        recommendedAction: actions[idx % actions.length],
        rationale: `Customer shows ${Math.round(risk * 100)}% churn risk due to order slowdown and return activity.`,
        supportingSignals: {
          daysSinceLastPurchase: 25 + idx * 3,
          revenueAtRisk: revAtRisk,
          returnRate: 0.12,
        },
        benefitEvidence:
          "High value customer with historically strong repurchase rate.",
        calibratedChurnProbability: Number(risk.toFixed(4)),
        behavioralClv: clv,
        revenueAtRisk: revAtRisk,
        expectedFutureValue: Math.round(clv * (1 - risk)),
        cutoffAt: new Date().toISOString(),
      };
    });

    this.setTenantCustomers(workspaceId, samples);
    return samples.length;
  }
}

export const tenantStorage = new TenantStorage();
