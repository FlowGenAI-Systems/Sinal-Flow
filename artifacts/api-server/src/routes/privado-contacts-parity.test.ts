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

// Cross-screen parity suite: a contact's DM message total must be IDENTICAL on
// the Privado surfaces (top-contacts / thread / pending) and on the Contatos
// surfaces (/contacts list msg_count and /contacts/:id/messages drill).
//
// The Contatos screen keys DMs by the *effective* partner phone
// coalesce(nullif(chat_id,''), nullif(contact_phone,'')) — chat_id is the DM
// partner phone, but some rows only carry contact_phone. If the Privado routes
// keyed on chat_id alone they would silently drop contact_phone-only DMs and a
// contact's number would diverge between the two screens. These fixtures put a
// contact reachable ONLY via contact_phone (empty chat_id), plus a mixed
// contact, exactly to exercise that fallback.

interface Msg {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  chat_id: string; // "" means absent -> use contact_phone
  contact_phone: string;
  direction: "inbound" | "outbound";
  minutes_ago: number;
}

const C_PHONE_ONLY = "33333333-3333-3333-3333-333333333333";
const C_MIXED = "22222222-2222-2222-2222-222222222222";
const C_CHATID = "11111111-1111-1111-1111-111111111111";

const CONTACTS: Array<{ id: string; phone: string; name: string }> = [
  // standard DM keyed by chat_id
  { id: C_CHATID, phone: "pA", name: "Contato A" },
  // mixed: one row keyed by chat_id, one only by contact_phone
  { id: C_MIXED, phone: "pM", name: "Contato M" },
  // reachable ONLY via the contact_phone fallback (chat_id empty)
  { id: C_PHONE_ONLY, phone: "pC", name: "Contato C" },
];

const MSGS: Msg[] = [
  // --- Contact A (chat_id only): latest is outbound -> not a pendency. Total 2.
  { message_id: "a1", owner: OWNER, chat_type: "private", chat_id: "pA", contact_phone: "", direction: "inbound", minutes_ago: 40 },
  { message_id: "a2", owner: OWNER, chat_type: "private", chat_id: "pA", contact_phone: "", direction: "outbound", minutes_ago: 5 },
  // --- Contact M (mixed): m1 keyed by chat_id, m2 only by contact_phone and is
  // the latest inbound that requires a reply -> pendency. Total 2.
  { message_id: "m1", owner: OWNER, chat_type: "private", chat_id: "pM", contact_phone: "", direction: "inbound", minutes_ago: 30 },
  { message_id: "m2", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "pM", direction: "inbound", minutes_ago: 7 },
  // --- Contact C (contact_phone only): latest inbound requires a reply ->
  // pendency. Total 3. If any Privado route keyed on chat_id alone, C would be
  // dropped entirely and its number would diverge from Contatos.
  { message_id: "c1", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "pC", direction: "inbound", minutes_ago: 50 },
  { message_id: "c2", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "pC", direction: "outbound", minutes_ago: 20 },
  { message_id: "c3", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "pC", direction: "inbound", minutes_ago: 9 },
  // --- noise that must never be attributed to any contact ---
  // group message for C's phone -> excluded by chat_type
  { message_id: "n_group", owner: OWNER, chat_type: "group", chat_id: "", contact_phone: "pC", direction: "inbound", minutes_ago: 11 },
  // wrong-owner private message for C's phone -> excluded by owner scoping
  { message_id: "n_owner", owner: "someone-else", chat_type: "private", chat_id: "", contact_phone: "pC", direction: "inbound", minutes_ago: 12 },
  // private message for a phone with no CRM contact -> attributed to nobody
  { message_id: "n_orphan", owner: OWNER, chat_type: "private", chat_id: "pX", contact_phone: "", direction: "inbound", minutes_ago: 13 },
];

// requires_reply must be true on the LATEST message of a contact for it to enter
// the pending/unanswered queue. c3 and m2 are those latest messages.
const ENRICH: Array<{ message_id: string; requires_reply: boolean }> = [
  { message_id: "c3", requires_reply: true },
  { message_id: "m2", requires_reply: true },
];

