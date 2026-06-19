import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { OWNER } from "../lib/scope";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

// Global search across CRM people, groups and topics. Powers the Cmd+K palette.
router.get("/search", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ people: [], groups: [], topics: [] });
    return;
  }
  const like = `%${q}%`;

  const [people, groups, topics] = await Promise.all([
    // CRM contacts (populated from DMs) by name or phone.
    pool.query(
      `select id, display_name as name, primary_phone as phone,
              last_interaction_at as last_at
         from contacts
        where tenant_id = $1
          and (display_name ilike $2 or primary_phone ilike $2)
        order by last_interaction_at desc nulls last
        limit 6`,
      [t, like],
    ),
    // Groups derived live from whatsapp_messages.
    pool.query(
      `select chat_id, max(chat_name) as name, count(*)::int as message_count
         from whatsapp_messages
        where whatsapp_owner = $1 and chat_type = 'group' and chat_id is not null
          and chat_name ilike $2
        group by chat_id
        order by message_count desc
        limit 6`,
      [OWNER, like],
    ),
    // Named topics (pautas).
    pool.query(
      `select id, label, scope, message_count
         from topics
        where tenant_id = $1 and label ilike $2
        order by message_count desc nulls last
        limit 6`,
      [t, like],
    ),
  ]);

  res.json({
    people: people.rows,
    groups: groups.rows,
    topics: topics.rows,
  });
});

export default router;
