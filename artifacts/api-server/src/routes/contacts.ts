import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { analyzeContact } from "@workspace/ai";
import { OWNER, requireOwnerTenant } from "../lib/scope";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);
// Several routes here read the shared, READ-ONLY whatsapp_messages table, which
// has no tenant_id and is keyed only by whatsapp_owner. Gate the whole router
// with requireOwnerTenant (same pattern as metrics.ts) so owner-keyed message
// data can never be read by a non-owner tenant; CRM tables remain per-query
// tenant-scoped on top of this.
router.use(requireOwnerTenant);

// List CRM contacts (DM + promoted). Includes open task counts, tags and the
// total message volume per contact. Supports filtering and sorting:
//   label    -> a label uuid; only contacts carrying it
//   q        -> free text over name / phone / email
//   category -> exact dominant_category match
//   hasTasks -> "true" to keep only contacts with open tasks
//   sort     -> last_interaction (default) | volume | name
// msg_count is read from the cached contacts.msg_count column (refreshed by the
// backfill-contacts job via refreshContactMsgCounts) instead of scanning the
// READ-ONLY whatsapp_messages table on every request. The cached value uses the
// same effective-phone keying as the per-contact history drill, so the list
// total stays consistent with the drill-down count.
const labelFilterSchema = z.string().uuid();
router.get("/contacts", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const params: unknown[] = [t];

  const labelParsed = labelFilterSchema.safeParse(req.query.label);
  let labelClause = "";
  if (labelParsed.success) {
    params.push(labelParsed.data);
    labelClause = ` and exists (
      select 1 from contact_labels clf
       where clf.contact_id = c.id and clf.label_id = $${params.length}
    )`;
  }

  let searchClause = "";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    searchClause = ` and (c.display_name ilike $${i} or c.primary_phone ilike $${i} or c.email ilike $${i})`;
  }

  let categoryClause = "";
  const category =
    typeof req.query.category === "string" ? req.query.category.trim() : "";
  if (category) {
    params.push(category);
    categoryClause = ` and c.dominant_category = $${params.length}`;
  }

  const hasTasksClause =
    req.query.hasTasks === "true"
      ? ` and exists (select 1 from tasks tk where tk.tenant_id = $1 and tk.contact_id = c.id and tk.done = false)`
      : "";

  const sort = req.query.sort;
  const orderBy =
    sort === "volume"
      ? "coalesce(c.msg_count, 0) desc, c.last_interaction_at desc nulls last"
      : sort === "name"
        ? "c.display_name asc nulls last"
        : "c.last_interaction_at desc nulls last";

  const { rows } = await pool.query(
    `select c.*,
            coalesce(c.msg_count, 0) as msg_count,
            (select count(*)::int from tasks tk
              where tk.tenant_id = $1 and tk.contact_id = c.id
                and tk.done = false) as open_tasks,
            coalesce((
              select json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color)
                              order by l.name)
                from contact_labels cl
                join labels l on l.id = cl.label_id
               where cl.contact_id = c.id
            ), '[]'::json) as labels
       from contacts c
      where c.tenant_id = $1${labelClause}${searchClause}${categoryClause}${hasTasksClause}
      order by ${orderBy}`,
    params,
  );
  res.json({ contacts: rows });
});

// VIP contacts: anyone carrying a label named "VIP" (case-insensitive), for the
// Overview quick-follow-up section. Returns the contact's tags + open task count
// so the UI can deep-link straight into the CRM ficha.
router.get("/contacts/vip", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rows } = await pool.query(
    `select c.id, c.display_name, c.primary_phone, c.description,
            c.dominant_category, c.last_interaction_at,
            (select count(*)::int from tasks tk
              where tk.tenant_id = $1 and tk.contact_id = c.id
                and tk.done = false) as open_tasks,
            coalesce((
              select json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color)
                              order by l.name)
                from contact_labels cl
                join labels l on l.id = cl.label_id
               where cl.contact_id = c.id
            ), '[]'::json) as labels
       from contacts c
      where c.tenant_id = $1
        and exists (
          select 1 from contact_labels cl
            join labels l on l.id = cl.label_id
           where cl.contact_id = c.id and lower(l.name) = 'vip'
        )
      order by c.last_interaction_at desc nulls last`,
    [t],
  );
  res.json({ contacts: rows });
});

