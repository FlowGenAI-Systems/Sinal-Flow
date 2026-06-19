import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { OWNER, requireOwnerTenant } from "../lib/scope";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);
// All media endpoints read whatsapp_messages (owner-scoped, no tenant_id), so
// gate the whole router by the owner tenant — same contract as metrics.ts.
router.use(requireOwnerTenant);

function parseLimit(raw: unknown): number {
  const n = Number(raw ?? 50);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(Math.floor(n), 200);
}

function parseGranularity(raw: unknown): "day" | "week" | "month" {
  if (raw === "week" || raw === "month") return raw;
  return "day";
}

// Normalizes the metadata raw_type into the stable keys the frontend uses
// (matching the COLUMNS config in the Mídia page).
const TYPE_KEY = `
  case
    when metadata->>'raw_type' = 'AudioMessage' then 'audio'
    when metadata->>'raw_type' = 'ImageMessage' then 'image'
    when metadata->>'raw_type' = 'DocumentMessage' then 'document'
    when metadata->>'raw_type' = 'StickerMessage' then 'sticker'
    when metadata->>'raw_type' in ('VideoMessage','PtvMessage') then 'video'
    else 'other'
  end`;

// Per-type conditional counts over media-bearing messages. raw_type lives in the
// metadata jsonb (set by the ingestion pipeline). whatsapp_messages is READ-ONLY
// and every read is scoped by owner.
const TYPE_COUNTS = `
  count(*) filter (where metadata->>'raw_type' = 'AudioMessage')::int as audio,
  count(*) filter (where metadata->>'raw_type' = 'ImageMessage')::int as image,
  count(*) filter (where metadata->>'raw_type' = 'DocumentMessage')::int as document,
  count(*) filter (where metadata->>'raw_type' = 'StickerMessage')::int as sticker,
  count(*) filter (where metadata->>'raw_type' in ('VideoMessage','PtvMessage'))::int as video
`;

// Maps the stable frontend type key back to the raw_type values it covers, so a
// drill-down filters exactly the same rows the displayed count aggregated.
const TYPE_RAW: Record<string, string[]> = {
  audio: ["AudioMessage"],
  image: ["ImageMessage"],
  document: ["DocumentMessage"],
  sticker: ["StickerMessage"],
  video: ["VideoMessage", "PtvMessage"],
};

