import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { supabase } from "../lib/supabase";
import { pool } from "@workspace/db";
import {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  type AuthedRequest,
} from "../lib/auth";

const router: IRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_credentials_format" });
    return;
  }
  const { email, password } = parsed.data;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    req.log.warn({ email, err: error?.message }, "login failed");
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  // Resolve tenant from profiles.
  const { rows } = await pool.query<{ tenant_id: string }>(
    "select tenant_id from profiles where id = $1",
    [data.user.id],
  );
  if (rows.length === 0) {
    req.log.error({ userId: data.user.id }, "user has no profile/tenant");
    res.status(403).json({ error: "no_tenant" });
    return;
  }
  const tenantId = rows[0]!.tenant_id;

  const token = createSessionToken({
    userId: data.user.id,
    tenantId,
    email: data.user.email ?? null,
  });
  setSessionCookie(res, token);
  res.json({
    user: { id: data.user.id, email: data.user.email ?? null, tenantId },
  });
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.auth });
});

export default router;
