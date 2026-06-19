import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error("SESSION_SECRET is required for auth.");
}

export const SESSION_COOKIE = "sinal_session";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  userId: string;
  tenantId: string;
  email: string | null;
  exp: number;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string | null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(data: string): string {
  return b64url(crypto.createHmac("sha256", SECRET!).update(data).digest());
}

export function createSessionToken(
  ctx: Omit<AuthContext, never>,
): string {
  const payload: SessionPayload = {
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    email: ctx.email,
    exp: Date.now() + MAX_AGE_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  // constant-time compare
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64").toString("utf8"),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// The app runs inside a cross-site iframe (the Replit preview), so the session
// cookie must be SameSite=None + Secure (and Partitioned for CHIPS) or browsers
// will refuse to send it back, making logins appear to "not stick".
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    partitioned: true,
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    path: "/",
    sameSite: "none",
    secure: true,
    partitioned: true,
  });
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? null;
  const payload = token ? verifySessionToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.auth = {
    userId: payload.userId,
    tenantId: payload.tenantId,
    email: payload.email,
  };
  next();
}
