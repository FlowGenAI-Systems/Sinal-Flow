import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { OWNER, excludeSupportGroupsSql } from "../lib/scope";

const router: IRouter = Router();
router.use(requireAuth);

// Mentions filtered by entity and/or type, joined to the source message.
// Support groups (Openclaw/Brainz) are hidden by default; pass
// includeSupport=1 to include them. The same support filter is applied to the
// feed and the KPI counts so they stay consistent with each other.
router.get("/mentions", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const entity = req.query.entity as string | undefined;
  const type = req.query.type as string | undefined;
  const includeSupport =
    req.query.includeSupport === "1" || req.query.includeSupport === "true";

  const params: unknown[] = [t];
  let where = "where mn.tenant_id = $1";
  if (entity) {
    params.push(entity);
    where += ` and mn.entity_id = $${params.length}`;
  }
  if (type) {
    params.push(type);
    where += ` and mn.mention_type = $${params.length}`;
  }
  const ownerIdx = params.push(OWNER);
  const supportClause = includeSupport
    ? ""
    : excludeSupportGroupsSql("m", t, params);

  const { rows } = await pool.query(
    `select mn.id, mn.mention_type, mn.sentiment, mn.created_at,
            e.name as entity_name, e.type as entity_type,
            m.sender_name, m.chat_name, m.contact_phone, m.message_created_at,
            coalesce(nullif(m.message,''), m.caption, m.transcription) as text
       from mentions mn
       left join monitored_entities e on e.id = mn.entity_id
       left join whatsapp_messages m on m.message_id = mn.message_id
            and m.whatsapp_owner = $${ownerIdx}
       ${where}${supportClause}
       order by m.message_created_at desc nulls last
       limit 200`,
    params,
  );

  const kpiParams: unknown[] = [t];
  const kpiOwnerIdx = kpiParams.push(OWNER);
  const kpiSupportClause = includeSupport
    ? ""
    : excludeSupportGroupsSql("m", t, kpiParams);
  const { rows: kpis } = await pool.query(
    `select mn.mention_type, count(*)::int as count
       from mentions mn
       left join whatsapp_messages m on m.message_id = mn.message_id
            and m.whatsapp_owner = $${kpiOwnerIdx}
      where mn.tenant_id = $1${kpiSupportClause}
      group by mn.mention_type`,
    kpiParams,
  );
  res.json({ mentions: rows, kpis });
});

export default router;
