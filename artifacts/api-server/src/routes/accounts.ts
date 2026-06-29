import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  requireOwnerTenant,
  getActiveAccounts,
  invalidateAccountsCache,
  OWNER_TENANT_ID,
} from "../lib/scope";

const router: IRouter = Router();
router.use(requireAuth);
// Same tenant gate as the message-data routers: only the WhatsApp owner tenant
// can read or manage its accounts (the monitored WhatsApp numbers / "Usuários").
router.use(requireOwnerTenant);

// Active accounts only — feeds the global "Usuários" selector. Shape kept small
// ({ phone, name }) and cached via getActiveAccounts.
router.get("/accounts", async (_req: AuthedRequest, res) => {
  const accounts = await getActiveAccounts();
  res.json({ accounts });
});

// Full management list: every account (active + inactive) with id/active, for the
// Usuários admin screen. Not cached (admin view, low traffic).
router.get("/accounts/manage", async (_req: AuthedRequest, res) => {
  const { rows } = await pool.query<{
    id: string;
    phone: string;
    name: string;
    active: boolean;
    created_at: string;
  }>(
    `select id, owner_phone as phone, display_name as name, active, created_at
       from whatsapp_accounts
      where tenant_id = $1
      order by active desc, display_name nulls last, owner_phone`,
    [OWNER_TENANT_ID],
  );
  res.json({ accounts: rows });
});

// Phone: digits only (WhatsApp owner phone, e.g. 5511999999999), 8–20 chars.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{8,20}$/, "phone must be 8–20 digits");

const createSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(80),
});

// Create (or re-activate) an account. Upserts on (tenant_id, owner_phone) so
// re-adding a previously removed/deactivated number reactivates it and updates
// the name, instead of failing on the unique constraint.
router.post("/accounts", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { phone, name } = parsed.data;
  const { rows } = await pool.query(
    `insert into whatsapp_accounts (tenant_id, owner_phone, display_name, active)
     values ($1, $2, $3, true)
     on conflict (tenant_id, owner_phone) do update
       set display_name = excluded.display_name, active = true
     returning id, owner_phone as phone, display_name as name, active, created_at`,
    [OWNER_TENANT_ID, phone, name],
  );
  invalidateAccountsCache();
  res.status(201).json({ account: rows[0] });
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => d.name !== undefined || d.active !== undefined, {
    message: "no_fields",
  });

// Edit an account (rename and/or activate/deactivate) by id, tenant-scoped.
router.patch("/accounts/:id", async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (parsed.data.name !== undefined) {
    params.push(parsed.data.name);
    sets.push(`display_name = $${params.length}`);
  }
  if (parsed.data.active !== undefined) {
    params.push(parsed.data.active);
    sets.push(`active = $${params.length}`);
  }
  params.push(req.params.id, OWNER_TENANT_ID);
  const { rows } = await pool.query(
    `update whatsapp_accounts set ${sets.join(", ")}
      where id = $${params.length - 1} and tenant_id = $${params.length}
      returning id, owner_phone as phone, display_name as name, active, created_at`,
    params,
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  invalidateAccountsCache();
  res.json({ account: rows[0] });
});

// Remove an account from the registry (does not touch whatsapp_messages, which
// stay keyed by owner_phone). Tenant-scoped.
router.delete("/accounts/:id", async (req: AuthedRequest, res) => {
  const { rowCount } = await pool.query(
    `delete from whatsapp_accounts where id = $1 and tenant_id = $2`,
    [req.params.id, OWNER_TENANT_ID],
  );
  if (!rowCount) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  invalidateAccountsCache();
  res.json({ ok: true });
});

export default router;
