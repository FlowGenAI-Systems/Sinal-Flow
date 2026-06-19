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

// Privado page count-parity suite. metrics.test.ts already covers the private
// topic cloud (intelligence/trending -> /metrics/private/topic-examples). This
// suite closes the remaining Privado panels:
//   - Convites & oportunidades (/metrics/private/invites): the deduped per-
//     contact cards, their message_count, the recebidos/feitos split and the
//     "em aberto" KPI must reflect exactly the source invite messages.
//   - Pendências de contatos (/metrics/private/pending): each row's open_tasks
//     badge must equal that contact's open tasks drill (/tasks?filter=open),
//     and snoozed unanswered contacts must drop out of the worklist.

interface Msg {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  chat_id: string;
  contact_phone?: string;
  chat_name: string;
  direction: "inbound" | "outbound";
  minutes_ago: number;
}

interface Enrich {
  message_id: string;
  chat_type: "private" | "group";
  category: string | null;
  requires_reply: boolean | null;
  summary: string | null;
}

const WINDOW_DAYS = 30;
const OLD = WINDOW_DAYS * 24 * 60 + 100; // safely older than the 30-day window

// --- Invite fixtures: distinct chats so they never collide with the pending
// fixtures below. requires_reply is false on every invite message so they can
// never leak into the unanswered queue. ---
const INVITE_MSGS: Msg[] = [
  // iA: two inbound "convite" messages -> one card, message_count 2, recebido.
  { message_id: "ia1", owner: OWNER, chat_type: "private", chat_id: "iA", chat_name: "Convidante A", direction: "inbound", minutes_ago: 50 },
  { message_id: "ia2", owner: OWNER, chat_type: "private", chat_id: "iA", chat_name: "Convidante A", direction: "inbound", minutes_ago: 40 },
  // iB: one outbound "oportunidade/parceria" -> feito por mim.
  { message_id: "ib1", owner: OWNER, chat_type: "private", chat_id: "iB", chat_name: "Parceiro B", direction: "outbound", minutes_ago: 45 },
  // iC: one inbound "convite", later triaged 'resolvido' -> recebido but not aberto.
  { message_id: "ic1", owner: OWNER, chat_type: "private", chat_id: "iC", chat_name: "Convidante C", direction: "inbound", minutes_ago: 30 },
  // iD: contact_phone-only DM (empty chat_id) -> must still surface as a card,
  // keyed on the effective phone (contact_phone fallback).
  { message_id: "id1", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "iD", chat_name: "Convidante D", direction: "inbound", minutes_ago: 28 },
  { message_id: "id2", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "iD", chat_name: "Convidante D", direction: "inbound", minutes_ago: 22 },
  // --- noise that must never appear as an invite ---
  // group invite -> excluded by chat_type.
  { message_id: "gconv", owner: OWNER, chat_type: "group", chat_id: "gG", chat_name: "Grupo", direction: "inbound", minutes_ago: 20 },
  // wrong-owner private invite -> excluded by owner scoping.
  { message_id: "wown", owner: "someone-else", chat_type: "private", chat_id: "iW", chat_name: "Intruso", direction: "inbound", minutes_ago: 15 },
  // out-of-window private invite -> excluded by the days filter.
  { message_id: "old", owner: OWNER, chat_type: "private", chat_id: "iO", chat_name: "Antigo", direction: "inbound", minutes_ago: OLD },
  // non-invite category private message -> excluded by category filter.
  { message_id: "duv", owner: OWNER, chat_type: "private", chat_id: "dv", chat_name: "Duvidoso", direction: "inbound", minutes_ago: 25 },
];

const INVITE_ENRICH: Enrich[] = [
  { message_id: "ia1", chat_type: "private", category: "convite", requires_reply: false, summary: "convite show" },
  { message_id: "ia2", chat_type: "private", category: "convite", requires_reply: false, summary: "reforco" },
  { message_id: "ib1", chat_type: "private", category: "oportunidade/parceria", requires_reply: false, summary: "proposta" },
  { message_id: "ic1", chat_type: "private", category: "convite", requires_reply: false, summary: "convite jantar" },
  { message_id: "id1", chat_type: "private", category: "convite", requires_reply: false, summary: "convite contact_phone" },
  { message_id: "id2", chat_type: "private", category: "oportunidade/parceria", requires_reply: false, summary: "parceria contact_phone" },
  { message_id: "gconv", chat_type: "group", category: "convite", requires_reply: false, summary: "convite grupo" },
  { message_id: "wown", chat_type: "private", category: "convite", requires_reply: false, summary: "intruso" },
  { message_id: "old", chat_type: "private", category: "convite", requires_reply: false, summary: "antigo" },
  { message_id: "duv", chat_type: "private", category: "duvida", requires_reply: false, summary: "duvida" },
];

