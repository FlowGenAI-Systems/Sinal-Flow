import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

// List saved items (the 🔖 button destination), optional kind filter.
router.get("/saved", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const kind = req.query.kind as string | undefined;
  const params: unknown[] = [t];
  let where = "where tenant_id = $1";
  if (kind) {
    params.push(kind);
    where += ` and kind = $${params.length}`;
  }
  const { rows } = await pool.query(
    `select * from saved_items ${where} order by created_at desc limit 500`,
    params,
  );
  res.json({ saved: rows });
});

const createSchema = z.object({
  kind: z.string().min(1),
  sourceType: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
});

router.post("/saved", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const d = parsed.data;
  const { rows } = await pool.query(
    `insert into saved_items (tenant_id, kind, source_type, source_id, text)
     values ($1,$2,$3,$4,$5) returning *`,
    [t, d.kind, d.sourceType ?? null, d.sourceId ?? null, d.text ?? null],
  );
  res.status(201).json({ saved: rows[0] });
});

router.delete("/saved/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rowCount } = await pool.query(
    `delete from saved_items where id = $1 and tenant_id = $2`,
    [req.params.id, t],
  );
  if (rowCount === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