const EXPECTED_TOTAL: Record<string, number> = { pA: 2, pM: 2, pC: 3 };

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  tenantId = harness.tenantId;
  get = harness.get;

  await pool.query(`drop table if exists pending_dismissals`);
  await pool.query(`drop table if exists contact_labels`);
  await pool.query(`drop table if exists labels`);
  await pool.query(`drop table if exists tasks`);
  await pool.query(`drop table if exists contacts`);
  await createWhatsappMessagesTable(pool);
  await createMessageEnrichmentTable(pool);
  await pool.query(`
    create table contacts (
      id uuid primary key,
      tenant_id uuid not null,
      display_name text,
      email text,
      description text,
      primary_phone text,
      dominant_category text,
      last_interaction_at timestamptz,
      msg_count integer not null default 0,
      msg_count_at timestamptz,
      source text not null default 'dm',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table tasks (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      contact_id uuid,
      title text,
      direction text,
      due_at timestamptz,
      done boolean not null default false,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table labels (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      name text,
      color text
    )
  `);
  await pool.query(`
    create table contact_labels (
      contact_id uuid,
      label_id uuid,
      primary key (contact_id, label_id)
    )
  `);
  await pool.query(`
    create table pending_dismissals (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      chat_id text not null,
      snooze_until timestamptz,
      created_at timestamptz not null default now(),
      unique (tenant_id, chat_id)
    )
  `);

  for (const m of MSGS) {
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, contact_phone,
          direction, message, message_created_at)
       values ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' minutes')::interval)`,
      [
        m.message_id,
        m.owner,
        m.chat_type,
        m.chat_id,
        m.contact_phone,
        m.direction,
        `texto ${m.message_id}`,
        String(m.minutes_ago),
      ],
    );
  }
  for (const e of ENRICH) {
    await pool.query(
      `insert into message_enrichment
         (message_id, tenant_id, chat_type, requires_reply)
       values ($1,$2,'private',$3)`,
      [e.message_id, tenantId, e.requires_reply],
    );
  }
  for (const c of CONTACTS) {
    await pool.query(
      `insert into contacts (id, tenant_id, display_name, primary_phone)
       values ($1,$2,$3,$4)`,
      [c.id, tenantId, c.name, c.phone],
    );
  }

  // msg_count is now a cached column populated by the contacts-maintenance job;
  // refresh it once after the fixtures are in place so the list serves it.
  const { refreshContactMsgCounts } = await import("@workspace/db");
  await refreshContactMsgCounts(pool, { owner: OWNER, tenantId });
});

afterAll(async () => {
  if (pool) {
    await pool.query(`drop table if exists pending_dismissals`);
    await pool.query(`drop table if exists contact_labels`);
    await pool.query(`drop table if exists labels`);
    await pool.query(`drop table if exists tasks`);
    await pool.query(`drop table if exists contacts`);
    await dropMessageEnrichmentTable(pool);
    await dropWhatsappMessagesTable(pool);
    await pool.end();
  }
});

interface ContactRow {
  id: string;
  primary_phone: string | null;
  msg_count: number;
}
interface TopContact {
  phone: string;
  messages: number;
}
interface Pending {
  chat_id: string;
}

describe("Privado <-> Contatos DM count parity (contact_phone fallback)", () => {
  it("Contatos list msg_count == Privado top-contacts messages == per-contact drill", async () => {
    const { contacts } = (await get("/api/contacts")) as {
      contacts: ContactRow[];
    };
    const { contacts: top } = (await get("/api/metrics/private/top-contacts")) as {
      contacts: TopContact[];
    };
    const topByPhone = new Map(top.map((t) => [t.phone, t.messages]));

    for (const c of contacts) {
      const phone = c.primary_phone!;
      const expected = EXPECTED_TOTAL[phone];
      // Contatos list number.
      expect(c.msg_count, `list msg_count ${phone}`).toBe(expected);
      // Privado top-contacts number.
      expect(topByPhone.get(phone), `top-contacts ${phone}`).toBe(expected);
      // Contatos per-contact history drill.
      const drill = await get(`/api/contacts/${c.id}/messages`);
      expect(drill.messages.length, `drill ${phone}`).toBe(expected);
    }
  });

  it("the contact_phone-only contact (empty chat_id) matches on every surface", async () => {
    const { contacts } = (await get("/api/contacts")) as {
      contacts: ContactRow[];
    };
    const c = contacts.find((x) => x.primary_phone === "pC")!;
    expect(c.msg_count).toBe(3);

    const drill = await get(`/api/contacts/${c.id}/messages`);
    expect(drill.messages.length).toBe(3);

    const { contacts: top } = (await get("/api/metrics/private/top-contacts")) as {
      contacts: TopContact[];
    };
    expect(top.find((t) => t.phone === "pC")?.messages).toBe(3);

    // The Privado pending drawer keys the contact by its effective phone (pC),
    // and the thread drill for that key returns the full conversation.
    const { pending } = (await get("/api/metrics/private/pending")) as {
      pending: Pending[];
    };
    expect(pending.map((p) => p.chat_id)).toContain("pC");
    const thread = await get("/api/metrics/private/thread", { chatId: "pC" });
    expect(thread.messages.length).toBe(3);
  });

  it("pending keys every unanswered contact by its effective phone, thread matches Contatos", async () => {
    const { pending } = (await get("/api/metrics/private/pending")) as {
      pending: Pending[];
    };
    // Latest-inbound-requires-reply contacts: C (pC) and M (pM). A ends on an
    // outbound message so it is not a pendency.
    expect(pending.map((p) => p.chat_id).sort()).toEqual(["pC", "pM"]);

    const { contacts } = (await get("/api/contacts")) as {
      contacts: ContactRow[];
    };
    for (const p of pending) {
      const contact = contacts.find((c) => c.primary_phone === p.chat_id)!;
      const thread = await get("/api/metrics/private/thread", {
        chatId: p.chat_id,
      });
      const drill = await get(`/api/contacts/${contact.id}/messages`);
      expect(thread.messages.length, `thread ${p.chat_id}`).toBe(
        contact.msg_count,
      );
      expect(drill.messages.length, `drill ${p.chat_id}`).toBe(
        contact.msg_count,
      );
    }
  });

  it("group, wrong-owner and orphan-phone rows never inflate any contact", async () => {
    const { contacts } = (await get("/api/contacts")) as {
      contacts: ContactRow[];
    };
    const total = contacts.reduce((a, c) => a + c.msg_count, 0);
    // Only the 7 valid private messages (a1,a2,m1,m2,c1,c2,c3) are attributable.
    expect(total).toBe(7);
  });
});
