import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";

// Same harness as media.test.ts / metrics.test.ts: never touch the read-only
// Supabase data — point @workspace/db at the local Postgres (DATABASE_URL) and
// build throwaway fixtures (whatsapp_messages + the CRM tables the /contacts
// list query touches). Deleting SUPABASE_DB_URL *before* importing anything
// that pulls in @workspace/db is mandatory.
delete process.env.SUPABASE_DB_URL;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set to a local Postgres for the contacts parity test.",
  );
}
process.env.WHATSAPP_OWNER = process.env.WHATSAPP_OWNER ?? "tester-owner";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret";

type App = Awaited<typeof import("../app")>["default"];
type Pool = Awaited<typeof import("@workspace/db")>["pool"];

let app: App;
let pool: Pool;
let cookie: string;
let tenantId: string;

const OWNER = process.env.WHATSAPP_OWNER!;

interface Contact {
  id: string;
  primary_phone: string | null;
}

interface Msg {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  // chat_id is the DM partner phone; "" means absent (use contact_phone).
  chat_id: string;
  contact_phone: string;
  direction: "inbound" | "outbound";
}

// CRM contacts under test. The msg_count column on /contacts is computed from a
// grouped scan of whatsapp_messages keyed by the effective DM phone
// coalesce(nullif(chat_id,''), nullif(contact_phone,'')) and joined onto
// contacts by primary_phone — so each contact's effective phone is its key.
const CONTACTS: Contact[] = [
  // standard DM: messages keyed by chat_id == primary_phone
  { id: "11111111-1111-1111-1111-111111111111", primary_phone: "pA" },
  { id: "22222222-2222-2222-2222-222222222222", primary_phone: "pB" },
  // contact reachable ONLY via the contact_phone fallback (chat_id empty)
  { id: "33333333-3333-3333-3333-333333333333", primary_phone: "pC" },
  // promoted contact with a phone but no messages -> msg_count 0
  { id: "44444444-4444-4444-4444-444444444444", primary_phone: "pD" },
  // contact with no phone at all -> msg_count 0, drill returns []
  { id: "55555555-5555-5555-5555-555555555555", primary_phone: null },
];

const MSGS: Msg[] = [
  // --- contact A: mix of chat_id-keyed and contact_phone-fallback rows.
  // All three MUST count for A in both the list and the drill, exercising the
  // coalesce(chat_id, contact_phone) keying.
  { message_id: "a1", owner: OWNER, chat_type: "private", chat_id: "pA", contact_phone: "", direction: "inbound" },
  { message_id: "a2", owner: OWNER, chat_type: "private", chat_id: "pA", contact_phone: "", direction: "outbound" },
  { message_id: "a3", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "pA", direction: "inbound" },
  // --- contact B: chat_id-keyed only.
  { message_id: "b1", owner: OWNER, chat_type: "private", chat_id: "pB", contact_phone: "", direction: "inbound" },
  // --- contact C: contact_phone-fallback only (chat_id empty). If either the
  // list or the drill dropped the contact_phone fallback, C would diverge.
  { message_id: "c1", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "pC", direction: "inbound" },
  { message_id: "c2", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "pC", direction: "outbound" },
  // --- noise that must never be counted for any contact ---
  // group message for A's phone -> excluded by chat_type
  { message_id: "n_group", owner: OWNER, chat_type: "group", chat_id: "pA", contact_phone: "", direction: "inbound" },
  // wrong-owner private message for A's phone -> excluded by owner scoping
  { message_id: "n_owner", owner: "someone-else", chat_type: "private", chat_id: "pA", contact_phone: "", direction: "inbound" },
  // private message for a phone with no CRM contact -> attributed to nobody
  { message_id: "n_orphan", owner: OWNER, chat_type: "private", chat_id: "pX", contact_phone: "", direction: "inbound" },
];

async function get(path: string, query: Record<string, string> = {}) {
  const res = await request(app).get(path).query(query).set("Cookie", cookie);
  expect(res.status, `${path} ${JSON.stringify(query)} -> ${res.status}`).toBe(
    200,
  );
  return res.body;
}

