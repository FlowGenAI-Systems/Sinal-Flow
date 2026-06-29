import { pool, getActiveOwnerPhones } from "@workspace/db";
import {
  clusterTopics,
  TOPIC_BLACKLIST,
  GROUP_TOPIC_BLACKLIST,
} from "@workspace/ai";

// Phase 6 (part 1) — Topics / pautas. Reads enriched messages (their topic
// phrases), clusters them into canonical pautas via the LLM, then writes
// topics + topic_messages (the proof) + topic_groups (cross-group spread).
// Idempotent: rebuilds all topics for the tenant per scope.
//
// Run: pnpm --filter @workspace/scripts run build-topics
const T = "00000000-0000-0000-0000-000000000001";

interface Row {
  message_id: string;
  chat_id: string | null;
  sender_phone: string | null;
  topics: string[] | null;
  message_created_at: Date | string | null;
}

function toIso(v: Date | string | null): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

async function buildScope(
  scope: "private" | "group",
  owners: string[],
): Promise<number> {
  // Group pautas exclude user-managed support_groups (kept consistent with the
  // Overview "Temas nos grupos" cloud) so support/noise groups don't dominate.
  const { rows } = await pool.query<Row>(
    `select e.message_id, m.chat_id, m.sender_phone, e.topics, m.message_created_at
       from message_enrichment e
       join whatsapp_messages m on m.message_id = e.message_id
        and m.whatsapp_owner = any($3)
      where e.tenant_id = $1 and e.chat_type = $2
        and e.topics is not null and array_length(e.topics, 1) > 0
        and (
          $2 <> 'group'
          or not exists (
            select 1 from support_groups sg
             where sg.tenant_id = $1 and sg.chat_id = m.chat_id
          )
        )`,
    [T, scope, owners],
  );
  if (rows.length === 0) {
    console.log(`  [${scope}] no enriched messages with topics.`);
    return 0;
  }

  // Drop conversational-act / meta noise so it never forms a pauta. Groups use
  // the wider GROUP_TOPIC_BLACKLIST; privado keeps the base list.
  const blacklist = new Set(
    (scope === "group" ? GROUP_TOPIC_BLACKLIST : TOPIC_BLACKLIST).map((b) =>
      b.toLowerCase(),
    ),
  );
  // Count phrase frequency, merging casing variants (OpenClaw/openclaw) under a
  // lowercase key while keeping the most-frequent original casing as the label.
  const freq = new Map<string, { count: number; labels: Map<string, number> }>();
  for (const r of rows)
    for (const p of r.topics ?? []) {
      const t = p?.trim();
      if (!t || t.length <= 1) continue;
      const key = t.toLowerCase();
      if (blacklist.has(key)) continue;
      let e = freq.get(key);
      if (!e) {
        e = { count: 0, labels: new Map() };
        freq.set(key, e);
      }
      e.count += 1;
      e.labels.set(t, (e.labels.get(t) ?? 0) + 1);
    }
  // Cluster only the most-discussed phrases — the long tail of one-off phrases
  // is noise and would overflow the model's output (it must echo every member).
  const rawCap = Number(process.env.TOPIC_PHRASE_CAP);
  const cap = Number.isFinite(rawCap) ? Math.max(50, Math.floor(rawCap)) : 600;
  const phrases = [...freq.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, cap)
    .map(([, e]) =>
      [...e.labels.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]![0],
    );
  console.log(
    `  [${scope}] ${rows.length} msgs, ${freq.size} distinct phrases, clustering top ${phrases.length}...`,
  );
  if (phrases.length === 0) {
    // Never wipe existing topics on an empty input — bail before the delete.
    console.log(`  [${scope}] no phrases to cluster; keeping existing topics.`);
    return 0;
  }

  const clusters = await clusterTopics(phrases);
  console.log(`  [${scope}] model returned ${clusters.length} clusters.`);
  if (clusters.length === 0) {
    console.log(`  [${scope}] model returned no clusters; keeping existing topics.`);
    return 0;
  }

  // Wipe existing topics for this tenant+scope (cascades to topic_messages/groups).
  await pool.query(`delete from topics where tenant_id = $1 and scope = $2`, [
    T,
    scope,
  ]);

  let created = 0;
  for (const c of clusters) {
    const members = new Set(c.members.map((m) => m.trim().toLowerCase()));
    const msgs = rows.filter((r) =>
      (r.topics ?? []).some((p) => members.has(p.trim().toLowerCase())),
    );
    if (msgs.length === 0) continue;

    const senders = new Set(msgs.map((m) => m.sender_phone).filter(Boolean));
    const dates = msgs
      .map((m) => toIso(m.message_created_at))
      .filter((d): d is string => Boolean(d))
      .sort();
    const byChat = new Map<string, number>();
    for (const m of msgs) {
      if (!m.chat_id) continue;
      byChat.set(m.chat_id, (byChat.get(m.chat_id) ?? 0) + 1);
    }

    const ins = await pool.query<{ id: string }>(
      `insert into topics
         (tenant_id, label, scope, period_start, period_end,
          person_count, message_count, summary)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [
        T,
        c.label,
        scope,
        dates[0]?.slice(0, 10) ?? null,
        dates[dates.length - 1]?.slice(0, 10) ?? null,
        senders.size,
        msgs.length,
        c.summary,
      ],
    );
    const topicId = ins.rows[0]!.id;

    // Proof: link up to 25 distinct messages (single batched insert so the job
    // finishes within shell timeouts — per-row round-trips were too slow).
    const msgIds = [...new Set(msgs.map((m) => m.message_id))].slice(0, 25);
    if (msgIds.length > 0) {
      const values = msgIds.map((_, i) => `($1,$${i + 2})`).join(",");
      await pool.query(
        `insert into topic_messages (topic_id, message_id)
         values ${values} on conflict do nothing`,
        [topicId, ...msgIds],
      );
    }

    // Cross-group spread (group scope only), also batched.
    if (scope === "group" && byChat.size > 0) {
      const entries = [...byChat.entries()];
      const values = entries
        .map((_, i) => `($1,$${i * 2 + 2},$${i * 2 + 3})`)
        .join(",");
      const params: (string | number)[] = [topicId];
      for (const [chatId, count] of entries) params.push(chatId, count);
      await pool.query(
        `insert into topic_groups (topic_id, chat_id, message_count)
         values ${values} on conflict do nothing`,
        params,
      );
    }
    created += 1;
  }
  console.log(`  [${scope}] created ${created} topics.`);
  return created;
}

async function main(): Promise<void> {
  // Cluster pautas across every active "Usuário" (WhatsApp number).
  const owners = await getActiveOwnerPhones(pool);
  if (owners.length === 0)
    throw new Error(
      "No active WhatsApp owner (whatsapp_accounts empty and WHATSAPP_OWNER unset).",
    );
  console.log("Building topics...");
  // SCOPE=private|group runs a single scope (each clustering call can exceed a
  // shell timeout); default rebuilds both. Each scope's writes are independent.
  const only = process.env.SCOPE;
  const a = only === "group" ? 0 : await buildScope("private", owners);
  const b = only === "private" ? 0 : await buildScope("group", owners);

  const { rows: cross } = await pool.query<{ n: string }>(
    `select count(*)::int n from (
       select t.id from topics t
       join topic_groups tg on tg.topic_id = t.id
       where t.tenant_id = $1 and t.scope = 'group'
       group by t.id having count(distinct tg.chat_id) > 1
     ) x`,
    [T],
  );
  console.log(`\n✓ total topics: ${a + b}. cross-group pautas: ${cross[0]?.n}`);
  await pool.end();
}

void main().catch((e) => {
  console.error("build-topics failed:", (e as Error).message);
  process.exit(1);
});
