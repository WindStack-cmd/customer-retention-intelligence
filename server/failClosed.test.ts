import { afterEach, describe, expect, it } from "vitest";
import { isDevLike } from "./_core/env";
import { createContext } from "./_core/context";
import { createCheckoutSession, createPortalSession } from "./billingService";
import { TenantStorage, tenantStorage } from "./tenantStorage";

describe("Fail-Closed isDevLike() Policy", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("isDevLike() returns true ONLY for development and test, and false for unset/production/other", () => {
    expect(isDevLike("development")).toBe(true);
    expect(isDevLike("test")).toBe(true);

    expect(isDevLike(undefined)).toBe(false);
    expect(isDevLike("")).toBe(false);
    expect(isDevLike("production")).toBe(false);
    expect(isDevLike("staging")).toBe(false);

    delete process.env.NODE_ENV;
    expect(isDevLike()).toBe(false);
  });

  it.each([
    { env: undefined, label: "unset", expectDevLike: false },
    { env: "production", label: "production", expectDevLike: false },
    { env: "development", label: "development", expectDevLike: true },
    { env: "test", label: "test", expectDevLike: true },
  ])("enforces fail-closed billing & connectors when NODE_ENV is $label", async ({ env, expectDevLike }) => {
    if (env === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = env;
    }
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    delete process.env.SALESFORCE_ACCESS_TOKEN;

    const ws = tenantStorage.createWorkspace({
      name: `FailClosed ${env ?? "unset"} WS`,
      plan: "starter",
      userId: 901,
    });

    if (expectDevLike) {
      const checkout = await createCheckoutSession({
        workspaceId: ws.id,
        planId: "pro",
        returnUrl: "http://localhost:3000",
      });
      expect(checkout.mode).toBe("mock");

      const portal = await createPortalSession({
        workspaceId: ws.id,
        returnUrl: "http://localhost:3000",
      });
      expect(portal.mode).toBe("mock");

      const config = tenantStorage.getIntegrationConfig(ws.id);
      expect(config.stripe.connected).toBe(true);
      expect(config.shopify.connected).toBe(true);
      expect(config.slack.connected).toBe(true);
      expect(config.crm.connected).toBe(true);
    } else {
      await expect(
        createCheckoutSession({
          workspaceId: ws.id,
          planId: "enterprise",
          returnUrl: "http://localhost:3000",
        })
      ).rejects.toThrow("Billing not configured");

      await expect(
        createPortalSession({
          workspaceId: ws.id,
          returnUrl: "http://localhost:3000",
        })
      ).rejects.toThrow("Billing not configured");

      expect(tenantStorage.getWorkspace(ws.id)?.plan).toBe("starter");

      const config = tenantStorage.getIntegrationConfig(ws.id);
      expect(config.stripe.connected).toBe(false);
      expect(config.shopify.connected).toBe(false);
      expect(config.slack.connected).toBe(false);
      expect(config.crm.connected).toBe(false);
    }
  });

  it.each([
    { env: undefined, label: "unset", expectBypass: false },
    { env: "production", label: "production", expectBypass: false },
    { env: "test", label: "test", expectBypass: false },
    { env: "development", label: "development", expectBypass: true },
  ])("blocks DEV_AUTH_BYPASS when NODE_ENV is $label unless explicitly development", async ({ env, expectBypass }) => {
    if (env === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = env;
    }
    process.env.DEV_AUTH_BYPASS = "true";

    const ctx = await createContext({
      req: { headers: {}, cookies: {} } as any,
      res: {} as any,
    });

    if (expectBypass) {
      expect(ctx.user).not.toBeNull();
      expect(ctx.role).toBe("admin");
    } else {
      expect(ctx.user).toBeNull();
      expect(ctx.role).toBeNull();
    }
  });

  it.each([
    { env: undefined, label: "unset", expectThrow: true },
    { env: "production", label: "production", expectThrow: true },
    { env: "development", label: "development", expectThrow: false },
    { env: "test", label: "test", expectThrow: false },
  ])("refuses JSON fallback and fails startup without DATABASE_URL when NODE_ENV is $label", ({ env, expectThrow }) => {
    if (env === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = env;
    }
    delete process.env.DATABASE_URL;

    if (expectThrow) {
      expect(() => new TenantStorage()).toThrow(/DATABASE_URL is not configured/);
    } else {
      expect(() => new TenantStorage()).not.toThrow();
    }
  });
});
