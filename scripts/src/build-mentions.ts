import { pool, getActiveOwnerPhones } from "@workspace/db";
import { classifyMentions, type MentionInput } from "@workspace/ai";

// Phase 6 (part 2) — Mentions. For each monitored entity, find candidate
// messages that contain an alias (others talking about the entity), then ask
// the LLM whether it is a genuine mention and classify the type/sentiment.
// Idempotent: rebuilds mentions per entity from this run's candidates.
//
//   MENTION_SAMPLE (default 60)
// Run: pnpm --filter @workspace/scripts run build-mentions
const T = "00000000-0000-0000-0000-000000000001";

interface Entity {
  id: string;
  name: string;
  aliases: string[] | null;
}

async function main(): Promise<void> {
  // Scan candidates across every active "Usuário" (WhatsApp number).
  const owners = await getActiveOwnerPhones(pool);
  if (owners.length === 0)
    throw new Error(
      "No active WhatsApp owner (whatsapp_accounts empty and WHATSAPP_OWNER unset).",
    );
  const sample = Number(process.env.MENTION_SAMPLE ?? "60");

  const { rows: entities } = await pool.query<Entity>(
    `select id, name, aliases from monitored_entities where tenant_id = $1`,
    [T],
  );
  console.log(`Found ${entities.length} monitored entities.`);

  for (const ent of entities) {
    const aliases = (ent.aliases && ent.aliases.length > 0
      ? ent.aliases
      : [ent.name]
    ).filter(Boolean);
    // Build ILIKE OR clause for the aliases.
    const likeParams: string[] = [];
    const likeClauses = aliases.map((a) => {
      likeParams.push(`%${a}%`);
      return `text ILIKE $${likeParams.length + 2}`;
    });

    const { rows: cands } = await pool.query<{
      message_id: string;
      text: string;
    }>(
      `select message_id, text from (
         select m.message_id,
                coalesce(nullif(m.message,''), m.caption, m.transcription) as text,
                m.message_created_at, m.sender_phone
           from whatsapp_messages m
          where m.whatsapp_owner = any($1)
            and coalesce(nullif(m.sender_phone,''),'') <> all($2)
            and coalesce(nullif(m.message,''), m.caption, m.transcription) is not null
       ) q
       where (${likeClauses.join(" or ")})
       order by message_created_at desc
       limit ${sample}`,
      [owners, owners, ...likeParams],
    );
    console.log(`  [${ent.name}] ${cands.length} candidate messages.`);
    if (cands.length === 0) continue;

    const inputs: MentionInput[] = cands.map((c) => ({
      messageId: c.message_id,
      text: c.text,
    }));
    const results = await classifyMentions(ent.name, inputs);
    const genuine = results.filter((r) => r.isMention);

    // Insert only message_ids not already recorded for this entity, so prior
    // runs (over different candidate windows) accumulate rather than get wiped.
    const { rows: existing } = await pool.query<{ message_id: string }>(
      `select message_id from mentions where tenant_id = $1 and entity_id = $2`,
      [T, ent.id],
    );
    const seen = new Set(existing.map((r) => r.message_id));
    let added = 0;
    for (const r of genuine) {
      if (seen.has(r.messageId)) continue;
      await pool.query(
        `insert into mentions (tenant_id, message_id, entity_id, mention_type, sentiment)
         values ($1,$2,$3,$4,$5)`,
        [T, r.messageId, ent.id, r.mentionType, r.sentiment],
      );
      seen.add(r.messageId);
      added += 1;
    }
    console.log(
      `  [${ent.name}] genuine: ${genuine.length}/${results.length}, new inserts: ${added}`,
    );
  }

  const { rows: byType } = await pool.query<{ mention_type: string; n: string }>(
    `select mention_type, count(*) n from mentions where tenant_id = $1
      group by mention_type order by n desc`,
    [T],
  );
  console.log("\nMention type distribution:");
  for (const r of byType) console.log(`  ${(r.mention_type ?? "(null)").padEnd(16)} ${r.n}`);

  await pool.end();
}

void main().catch((e) => {
  console.error("build-mentions failed:", (e as Error).message);
  process.exit(1);
});
