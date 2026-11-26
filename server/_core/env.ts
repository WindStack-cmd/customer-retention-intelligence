function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export function isDevLike(nodeEnv?: string): boolean {
  const env = arguments.length > 0 ? nodeEnv : process.env.NODE_ENV;
  return env === "development" || env === "test";
}

export const ENV = {
  serviceName: process.env.SERVICE_NAME ?? "customer-retention-web",
  nodeEnv: process.env.NODE_ENV ?? "production",
  appUrl: process.env.APP_URL ?? "",
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  get isProduction() {
    return !isDevLike();
  },
  logLevel: process.env.LOG_LEVEL ?? "info",
  demoMode: readBoolean(process.env.DEMO_MODE, false),
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  get localAuthEnabled() {
    return (
      isDevLike() &&
      (readBoolean(process.env.DEV_LOCAL_AUTH_ENABLED, false) ||
        process.env.NODE_ENV === "development")
    );
  },
};
