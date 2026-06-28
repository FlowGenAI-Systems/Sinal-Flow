import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { getSelectedAccount } from "../lib/scope";

const router: IRouter = Router();
router.use(requireAuth);

// List tasks with optional filter (late|mine|theirs|open|done).
router.get("/tasks", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const filter = req.query.filter as string | undefined;
  let extra = "";
  if (filter === "late")
    extra = "and tk.done = false and tk.due_at is not null and tk.due_at < now()";
  else if (filter === "mine") extra = "and tk.direction = 'mine'";
  else if (filter === "theirs") extra = "and tk.direction = 'theirs'";
  else if (filter === "open") extra = "and tk.done = false";
  else if (filter === "done") extra = "and tk.done = true";

  const params: unknown[] = [t];
  // When a specific usuário is selected, keep only tasks tied to a contact that
  // exchanged DMs with that number (derived from whatsapp_messages). Tasks with
  // no contact can't be attributed to a number, so they only show in "Todos".
  const account = getSelectedAccount();
  let ownerClause = "";
  if (account) {
    params.push(account);
    ownerClause = ` and exists (
      select 1 from whatsapp_messages m
       where m.whatsapp_owner = $${params.length}
         and m.chat_type = 'private'
         and coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) = c.primary_phone
    )`;
  }

  const { rows } = await pool.query(
    `select tk.*, c.display_name as contact_name
       from tasks tk
       left join contacts c on c.id = tk.contact_id
      where tk.tenant_id = $1 ${extra}${ownerClause}
      order by tk.done asc, tk.due_at asc nulls last, tk.created_at desc`,
    params,
  );
  res.json({ tasks: rows });
});

const createSchema = z.object({
  title: z.string().min(1),
  note: z.string().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  direction: z.enum(["mine", "theirs"]).nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

router.post("/tasks", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const d = parsed.data;
  const { rows } = await pool.query(
    `insert into tasks (tenant_id, contact_id, title, note, direction, source_message_id, due_at)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [
      t,
      d.contactId ?? null,
      d.title,
      d.note ?? null,
      d.direction ?? null,
      d.sourceMessageId ?? null,
      d.dueAt ?? null,
    ],
  );
  res.status(201).json({ task: rows[0] });
});

const patchSchema = z.object({
  done: z.boolean().optional(),
  title: z.string().optional(),
  note: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

router.patch("/tasks/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (parsed.data.done !== undefined) {
    params.push(parsed.data.done);
    sets.push(`done = $${params.length}`);
    sets.push(
      parsed.data.done ? `done_at = now()` : `done_at = null`,
    );
  }
  if (parsed.data.title !== undefined) {
    params.push(parsed.data.title);
    sets.push(`title = $${params.length}`);
  }
  if (parsed.data.note !== undefined) {
    params.push(parsed.data.note);
    sets.push(`note = $${params.length}`);
  }
  if (parsed.data.dueAt !== undefined) {
    params.push(parsed.data.dueAt);
    sets.push(`due_at = $${params.length}`);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "no_fields" });
    return;
  }
  params.push(req.params.id, t);
  const { rows } = await pool.query(
    `update tasks set ${sets.join(", ")}
      where id = $${params.length - 1} and tenant_id = $${params.length}
      returning *`,
    params,
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ task: rows[0] });
});

// Bulk-delete all completed tasks for the tenant. Defined before "/tasks/:id"
// so "completed" is not captured as an id param.
router.delete("/tasks/completed", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rows } = await pool.query(
    `delete from tasks where tenant_id = $1 and done = true returning *`,
    [t],
  );
  res.json({ tasks: rows, deleted: rows.length });
});

router.delete("/tasks/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rows } = await pool.query(
    `delete from tasks where id = $1 and tenant_id = $2 returning *`,
    [req.params.id, t],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ task: rows[0] });
});

export default router;