beforeAll(async () => {
  const db = await import("@workspace/db");
  pool = db.pool;
  app = (await import("../app")).default;
  const auth = await import("../lib/auth");
  const scope = await import("../lib/scope");
  tenantId = scope.OWNER_TENANT_ID;

  cookie = `${auth.SESSION_COOKIE}=${auth.createSessionToken({
    userId: "test-user",
    tenantId,
    email: "test@example.com",
  })}`;

  await pool.query(`drop table if exists contact_labels`);
  await pool.query(`drop table if exists labels`);
  await pool.query(`drop table if exists tasks`);
  await pool.query(`drop table if exists contacts`);
  await pool.query(`drop table if exists whatsapp_messages`);

  await pool.query(`
    create table whatsapp_messages (
      message_id text primary key,
      whatsapp_owner text not null,
      chat_type text not null,
      chat_id text,
      chat_name text,
      direction text,
      media_url text,
      metadata jsonb,
      message_created_at timestamptz default now(),
      sender_name text,
      sender_phone text,
      contact_phone text,
      message text,
      caption text,
      transcription text
    )
  `);
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
      ai_analysis text,
      ai_analysis_at timestamptz,
      ai_analysis_msg_count integer,
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
      done boolean not null default false,
      due_at timestamptz,
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

  for (const c of CONTACTS) {
    await pool.query(
      `insert into contacts (id, tenant_id, display_name, primary_phone)
       values ($1, $2, $3, $4)`,
      [c.id, tenantId, `Contato ${c.primary_phone ?? "sem telefone"}`, c.primary_phone],
    );
  }

  let i = 0;
  for (const m of MSGS) {
    i += 1;
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
        String(i),
      ],
    );
  }

  // msg_count is now a cached column populated by the contacts-maintenance job;
  // refresh it once after the fixtures are in place so the list serves it.
  const { refreshContactMsgCounts } = await import("@workspace/db");
  await refreshContactMsgCounts(pool, { owners: [OWNER], tenantId });
});

afterAll(async () => {
  if (pool) {
    await pool.query(`drop table if exists contact_labels`);
    await pool.query(`drop table if exists labels`);
    await pool.query(`drop table if exists tasks`);
    await pool.query(`drop table if exists contacts`);
    await pool.query(`drop table if exists whatsapp_messages`);
    await pool.end();
  }
});

describe("Contatos count parity (list msg_count vs history drill)", () => {
  it("each contact's msg_count == its history drill message count", async () => {
    const { contacts } = await get("/api/contacts");
    expect(contacts.length).toBe(CONTACTS.length);
    // sanity: at least one contact actually has messages
    expect(
      (contacts as Array<{ msg_count: number }>).some((c) => c.msg_count > 0),
    ).toBe(true);

    for (const c of contacts as Array<{ id: string; msg_count: number }>) {
      const drill = await get(`/api/contacts/${c.id}/messages`);
      expect(drill.messages.length, `contact ${c.id} drill count`).toBe(
        c.msg_count,
      );
    }
  });

  it("coalesce(chat_id, contact_phone) keying: known per-contact totals", async () => {
    const { contacts } = await get("/api/contacts");
    const byPhone = new Map<string | null, number>(
      (contacts as Array<{ primary_phone: string | null; msg_count: number }>).map(
        (c) => [c.primary_phone, c.msg_count],
      ),
    );
    expect(byPhone.get("pA")).toBe(3); // chat_id + contact_phone fallback
    expect(byPhone.get("pB")).toBe(1); // chat_id only
    expect(byPhone.get("pC")).toBe(2); // contact_phone fallback only
    expect(byPhone.get("pD")).toBe(0); // phone but no messages
    expect(byPhone.get(null)).toBe(0); // no phone at all
  });

  it("excludes group, wrong-owner and orphan-phone noise from every contact", async () => {
    const { contacts } = await get("/api/contacts");
    const total = (contacts as Array<{ msg_count: number }>).reduce(
      (a, c) => a + c.msg_count,
      0,
    );
    // Only the 6 valid private messages (a1,a2,a3,b1,c1,c2) are attributable;
    // group/wrong-owner/orphan rows must not inflate any contact.
    expect(total).toBe(6);

    // the drill for a phone-less contact returns nothing
    const phoneless = (contacts as Array<{ id: string; primary_phone: string | null }>).find(
      (c) => c.primary_phone === null,
    )!;
    const drill = await get(`/api/contacts/${phoneless.id}/messages`);
    expect(drill.messages.length).toBe(0);
  });
});
