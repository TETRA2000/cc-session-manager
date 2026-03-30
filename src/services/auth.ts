import type { MiddlewareHandler } from "hono";
import type { AppConfig } from "../types.ts";

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

export function authMiddleware(config: AppConfig): MiddlewareHandler {
  return async (c, next) => {
    if (!config.authEnabled || !config.token) {
      await next();
      return;
    }

    // Check Authorization: Bearer <token> header
    const authHeader = c.req.header("Authorization");
    if (authHeader) {
      const parts = authHeader.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer" && timingSafeEqual(parts[1], config.token)) {
        await next();
        return;
      }
    }

    // Fall back to ?token=<token> query parameter
    const queryToken = c.req.query("token");
    if (queryToken && timingSafeEqual(queryToken, config.token)) {
      await next();
      return;
    }

    return c.json({ error: "Unauthorized" }, 401);
  };
}