// --- Pending fixtures: chats p1..p4 + CRM contacts/tasks. p1/p3/p4 end on an
// inbound message that requires a reply; p4 is snoozed. ---
const PENDING_MSGS: Msg[] = [
  { message_id: "mp1", owner: OWNER, chat_type: "private", chat_id: "p1", chat_name: "Contato 1", direction: "inbound", minutes_ago: 10 },
  { message_id: "mp2", owner: OWNER, chat_type: "private", chat_id: "p2", chat_name: "Contato 2", direction: "outbound", minutes_ago: 12 },
  { message_id: "mp3", owner: OWNER, chat_type: "private", chat_id: "p3", chat_name: "Contato 3", direction: "inbound", minutes_ago: 8 },
  { message_id: "mp4", owner: OWNER, chat_type: "private", chat_id: "p4", chat_name: "Contato 4", direction: "inbound", minutes_ago: 6 },
];

const PENDING_ENRICH: Enrich[] = [
  { message_id: "mp1", chat_type: "private", category: "duvida", requires_reply: true, summary: "preciso de resposta" },
  { message_id: "mp3", chat_type: "private", category: "duvida", requires_reply: true, summary: "aguardando" },
  { message_id: "mp4", chat_type: "private", category: "duvida", requires_reply: true, summary: "silenciado" },
];

const C1 = "11111111-1111-1111-1111-111111111111";
const C2 = "22222222-2222-2222-2222-222222222222";
const C3 = "33333333-3333-3333-3333-333333333333";
const C4 = "44444444-4444-4444-4444-444444444444";
const C5 = "55555555-5555-5555-5555-555555555555";

const CONTACTS: Array<{ id: string; phone: string; name: string }> = [
  { id: C1, phone: "p1", name: "Contato 1" },
  { id: C2, phone: "p2", name: "Contato 2" },
  { id: C3, phone: "p3", name: "Contato 3" },
  { id: C4, phone: "p4", name: "Contato 4" },
  { id: C5, phone: "p5", name: "Contato 5" },
];

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  tenantId = harness.tenantId;
  get = harness.get;

  await pool.query(`drop table if exists invite_triage`);
  await pool.query(`drop table if exists pending_dismissals`);
  await pool.query(`drop table if exists tasks`);
  await pool.query(`drop table if exists contacts`);
  await createWhatsappMessagesTable(pool);
  await createMessageEnrichmentTable(pool);
  await pool.query(`
    create table contacts (
      id uuid primary key,
      tenant_id uuid not null,
      display_name text,
      primary_phone text,
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
      note text,
      direction text,
      source_message_id text,
      due_at timestamptz,
      done boolean not null default false,
      done_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table invite_triage (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      chat_id text not null,
      status text not null default 'aberto',
      contact_id uuid,
      source_message_id text,
      direction text,
      name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, chat_id)
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

  const allMsgs = [...INVITE_MSGS, ...PENDING_MSGS];
  for (const m of allMsgs) {
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, contact_phone, chat_name, direction,
          message, message_created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now() - ($9 || ' minutes')::interval)`,
      [
        m.message_id,
        m.owner,
        m.chat_type,
        m.chat_id,
        m.contact_phone ?? null,
        m.chat_name,
        m.direction,
        `texto ${m.message_id}`,
        String(m.minutes_ago),
      ],
    );
  }
  for (const e of [...INVITE_ENRICH, ...PENDING_ENRICH]) {
    await pool.query(
      `insert into message_enrichment
         (message_id, tenant_id, chat_type, category, requires_reply, summary)
       values ($1,$2,$3,$4,$5,$6)`,
      [e.message_id, tenantId, e.chat_type, e.category, e.requires_reply, e.summary],
    );
  }

  for (const c of CONTACTS) {
    await pool.query(
      `insert into contacts (id, tenant_id, display_name, primary_phone)
       values ($1,$2,$3,$4)`,
      [c.id, tenantId, c.name, c.phone],
    );
  }

  // Tasks: C2 has two open, C3 one open (overdue), C5 one done, plus one open
  // task with no contact (counts in /tasks, never in pending).
  const taskRows: Array<{
    contact: string | null;
    title: string;
    direction: string | null;
    done: boolean;
    due: string | null;
  }> = [
    { contact: C2, title: "C2 tarefa a", direction: "mine", done: false, due: null },
    { contact: C2, title: "C2 tarefa b", direction: "theirs", done: false, due: null },
    { contact: C3, title: "C3 atrasada", direction: "mine", done: false, due: "-2 days" },
    { contact: C5, title: "C5 concluida", direction: "mine", done: true, due: null },
    { contact: null, title: "Solta", direction: "mine", done: false, due: null },
  ];
  for (const t of taskRows) {
    await pool.query(
      `insert into tasks (tenant_id, contact_id, title, direction, done, due_at)
       values ($1,$2,$3,$4,$5, case when $6::text is null then null
                                     else now() + ($6 || '')::interval end)`,
      [tenantId, t.contact, t.title, t.direction, t.done, t.due],
    );
  }

  // iC triaged resolvido; p4 unanswered pendency snoozed into the future.
  await pool.query(
    `insert into invite_triage (tenant_id, chat_id, status) values ($1,'iC','resolvido')`,
    [tenantId],
  );
  await pool.query(
    `insert into pending_dismissals (tenant_id, chat_id, snooze_until)
     values ($1,'p4', now() + interval '5 days')`,
    [tenantId],
  );
});

