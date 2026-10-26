import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
export const startLogin = () => {
  if (import.meta.env.VITE_DEV_LOCAL_AUTH_ENABLED === "true") {
    window.location.assign("/api/auth/dev-login");
    return;
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  if (!oauthPortalUrl || oauthPortalUrl.includes("<") || !appId) {
    const message =
      "OAuth is not configured. Set VITE_OAUTH_PORTAL_URL and VITE_APP_ID, or enable VITE_DEV_LOCAL_AUTH_ENABLED for local development.";
    console.error(`[Auth] ${message}`);
    window.alert(message);
    return;
  }

  const nonce = crypto.randomUUID();
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });

  let url: URL;
  try {
    url = new URL(`${oauthPortalUrl.replace(/\/+$/, "")}/app-auth`);
  } catch {
    const message = "OAuth portal URL is invalid. Check VITE_OAUTH_PORTAL_URL.";
    console.error(`[Auth] ${message}`);
    window.alert(message);
    return;
  }
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  window.location.href = url.toString();
};