// Drill-down: the actual media messages behind any count on the Mídia page.
// Honors the same scope (owner), type, chat (contact/group) and direction
// filters as the number that was clicked. Read-only; paginated by limit/offset.
router.get("/media/messages", async (req: AuthedRequest, res) => {
  const limit = parseLimit(req.query.limit);
  const offsetRaw = Number(req.query.offset ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  const where = [
    "whatsapp_owner = $1",
    "media_url is not null",
    "metadata->>'raw_type' is not null",
  ];
  const params: unknown[] = [OWNER];

  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  if (type && TYPE_RAW[type]) {
    params.push(TYPE_RAW[type]);
    where.push(`metadata->>'raw_type' = any($${params.length})`);
  }

  const scope = req.query.scope;
  if (scope === "private" || scope === "group") {
    params.push(scope);
    where.push(`chat_type = $${params.length}`);
  }

  const chatId = typeof req.query.chatId === "string" ? req.query.chatId : undefined;
  if (chatId) {
    // Match the effective DM partner phone (chat_id OR contact_phone fallback)
    // so a contact_phone-only DM drills correctly and stays in parity with
    // /media/by-contact, which groups on the same expression. For groups
    // contact_phone is empty, so this collapses to a plain chat_id match.
    params.push(chatId);
    where.push(
      `coalesce(nullif(chat_id,''), nullif(contact_phone,'')) = $${params.length}`,
    );
  }

  const direction = req.query.direction;
  if (direction === "inbound" || direction === "outbound") {
    params.push(direction);
    where.push(`direction = $${params.length}`);
  }

  const whereSql = where.join(" and ");
  const [count, rows] = await Promise.all([
    pool.query(`select count(*)::int as total from whatsapp_messages where ${whereSql}`, params),
    pool.query(
      `select message_id, direction, message_created_at, chat_id,
              chat_name,
              coalesce(nullif(sender_name,''), nullif(sender_phone,''), nullif(contact_phone,'')) as sender,
              ${TYPE_KEY} as type,
              coalesce(nullif(message,''), caption, transcription) as text
         from whatsapp_messages
        where ${whereSql}
        order by message_created_at desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);

  res.json({ total: count.rows[0]?.total ?? 0, messages: rows.rows });
});

// Overall media inventory: totals per type, split by group vs private.
router.get("/media/summary", async (_req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `select metadata->>'raw_type' as raw_type,
            count(*)::int as total,
            count(*) filter (where chat_type = 'group')::int as group_count,
            count(*) filter (where chat_type = 'private')::int as private_count
       from whatsapp_messages
      where whatsapp_owner = $1 and media_url is not null
        and metadata->>'raw_type' is not null
      group by 1
      order by total desc`,
    [OWNER],
  );
  const total = rows.reduce((acc, r) => acc + Number(r.total), 0);
  res.json({ total, byType: rows });
});

// Top private contacts by media volume, with breakdown. Keyed by the effective
// DM partner phone coalesce(nullif(chat_id,''), nullif(contact_phone,'')) so a
// DM that only carries contact_phone (empty chat_id) is still attributed to its
// contact instead of collapsing into an empty bucket. The drill (/media/messages
// with chatId) matches the same expression, keeping by-contact <-> drawer parity.
router.get("/media/by-contact", async (req: AuthedRequest, res) => {
  const limit = parseLimit(req.query.limit);
  const { rows } = await pool.query(
    `select coalesce(nullif(chat_id,''), nullif(contact_phone,'')) as chat_id,
            max(chat_name) as name,
            count(*)::int as total,
            ${TYPE_COUNTS},
            max(message_created_at) as last_at
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private'
        and media_url is not null
        and coalesce(nullif(chat_id,''), nullif(contact_phone,'')) is not null
        and metadata->>'raw_type' is not null
      group by coalesce(nullif(chat_id,''), nullif(contact_phone,''))
      order by total desc
      limit $2`,
    [OWNER, limit],
  );
  res.json({ contacts: rows });
});

// Top groups by media volume, with breakdown.
router.get("/media/by-group", async (req: AuthedRequest, res) => {
  const limit = parseLimit(req.query.limit);
  const { rows } = await pool.query(
    `select chat_id,
            max(chat_name) as name,
            count(*)::int as total,
            ${TYPE_COUNTS},
            max(message_created_at) as last_at
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'group'
        and media_url is not null and chat_id is not null
        and metadata->>'raw_type' is not null
      group by chat_id
      order by total desc
      limit $2`,
    [OWNER, limit],
  );
  res.json({ groups: rows });
});

// Media volume over time, bucketed by day/week/month, with per-type series.
// Used by the temporal evolution chart on the Mídia page.
router.get("/media/timeseries", async (req: AuthedRequest, res) => {
  const granularity = parseGranularity(req.query.granularity);
  const { rows } = await pool.query(
    `select date_trunc($2, message_created_at) as bucket,
            count(*)::int as total,
            ${TYPE_COUNTS}
       from whatsapp_messages
      where whatsapp_owner = $1 and media_url is not null
        and metadata->>'raw_type' is not null
        and message_created_at is not null
      group by 1
      order by 1`,
    [OWNER, granularity],
  );
  res.json({ granularity, points: rows });
});

// Per-type stats: totals, inbound vs outbound, private vs group, plus the
// overall date range so the frontend can derive averages per day/week/month.
router.get("/media/stats", async (_req: AuthedRequest, res) => {
  const [byType, range] = await Promise.all([
    pool.query(
      `select ${TYPE_KEY} as key,
              count(*)::int as total,
              count(*) filter (where direction = 'inbound')::int as inbound,
              count(*) filter (where direction = 'outbound')::int as outbound,
              count(*) filter (where chat_type = 'group')::int as group_count,
              count(*) filter (where chat_type = 'private')::int as private_count
         from whatsapp_messages
        where whatsapp_owner = $1 and media_url is not null
          and metadata->>'raw_type' is not null
        group by 1`,
      [OWNER],
    ),
    pool.query(
      `select min(message_created_at) as min_at,
              max(message_created_at) as max_at
         from whatsapp_messages
        where whatsapp_owner = $1 and media_url is not null
          and metadata->>'raw_type' is not null`,
      [OWNER],
    ),
  ]);
  res.json({
    range: range.rows[0] ?? { min_at: null, max_at: null },
    byType: byType.rows,
  });
});

export default router;