afterAll(async () => {
  if (pool) {
    await dropMessageEnrichmentTable(pool);
    await pool.query(`drop table if exists invite_triage`);
    await pool.query(`drop table if exists pending_dismissals`);
    await pool.query(`drop table if exists tasks`);
    await pool.query(`drop table if exists contacts`);
    await dropWhatsappMessagesTable(pool);
    await pool.end();
  }
});

interface Invite {
  phone: string;
  message_id: string;
  category: string;
  direction: "inbound" | "outbound";
  status: string;
  message_count: number;
}

async function fetchInvites(): Promise<Invite[]> {
  const { invites } = await get("/api/metrics/private/invites", {
    days: String(WINDOW_DAYS),
  });
  return invites as Invite[];
}

describe("Privado · Convites & oportunidades count parity", () => {
  it("one card per contact with the exact source message_count (effective-phone keyed)", async () => {
    const invites = await fetchInvites();
    // Deduped to one row per effective phone. iD has no chat_id (contact_phone
    // fallback) but must still appear.
    expect(invites.map((i) => i.phone).sort()).toEqual(["iA", "iB", "iC", "iD"]);
    const byPhone = new Map(invites.map((i) => [i.phone, i]));
    // message_count == number of invite source messages for that contact.
    expect(byPhone.get("iA")!.message_count).toBe(2);
    expect(byPhone.get("iB")!.message_count).toBe(1);
    expect(byPhone.get("iC")!.message_count).toBe(1);
    expect(byPhone.get("iD")!.message_count).toBe(2);
    // direction is the most recent invite message's direction.
    expect(byPhone.get("iA")!.direction).toBe("inbound");
    expect(byPhone.get("iB")!.direction).toBe("outbound");
    // iD's latest invite (id2) is inbound -> recebido.
    expect(byPhone.get("iD")!.direction).toBe("inbound");
  });

  it("recebidos/feitos split and 'em aberto' KPI match the cards", async () => {
    const invites = await fetchInvites();
    const received = invites.filter((i) => i.direction === "inbound");
    const sent = invites.filter((i) => i.direction === "outbound");
    // Header counters on the Privado page.
    expect(received.length).toBe(3); // iA, iC, iD
    expect(sent.length).toBe(1); // iB
    // "Convites em aberto" KPI counts received invites still status 'aberto'.
    const openReceived = received.filter((i) => i.status === "aberto");
    expect(openReceived.length).toBe(2); // iA and iD (iC is resolvido)
    expect(byStatus(invites, "resolvido")).toBe(1); // iC
  });

  it("excludes group, wrong-owner, out-of-window and non-invite noise", async () => {
    const invites = await fetchInvites();
    const phones = invites.map((i) => i.phone);
    for (const noise of ["gG", "iW", "iO", "dv"]) {
      expect(phones, `invite noise ${noise}`).not.toContain(noise);
    }
  });
});

function byStatus(invites: Invite[], status: string): number {
  return invites.filter((i) => i.status === status).length;
}

interface Pending {
  chat_id: string;
  contact_id: string | null;
  unanswered: boolean;
  open_tasks: number;
  tasks: Array<{ id: string }>;
}

interface TaskRow {
  id: string;
  contact_id: string | null;
  done: boolean;
  direction: string | null;
}

describe("Privado · Pendências de contatos count parity", () => {
  it("worklist = unanswered (not snoozed) merged with open-task contacts", async () => {
    const { pending } = await get("/api/metrics/private/pending", {
      days: String(WINDOW_DAYS),
    });
    const chats = (pending as Pending[]).map((p) => p.chat_id).sort();
    // p1 (unanswered only), p2 (open tasks only), p3 (both). p4 is snoozed.
    expect(chats).toEqual(["p1", "p2", "p3"]);
    expect((pending as Pending[]).find((p) => p.chat_id === "p4")).toBeUndefined();
  });

  it("each row's open_tasks badge == its open-tasks drill (and the embedded list)", async () => {
    const { pending } = await get("/api/metrics/private/pending", {
      days: String(WINDOW_DAYS),
    });
    const { tasks } = await get("/api/tasks", { filter: "open" });
    const openTasks = tasks as TaskRow[];
    // The drill never returns done tasks.
    expect(openTasks.every((t) => !t.done)).toBe(true);

    for (const p of pending as Pending[]) {
      // The badge equals the tasks the drawer lists in the same payload.
      expect(p.open_tasks, `embedded tasks ${p.chat_id}`).toBe(p.tasks.length);
      if (p.contact_id) {
        const drill = openTasks.filter((t) => t.contact_id === p.contact_id).length;
        expect(drill, `open-tasks drill ${p.chat_id}`).toBe(p.open_tasks);
      } else {
        // Unanswered-only contact: no open tasks attributed.
        expect(p.open_tasks).toBe(0);
      }
    }
  });
});
