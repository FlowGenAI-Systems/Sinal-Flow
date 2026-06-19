import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  OWNER,
  type Pool,
  createMessageEnrichmentTable,
  createSupportGroupsTable,
  createWhatsappMessagesTable,
  dropMessageEnrichmentTable,
  dropSupportGroupsTable,
  dropWhatsappMessagesTable,
  setupHarness,
} from "../test/fixtures";

let pool: Pool;
let tenantId: string;
let get: Awaited<ReturnType<typeof setupHarness>>["get"];

interface Msg {
  message_id: string;
  chat_id: string;
  chat_name: string;
  direction: "inbound" | "outbound";
}

interface Enrich {
  message_id: string;
  topics: string[];
}

// Group fixtures. The aggregate (/metrics/groups/topics) is the Overview group
// topic cloud (case-folded, support-groups excluded, blacklist applied); the
// drill (/metrics/groups/topic-examples) returns the real source messages for
// one topic. Every cloud count MUST equal the drill row count.
const SUPPORT_GROUP = "gsup";

const MSGS: Msg[] = [
  { message_id: "g1", chat_id: "gA", chat_name: "Grupo A", direction: "inbound" },
  { message_id: "g2", chat_id: "gA", chat_name: "Grupo A", direction: "inbound" },
  // casing variant of the same topic, in another group -> folds to one label.
  { message_id: "g3", chat_id: "gB", chat_name: "Grupo B", direction: "outbound" },
  { message_id: "g4", chat_id: "gB", chat_name: "Grupo B", direction: "inbound" },
  // message in a support/noise group -> excluded from both cloud and drill.
  { message_id: "gs1", chat_id: SUPPORT_GROUP, chat_name: "Suporte", direction: "inbound" },
];

const ENRICH: Enrich[] = [
  { message_id: "g1", topics: ["show-rock"] },
  { message_id: "g2", topics: ["show-rock"] },
  { message_id: "g3", topics: ["Show-Rock"] }, // casing fold
  { message_id: "g4", topics: ["evento-vip"] },
  { message_id: "gs1", topics: ["assunto-secreto"] }, // support group -> hidden
];

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  tenantId = harness.tenantId;
  get = harness.get;

  await createWhatsappMessagesTable(pool);
  await createSupportGroupsTable(pool);
  await createMessageEnrichmentTable(pool);

  let i = 0;
  for (const m of MSGS) {
    i += 1;
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, chat_name, direction,
          sender_name, message, message_created_at)
       values ($1,$2,'group',$3,$4,$5,$6,$7, now() - ($8 || ' minutes')::interval)`,
      [m.message_id, OWNER, m.chat_id, m.chat_name, m.direction, `Autor ${m.message_id}`, `texto ${m.message_id}`, String(i)],
    );
  }
  for (const e of ENRICH) {
    await pool.query(
      `insert into message_enrichment (message_id, tenant_id, chat_type, topics)
       values ($1,$2,'group',$3)`,
      [e.message_id, tenantId, e.topics],
    );
  }
  await pool.query(
    `insert into support_groups (tenant_id, chat_id, name) values ($1,$2,$3)`,
    [tenantId, SUPPORT_GROUP, "Suporte"],
  );
});

afterAll(async () => {
  if (pool) {
    await dropMessageEnrichmentTable(pool);
    await dropWhatsappMessagesTable(pool);
    await dropSupportGroupsTable(pool);
    await pool.end();
  }
});

describe("Grupos topic cloud parity (aggregates vs drill-down)", () => {
  it("each cloud topic count == topic-examples row count", async () => {
    const { topics } = await get("/api/metrics/groups/topics");
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics as Array<{
      topic: string;
      count: number;
      group_count: number;
    }>) {
      const drill = await get("/api/metrics/groups/topic-examples", {
        topic: t.topic,
        limit: "50",
      });
      expect(drill.examples.length, `group topic ${t.topic}`).toBe(t.count);
    }
  });

  it("case variants fold into one label whose count covers all casings", async () => {
    const { topics } = await get("/api/metrics/groups/topics");
    const labels = (topics as Array<{ topic: string }>).map((t) =>
      t.topic.toLowerCase(),
    );
    // 'show-rock' (x2) + 'Show-Rock' (x1) must be a single folded entry of 3.
    expect(labels.filter((l) => l === "show-rock")).toHaveLength(1);
    const show = (topics as Array<{ topic: string; count: number }>).find(
      (t) => t.topic.toLowerCase() === "show-rock",
    );
    expect(show?.count).toBe(3);
  });

  it("support-group topics are excluded from both cloud and drill", async () => {
    const { topics } = await get("/api/metrics/groups/topics");
    const labels = (topics as Array<{ topic: string }>).map((t) =>
      t.topic.toLowerCase(),
    );
    expect(labels).not.toContain("assunto-secreto");
    const drill = await get("/api/metrics/groups/topic-examples", {
      topic: "assunto-secreto",
      limit: "50",
    });
    expect(drill.examples).toHaveLength(0);
  });
});