// List tenant tags (labels) with how many contacts carry each one.
router.get("/labels", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rows } = await pool.query(
    `select l.id, l.name, l.color,
            (select count(*)::int from contact_labels cl where cl.label_id = l.id)
              as contact_count
       from labels l
      where l.tenant_id = $1
      order by contact_count desc, l.name asc`,
    [t],
  );
  res.json({ labels: rows });
});

const labelSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().max(20).nullable().optional(),
});
router.post("/labels", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = labelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { name, color } = parsed.data;
  const { rows } = await pool.query(
    `insert into labels (tenant_id, name, color) values ($1, $2, $3)
     returning id, name, color`,
    [t, name.trim(), color ?? null],
  );
  res.status(201).json({ label: rows[0] });
});

// Seed the base set of useful tags (VIP, equipe, cliente) for this tenant.
// Idempotent: only inserts a base tag when one with the same name (case-
// insensitive) does not yet exist. Returns the full, current tag list.
const SEED_LABELS: { name: string; color: string }[] = [
  { name: "VIP", color: "#FBBF24" },
  { name: "equipe", color: "#60A5FA" },
  { name: "cliente", color: "#4ADE80" },
];
router.post("/labels/seed", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  for (const s of SEED_LABELS) {
    await pool.query(
      `insert into labels (tenant_id, name, color)
       select $1, $2, $3
        where not exists (
          select 1 from labels where tenant_id = $1 and lower(name) = lower($2)
        )`,
      [t, s.name, s.color],
    );
  }
  const { rows } = await pool.query(
    `select l.id, l.name, l.color,
            (select count(*)::int from contact_labels cl where cl.label_id = l.id)
              as contact_count
       from labels l
      where l.tenant_id = $1
      order by contact_count desc, l.name asc`,
    [t],
  );
  res.json({ labels: rows });
});

router.delete("/labels/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rowCount } = await pool.query(
    `delete from labels where id = $1 and tenant_id = $2`,
    [req.params.id, t],
  );
  if (!rowCount) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

const assignSchema = z.object({ labelId: z.string().uuid() });
router.post("/contacts/:id/labels", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  // Both the contact and the label must belong to this tenant.
  const chk = await pool.query(
    `select (select 1 from contacts where id = $1 and tenant_id = $3) as c,
            (select 1 from labels where id = $2 and tenant_id = $3) as l`,
    [req.params.id, parsed.data.labelId, t],
  );
  if (!chk.rows[0]?.c || !chk.rows[0]?.l) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await pool.query(
    `insert into contact_labels (contact_id, label_id) values ($1, $2)
     on conflict do nothing`,
    [req.params.id, parsed.data.labelId],
  );
  res.status(201).json({ ok: true });
});

router.delete("/contacts/:id/labels/:labelId", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const c = await pool.query(
    `select 1 from contacts where id = $1 and tenant_id = $2`,
    [req.params.id, t],
  );
  if (!c.rows.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await pool.query(
    `delete from contact_labels where contact_id = $1 and label_id = $2`,
    [req.params.id, req.params.labelId],
  );
  res.json({ ok: true });
});

const updateSchema = z.object({
  displayName: z.string().optional(),
  email: z.string().email().nullable().optional(),
  description: z.string().nullable().optional(),
  primaryPhone: z.string().nullable().optional(),
});

router.patch("/contacts/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const fields = parsed.data;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    const col = {
      displayName: "display_name",
      email: "email",
      description: "description",
      primaryPhone: "primary_phone",
    }[k]!;
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "no_fields" });
    return;
  }
  params.push(req.params.id, t);
  const { rows } = await pool.query(
    `update contacts set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length - 1} and tenant_id = $${params.length}
      returning *`,
    params,
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ contact: rows[0] });
});

