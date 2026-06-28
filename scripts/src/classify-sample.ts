import { pool, getActiveOwnerPhones } from "@workspace/db";
import { classifyBatch, activeClassifyModel, type ClassifyInput } from "@workspace/ai";

// Phase 3 — SAMPLE classification. Pulls real text messages from the read-only
// whatsapp_messages table, classifies them in batches via OpenAI, and writes
// results to message_enrichment. Idempotent (skips already-enriched ids).
//
//   SAMPLE_SIZE   (default 50)
//   BATCH_SIZE    (default 20)
//
// Run: pnpm --filter @workspace/scripts run classify-sample
const MVP_TENANT_ID = "00000000-0000-0000-0000-000000000001";

async function main(): Promise<void> {
  // Enrich every active "Usuário" (WhatsApp number), not just one.
  const owners = await getActiveOwnerPhones(pool);
  if (owners.length === 0)
    throw new Error(
      "No active WhatsApp owner (whatsapp_accounts empty and WHATSAPP_OWNER unset).",
    );
  const sampleSize = Number(process.env.SAMPLE_SIZE ?? "50");
  const batchSize = Number(process.env.BATCH_SIZE ?? "20");

  // Pull text-bearing messages not yet enriched. Treat message_id as the key.
  const { rows } = await pool.query<{
    message_id: string;
    chat_type: string | null;
    text: string;
  }>(
    `select m.message_id, m.chat_type,
            coalesce(nullif(m.message, ''), m.caption, m.transcription) as text
       from whatsapp_messages m
       left join message_enrichment e on e.message_id = m.message_id
      where m.whatsapp_owner = any($1)
        and m.message_id is not null
        and coalesce(nullif(m.message, ''), m.caption, m.transcription) is not null
        and length(coalesce(nullif(m.message, ''), m.caption, m.transcription)) >= 3
        and e.message_id is null
      order by m.message_created_at desc nulls last
      limit $2`,
    [owners, sampleSize],
  );

  console.log(
    `Pulled ${rows.length} un-enriched text messages (model=${activeClassifyModel()}).`,
  );
  if (rows.length === 0) {
    await pool.end();
    return;
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    const inputs: ClassifyInput[] = slice.map((r) => ({
      messageId: r.message_id,
      text: r.text,
      chatType: r.chat_type,
    }));

    const results = await classifyBatch(inputs);
    for (const c of results) {
      await pool.query(
        `insert into message_enrichment
           (message_id, tenant_id, chat_type, category, sentiment, topics,
            is_question, requires_reply, summary, model_used)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (message_id) do update set
           category = excluded.category,
           sentiment = excluded.sentiment,
           topics = excluded.topics,
           is_question = excluded.is_question,
           requires_reply = excluded.requires_reply,
           summary = excluded.summary,
           model_used = excluded.model_used,
           processed_at = now()`,
        [
          c.messageId,
          MVP_TENANT_ID,
          slice.find((s) => s.message_id === c.messageId)?.chat_type ?? null,
          c.category,
          c.sentiment,
          c.topics,
          c.isQuestion,
          c.requiresReply,
          c.summary,
          activeClassifyModel(),
        ],
      );
      written += 1;
    }
    console.log(`  batch ${i / batchSize + 1}: classified ${results.length}`);
  }

  console.log(`\n✓ wrote ${written} enrichments.`);

  // Summary breakdown.
  const { rows: byCat } = await pool.query<{ category: string; n: string }>(
    `select category, count(*) n from message_enrichment
      where tenant_id = $1 group by category order by n desc`,
    [MVP_TENANT_ID],
  );
  console.log("\nCategory distribution (message_enrichment):");
  for (const r of byCat) console.log(`  ${r.category.padEnd(24)} ${r.n}`);

  await pool.end();
}

void main().catch((e) => {
  console.error("classify-sample failed:", (e as Error).message);
  process.exit(1);
});
