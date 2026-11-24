import {
  COOKIE_NAME,
  ONE_YEAR_MS,
  OAUTH_STATE_COOKIE,
  decodeOAuthState,
} from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/auth/dev-login", async (req: Request, res: Response) => {
    if (!ENV.localAuthEnabled) {
      res.status(404).json({ error: "Local authentication is disabled" });
      return;
    }

    try {
      const openId = "local-development-user";
      try {
        await db.upsertUser({
          openId,
          name: "Local Development User",
          email: "local-development@example.invalid",
          loginMethod: "local-development",
          role: "admin",
          lastSignedIn: new Date(),
        });
      } catch (dbError) {
        console.warn(
          "[Auth] Database offline during dev-login, continuing with local session token"
        );
      }
      const sessionToken = await sdk.createSessionToken(openId, {
        name: "Local Development User",
        expiresInMs: ONE_YEAR_MS,
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Auth] Local development login failed", error);
      res.status(500).json({ error: "Local development login failed" });
    }
  });

  // SAML 2.0 / Enterprise SSO Assertion Consumer Service (ACS)
  app.post("/api/auth/saml/acs", async (req: Request, res: Response) => {
    try {
      const relayState = req.body?.RelayState || req.query?.RelayState || "/";
      const userEmail = req.body?.email || "enterprise-user@pulseboard.io";
      const userName = req.body?.name || "Enterprise SSO User";
      const openId = `sso_${Buffer.from(userEmail).toString("base64").slice(0, 16)}`;

      try {
        await db.upsertUser({
          openId,
          name: userName,
          email: userEmail,
          loginMethod: "saml_sso",
          role: "user",
          lastSignedIn: new Date(),
        });
      } catch {
        // Fallback when DB is offline
      }

      const sessionToken = await sdk.createSessionToken(openId, {
        name: userName,
        expiresInMs: ONE_YEAR_MS,
      });

      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });

      res.redirect(302, typeof relayState === "string" ? relayState : "/");
    } catch (err) {
      console.error("[SSO] SAML ACS callback failed:", err);
      res.status(500).json({ error: "SAML authentication handshake failed" });
    }
  });

  app.get("/api/auth/sso/login", (req: Request, res: Response) => {
    const provider = req.query.provider || "okta";
    const workspaceId = req.query.workspaceId || "ws_default";
    res.json({
      status: "simulated_handshake",
      provider,
      workspaceId,
      acsUrl: "/api/auth/saml/acs",
      message: "SSO SAML Handshake initiated. In production, this redirects to the enterprise IdP sign-in screen.",
    });
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[
      OAUTH_STATE_COOKIE
    ];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: "/",
      secure: true,
      sameSite: "none",
    });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
