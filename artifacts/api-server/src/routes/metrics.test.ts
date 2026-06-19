import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  OWNER,
  type Pool,
  createMessageEnrichmentTable,
  createWhatsappMessagesTable,
  dropMessageEnrichmentTable,
  dropWhatsappMessagesTable,
  setupHarness,
} from "../test/fixtures";

let pool: Pool;
let tenantId: string;
let get: Awaited<ReturnType<typeof setupHarness>>["get"];

interface Msg {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  chat_id: string;
  contact_phone?: string;
  chat_name: string;
  direction: "inbound" | "outbound";
}

interface Enrich {
  message_id: string;
  chat_type: "private" | "group";
  topics: string[];
  is_question: boolean;
}

// Private DM fixtures. The aggregates (trending / intelligence) count topic
// occurrences across enriched private messages; the drill
// (/metrics/private/topic-examples) returns the actual source messages for one
// topic. Every displayed topic count MUST equal the drill row count.
const MSGS: Msg[] = [
  { message_id: "p1", owner: OWNER, chat_type: "private", chat_id: "pA", chat_name: "Contato A", direction: "inbound" },
  { message_id: "p2", owner: OWNER, chat_type: "private", chat_id: "pA", chat_name: "Contato A", direction: "inbound" },
  { message_id: "p3", owner: OWNER, chat_type: "private", chat_id: "pB", chat_name: "Contato B", direction: "inbound" },
  { message_id: "p4", owner: OWNER, chat_type: "private", chat_id: "pB", chat_name: "Contato B", direction: "outbound" },
  { message_id: "p5", owner: OWNER, chat_type: "private", chat_id: "pB", chat_name: "Contato B", direction: "inbound" },
  // pC: contact_phone-only DM (empty chat_id) — must still contribute to the
  // pauta's person_count via the effective-phone fallback.
  { message_id: "p6", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "pC", chat_name: "Contato C", direction: "inbound" },
  // group message with a private-looking topic — must NOT leak into the private
  // aggregates/drill (chat_type scoping).
  { message_id: "gx", owner: OWNER, chat_type: "group", chat_id: "g9", chat_name: "Grupo 9", direction: "inbound" },
  // wrong-owner private message (no enrichment) — owner scoping must ignore it.
  { message_id: "no", owner: "someone-else", chat_type: "private", chat_id: "pZ", chat_name: "Intruso", direction: "inbound" },
];

const ENRICH: Enrich[] = [
  { message_id: "p1", chat_type: "private", topics: ["festival-de-jazz", "contrato-novo"], is_question: true },
  { message_id: "p2", chat_type: "private", topics: ["festival-de-jazz"], is_question: false },
  { message_id: "p3", chat_type: "private", topics: ["festival-de-jazz"], is_question: true },
  { message_id: "p4", chat_type: "private", topics: ["contrato-novo"], is_question: false },
  { message_id: "p5", chat_type: "private", topics: ["mudanca-de-casa"], is_question: false },
  { message_id: "p6", chat_type: "private", topics: ["parceria-contact-phone"], is_question: true },
  // group enrichment reusing a private topic name — excluded by chat_type.
  { message_id: "gx", chat_type: "group", topics: ["festival-de-jazz"], is_question: false },
];

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  tenantId = harness.tenantId;
  get = harness.get;

  await createWhatsappMessagesTable(pool);
  await createMessageEnrichmentTable(pool);

  let i = 0;
  for (const m of MSGS) {
    i += 1;
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, contact_phone, chat_name, direction,
          message, message_created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now() - ($9 || ' minutes')::interval)`,
      [m.message_id, m.owner, m.chat_type, m.chat_id, m.contact_phone ?? null, m.chat_name, m.direction, `texto ${m.message_id}`, String(i)],
    );
  }
  for (const e of ENRICH) {
    await pool.query(
      `insert into message_enrichment
         (message_id, tenant_id, chat_type, topics, is_question)
       values ($1,$2,$3,$4,$5)`,
      [e.message_id, tenantId, e.chat_type, e.topics, e.is_question],
    );
  }
});

afterAll(async () => {
  if (pool) {
    await dropMessageEnrichmentTable(pool);
    await dropWhatsappMessagesTable(pool);
    await pool.end();
  }
});

describe("Visão Geral private topic parity (aggregates vs drill-down)", () => {
  it("trending: each topic count == topic-examples row count", async () => {
    const { trending } = await get("/api/metrics/private/trending");
    expect(trending.length).toBeGreaterThan(0);
    for (const t of trending as Array<{ topic: string; count: number }>) {
      const drill = await get("/api/metrics/private/topic-examples", {
        topic: t.topic,
        limit: "50",
      });
      expect(drill.examples.length, `trending topic ${t.topic}`).toBe(t.count);
    }
  });

  it("intelligence: each pauta count == topic-examples row count", async () => {
    const { intelligence } = await get("/api/metrics/private/intelligence");
    expect(intelligence.length).toBeGreaterThan(0);
    for (const t of intelligence as Array<{
      topic: string;
      count: number;
      person_count: number;
    }>) {
      const drill = await get("/api/metrics/private/topic-examples", {
        topic: t.topic,
        limit: "50",
      });
      expect(drill.examples.length, `intelligence topic ${t.topic}`).toBe(
        t.count,
      );
      // person_count must equal the distinct contacts in the drill.
      const people = new Set(
        (drill.examples as Array<{ sender_name: string | null }>).map(
          (e) => e.sender_name,
        ),
      );
      expect(people.size, `intelligence people ${t.topic}`).toBe(
        t.person_count,
      );
    }
  });

  it("content-ideas: a contact_phone-only DM contributes to person_count", async () => {
    const { ideas } = await get("/api/metrics/private/content-ideas", {
      limit: "30",
    });
    // p6 is a contact_phone-only inbound question (topic parceria-contact-phone).
    // If content-ideas keyed on chat_id alone it would be dropped (empty chat_id);
    // the effective-phone fallback must attribute it to one person.
    const idea = (
      ideas as Array<{
        topic: string;
        count: number;
        person_count: number;
        question_count: number;
      }>
    ).find((i) => i.topic === "parceria-contact-phone");
    expect(idea, "contact_phone-only topic present in content-ideas").toBeTruthy();
    expect(idea!.count).toBe(1);
    expect(idea!.person_count).toBe(1);
    expect(idea!.question_count).toBe(1);
  });

  it("content-ideas: person_count distinguishes contacts via the effective phone", async () => {
    const { ideas } = await get("/api/metrics/private/content-ideas", {
      limit: "30",
    });
    // festival-de-jazz is asked by pA (p1) and pB (p3) inbound -> 2 distinct people.
    const jazz = (
      ideas as Array<{ topic: string; person_count: number }>
    ).find((i) => i.topic === "festival-de-jazz");
    expect(jazz?.person_count).toBe(2);
  });

  it("private aggregates exclude group + wrong-owner noise", async () => {
    // 'festival-de-jazz' has 3 private occurrences (p1,p2,p3); the group copy
    // (gx) and the wrong-owner msg must not be counted.
    const drill = await get("/api/metrics/private/topic-examples", {
      topic: "festival-de-jazz",
      limit: "50",
    });
    const ids = (drill.examples as Array<{ message_id: string }>).map(
      (m) => m.message_id,
    );
    expect(ids.sort()).toEqual(["p1", "p2", "p3"]);
  });
});