// Full message history with a contact (read-only source).
router.get("/contacts/:id/messages", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const c = await pool.query(
    `select primary_phone from contacts where id = $1 and tenant_id = $2`,
    [req.params.id, t],
  );
  if (c.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const phone = c.rows[0].primary_phone as string | null;
  if (!phone) {
    res.json({ messages: [] });
    return;
  }
  const { rows } = await pool.query(
    `select message_id, direction, message_created_at,
            coalesce(nullif(message,''), caption, transcription) as text
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private'
        and (chat_id = $2 or nullif(contact_phone,'') = $2)
      order by message_created_at asc
      limit 500`,
    [OWNER, phone],
  );
  res.json({ messages: rows });
});

// Resolve a contact's primary phone within the tenant. Returns undefined when
// the contact does not exist for this tenant (caller should 404), or null when
// it exists but has no phone (no whatsapp_messages to read).
async function contactPhone(
  id: string,
  tenantId: string,
): Promise<string | null | undefined> {
  const c = await pool.query(
    `select primary_phone from contacts where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );
  if (c.rows.length === 0) return undefined;
  return (c.rows[0].primary_phone as string | null) ?? null;
}

// Per-contact metrics: sent vs received counts, distinct conversation days,
// first/last interaction, and top pautas/topics (from message_enrichment).
router.get("/contacts/:id/metrics", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const phone = await contactPhone(String(req.params.id), t);
  if (phone === undefined) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!phone) {
    res.json({
      metrics: {
        total: 0,
        sent: 0,
        received: 0,
        days: 0,
        first_at: null,
        last_at: null,
        topics: [],
      },
    });
    return;
  }

  const totals = await pool.query(
    `select count(*)::int as total,
            count(*) filter (where direction = 'outbound')::int as sent,
            count(*) filter (where direction = 'inbound')::int as received,
            count(distinct date(message_created_at))::int as days,
            min(message_created_at) as first_at,
            max(message_created_at) as last_at
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private'
        and (chat_id = $2 or nullif(contact_phone,'') = $2)`,
    [OWNER, phone],
  );

  const topics = await pool.query(
    `select tp as topic, count(*)::int as count
       from whatsapp_messages m
       join message_enrichment e
         on e.message_id = m.message_id and e.tenant_id = $3
       cross join lateral unnest(e.topics) as tp
      where m.whatsapp_owner = $1 and m.chat_type = 'private'
        and (m.chat_id = $2 or nullif(m.contact_phone,'') = $2)
        and e.topics is not null
      group by tp
      order by count desc, tp asc
      limit 8`,
    [OWNER, phone, t],
  );

  res.json({
    metrics: {
      ...totals.rows[0],
      topics: topics.rows,
    },
  });
});

// Links (URLs) exchanged with a contact, with date + direction, newest first.
router.get("/contacts/:id/links", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const phone = await contactPhone(String(req.params.id), t);
  if (phone === undefined) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!phone) {
    res.json({ links: [] });
    return;
  }
  const { rows } = await pool.query(
    `select message_id, direction, message_created_at, url
       from (
         select message_id, direction, message_created_at,
                (regexp_matches(
                   coalesce(nullif(message,''), caption, transcription, ''),
                   'https?://[^\\s]+', 'g'
                 ))[1] as url
           from whatsapp_messages
          where whatsapp_owner = $1 and chat_type = 'private'
            and (chat_id = $2 or nullif(contact_phone,'') = $2)
       ) s
      order by message_created_at desc
      limit 200`,
    [OWNER, phone],
  );
  res.json({ links: rows });
});

// Read the cached AI analysis for a contact (null when never generated).
router.get("/contacts/:id/analysis", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rows } = await pool.query(
    `select ai_analysis, ai_analysis_at, ai_analysis_msg_count
       from contacts where id = $1 and tenant_id = $2`,
    [req.params.id, t],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({
    analysis: rows[0].ai_analysis,
    generatedAt: rows[0].ai_analysis_at,
    messageCount: rows[0].ai_analysis_msg_count,
  });
});

// Minimum messages required before the (paid) AI analysis can be generated.
const ANALYSIS_MIN_MESSAGES = 10;

// Generate (or regenerate) the on-demand AI analysis for a contact. Gated to
// contacts with more than ANALYSIS_MIN_MESSAGES messages to control cost; the
// result is persisted in place (regenerate overwrites).
router.post("/contacts/:id/analysis", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const c = await pool.query(
    `select display_name, primary_phone from contacts
      where id = $1 and tenant_id = $2`,
    [req.params.id, t],
  );
  if (c.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const phone = (c.rows[0].primary_phone as string | null) ?? null;
  if (!phone) {
    res.status(422).json({ error: "no_messages" });
    return;
  }

  const { rows: msgs } = await pool.query(
    `select direction, message_created_at,
            coalesce(nullif(message,''), caption, transcription) as text
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private'
        and (chat_id = $2 or nullif(contact_phone,'') = $2)
        and coalesce(nullif(message,''), caption, transcription) is not null
      order by message_created_at asc`,
    [OWNER, phone],
  );

  if (msgs.length <= ANALYSIS_MIN_MESSAGES) {
    res.status(422).json({ error: "too_few_messages", count: msgs.length });
    return;
  }

  // Sample to keep the prompt bounded: keep the first 30 and last 90 messages
  // so the model sees how the relationship started and where it stands now.
  const sample =
    msgs.length <= 120 ? msgs : [...msgs.slice(0, 30), ...msgs.slice(-90)];
  const sent = msgs.filter((m) => m.direction === "outbound").length;
  const received = msgs.length - sent;

  let analysis: string;
  try {
    analysis = await analyzeContact({
      contactName: c.rows[0].display_name as string | null,
      totalMessages: msgs.length,
      sent,
      received,
      messages: sample.map((m) => ({
        direction: m.direction as string,
        text: (m.text as string) ?? "",
        at: m.message_created_at as string | null,
      })),
    });
  } catch (err) {
    req.log.error(
      { err: (err as Error).message, contactId: req.params.id },
      "contact analysis generation failed",
    );
    res.status(502).json({ error: "analysis_failed" });
    return;
  }

  const { rows } = await pool.query(
    `update contacts
        set ai_analysis = $1, ai_analysis_at = now(), ai_analysis_msg_count = $2,
            updated_at = now()
      where id = $3 and tenant_id = $4
      returning ai_analysis, ai_analysis_at, ai_analysis_msg_count`,
    [analysis, msgs.length, req.params.id, t],
  );
  res.json({
    analysis: rows[0].ai_analysis,
    generatedAt: rows[0].ai_analysis_at,
    messageCount: rows[0].ai_analysis_msg_count,
  });
});

// Tasks for a single contact (open + done), newest-relevant first.
router.get("/contacts/:id/tasks", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const c = await pool.query(
    `select 1 from contacts where id = $1 and tenant_id = $2`,
    [req.params.id, t],
  );
  if (c.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { rows } = await pool.query(
    `select * from tasks
      where tenant_id = $1 and contact_id = $2
      order by done asc, due_at asc nulls last, created_at desc`,
    [t, req.params.id],
  );
  res.json({ tasks: rows });
});

// Promote a contact into the CRM (e.g. a lead seen in a mention).
const promoteSchema = z.object({
  phone: z.string().min(5),
  displayName: z.string().optional(),
});
router.post("/contacts/promote", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = promoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { phone, displayName } = parsed.data;
  const { rows } = await pool.query(
    `insert into contacts (tenant_id, display_name, primary_phone, source)
     values ($1, $2, $3, 'promoted')
     returning *`,
    [t, displayName ?? phone, phone],
  );
  await pool.query(
    `insert into contact_identifiers (tenant_id, contact_id, phone, source)
     values ($1, $2, $3, 'promoted')`,
    [t, rows[0].id, phone],
  );
  res.status(201).json({ contact: rows[0] });
});

export default router;
