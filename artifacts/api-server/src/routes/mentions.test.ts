import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  OWNER,
  type Pool,
  createMentionsTable,
  createMonitoredEntitiesTable,
  createSupportGroupsTable,
  createWhatsappMessagesTable,
  dropMentionsTable,
  dropMonitoredEntitiesTable,
  dropSupportGroupsTable,
  dropWhatsappMessagesTable,
  setupHarness,
} from "../test/fixtures";

let pool: Pool;
let tenantId: string;
let entityA: string;
let entityB: string;
let get: Awaited<ReturnType<typeof setupHarness>>["get"];

const SUPPORT_GROUP = "gsup";

interface Mention {
  message_id: string;
  chat_type: "private" | "group";
  chat_id: string;
  entity: "A" | "B";
  type: string;
}

// Mentions fixtures. The KPIs (per mention_type count) are the displayed numbers
// on the Menções page; the feed (mentions list) is the drill. KPI counts MUST
// equal the feed rows for the same filter, and the support-group exclusion must
// be applied identically to both — otherwise a number wouldn't open its source.
const MENTIONS: Mention[] = [
  { message_id: "m1", chat_type: "group", chat_id: "gA", entity: "A", type: "elogio" },
  { message_id: "m2", chat_type: "private", chat_id: "pX", entity: "A", type: "elogio" },
  { message_id: "m3", chat_type: "group", chat_id: "gA", entity: "B", type: "critica" },
  { message_id: "m4", chat_type: "group", chat_id: "gB", entity: "A", type: "duvida" },
  // support-group mention -> hidden by default, visible with includeSupport=1.
  { message_id: "ms", chat_type: "group", chat_id: SUPPORT_GROUP, entity: "A", type: "elogio" },
];

function kpiTotal(kpis: Array<{ count: number }>): number {
  return kpis.reduce((a, k) => a + k.count, 0);
}

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  tenantId = harness.tenantId;
  get = harness.get;

  await createWhatsappMessagesTable(pool);
  await createSupportGroupsTable(pool);
  await createMonitoredEntitiesTable(pool);
  await createMentionsTable(pool);

  const eA = await pool.query(
    `insert into monitored_entities (tenant_id, name, type) values ($1,$2,$3) returning id`,
    [tenantId, "Entidade A", "pessoa"],
  );
  const eB = await pool.query(
    `insert into monitored_entities (tenant_id, name, type) values ($1,$2,$3) returning id`,
    [tenantId, "Entidade B", "empresa"],
  );
  entityA = eA.rows[0].id;
  entityB = eB.rows[0].id;

  let i = 0;
  for (const m of MENTIONS) {
    i += 1;
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, chat_name, direction,
          sender_name, message, message_created_at)
       values ($1,$2,$3,$4,$5,'inbound',$6,$7, now() - ($8 || ' minutes')::interval)`,
      [m.message_id, OWNER, m.chat_type, m.chat_id, `Chat ${m.chat_id}`, `Autor ${m.message_id}`, `texto ${m.message_id}`, String(i)],
    );
    await pool.query(
      `insert into mentions (tenant_id, message_id, entity_id, mention_type, sentiment)
       values ($1,$2,$3,$4,$5)`,
      [tenantId, m.message_id, m.entity === "A" ? entityA : entityB, m.type, "neutro"],
    );
  }
  await pool.query(
    `insert into support_groups (tenant_id, chat_id, name) values ($1,$2,$3)`,
    [tenantId, SUPPORT_GROUP, "Suporte"],
  );
});

afterAll(async () => {
  if (pool) {
    await dropMentionsTable(pool);
    await dropMonitoredEntitiesTable(pool);
    await dropWhatsappMessagesTable(pool);
    await dropSupportGroupsTable(pool);
    await pool.end();
  }
});

describe("Menções KPI parity (counts vs feed drill-down)", () => {
  it("default: kpi total == feed length (support excluded)", async () => {
    const { mentions, kpis } = await get("/api/mentions");
    expect(mentions.length).toBeGreaterThan(0);
    // ms (support group) must be excluded by default.
    expect(mentions.length).toBe(4);
    expect(kpiTotal(kpis)).toBe(mentions.length);
  });

  it("default: each mention_type kpi == feed filtered by that type", async () => {
    const { kpis } = await get("/api/mentions");
    for (const k of kpis as Array<{ mention_type: string; count: number }>) {
      const feed = await get("/api/mentions", { type: k.mention_type });
      expect(feed.mentions.length, `type ${k.mention_type}`).toBe(k.count);
    }
  });

  it("includeSupport=1: kpi total == feed length and grows by the support row", async () => {
    const base = await get("/api/mentions");
    const all = await get("/api/mentions", { includeSupport: "1" });
    expect(all.mentions.length).toBe(base.mentions.length + 1);
    expect(kpiTotal(all.kpis)).toBe(all.mentions.length);
    for (const k of all.kpis as Array<{ mention_type: string; count: number }>) {
      const feed = await get("/api/mentions", {
        type: k.mention_type,
        includeSupport: "1",
      });
      expect(feed.mentions.length, `type ${k.mention_type} (support)`).toBe(
        k.count,
      );
    }
  });

  it("entity filter: kpi-less feed still matches a per-entity recount", async () => {
    // Filtering the feed by entity must agree with a direct count of that
    // entity's non-support mentions (drill stays consistent under entity scope).
    const feed = await get("/api/mentions", { entity: entityA });
    // entity A non-support: m1, m2, m4 (ms excluded) = 3
    expect(feed.mentions.length).toBe(3);
    const feedB = await get("/api/mentions", { entity: entityB });
    expect(feedB.mentions.length).toBe(1);
  });
});
