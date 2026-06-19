import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { type Pool, setupHarness } from "../test/fixtures";

let pool: Pool;
let tenantId: string;
let get: Awaited<ReturnType<typeof setupHarness>>["get"];

// Salvos & Tasks page count-parity suite. The page is two stores keyed by the
// authenticated tenant:
//   - Itens Salvos (/saved): the total and every kind facet must reconcile, and
//     each ?kind= drill must return only that kind.
//   - Tarefas (/tasks): the badges the page derives (open / done / mine /
//     theirs / late / "pendências de mim") must each equal the corresponding
//     filtered drill, and every filter must be a strict subset of the full
//     list. Tenant scoping must drop rows from another tenant entirely.

const OTHER_TENANT = "00000000-0000-0000-0000-0000000000ff";

interface Saved {
  kind: string;
}

interface Task {
  id: string;
  done: boolean;
  direction: string | null;
  due_at: string | null;
}

const C_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  tenantId = harness.tenantId;
  get = harness.get;

  await pool.query(`drop table if exists saved_items`);
  await pool.query(`drop table if exists tasks`);
  await pool.query(`drop table if exists contacts`);
  await pool.query(`
    create table saved_items (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      kind text,
      source_type text,
      source_id text,
      text text,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table contacts (
      id uuid primary key,
      tenant_id uuid not null,
      display_name text,
      primary_phone text
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
  await pool.query(
    `insert into contacts (id, tenant_id, display_name, primary_phone)
     values ($1,$2,'Contato A','pA')`,
    [C_A, tenantId],
  );

  // Saved items: 2 pauta, 1 topic, 1 message + one row in another tenant.
  const saved: Array<{ kind: string; tenant: string }> = [
    { kind: "pauta", tenant: tenantId },
    { kind: "pauta", tenant: tenantId },
    { kind: "topic", tenant: tenantId },
    { kind: "message", tenant: tenantId },
    { kind: "pauta", tenant: OTHER_TENANT },
  ];
  for (const s of saved) {
    await pool.query(
      `insert into saved_items (tenant_id, kind, text) values ($1,$2,$3)`,
      [s.tenant, s.kind, `salvo ${s.kind}`],
    );
  }

  // Tasks: open/done x direction x due, plus one row in another tenant.
  const tasks: Array<{
    tenant: string;
    contact: string | null;
    direction: string | null;
    done: boolean;
    due: string | null;
  }> = [
    { tenant: tenantId, contact: C_A, direction: "mine", done: false, due: "-2 days" }, // open, mine, late
    { tenant: tenantId, contact: C_A, direction: "mine", done: false, due: "3 days" }, // open, mine, future
    { tenant: tenantId, contact: null, direction: "theirs", done: false, due: null }, // open, theirs
    { tenant: tenantId, contact: C_A, direction: "mine", done: true, due: null }, // done, mine
    { tenant: tenantId, contact: null, direction: null, done: false, due: null }, // open, no direction
    { tenant: OTHER_TENANT, contact: null, direction: "mine", done: false, due: "-1 days" }, // other tenant
  ];
  for (const t of tasks) {
    await pool.query(
      `insert into tasks (tenant_id, contact_id, title, direction, done, due_at)
       values ($1,$2,$3,$4,$5, case when $6::text is null then null
                                     else now() + ($6 || '')::interval end)`,
      [t.tenant, t.contact, "tarefa", t.direction, t.done, t.due],
    );
  }
});

afterAll(async () => {
  if (pool) {
    await pool.query(`drop table if exists saved_items`);
    await pool.query(`drop table if exists tasks`);
    await pool.query(`drop table if exists contacts`);
    await pool.end();
  }
});

describe("Salvos · Itens salvos count parity (total vs kind facets)", () => {
  it("total == sum of per-kind drills; each kind drill is scoped to its kind", async () => {
    const { saved } = await get("/api/saved");
    const all = saved as Saved[];
    expect(all.length).toBe(4); // other-tenant row excluded
    const kinds = Array.from(new Set(all.map((s) => s.kind)));
    let summed = 0;
    for (const kind of kinds) {
      const drill = (await get("/api/saved", { kind })).saved as Saved[];
      // The drill returns only that kind...
      expect(drill.every((s) => s.kind === kind), `kind ${kind}`).toBe(true);
      // ...and matches the count within the full list.
      expect(drill.length, `kind ${kind} count`).toBe(
        all.filter((s) => s.kind === kind).length,
      );
      summed += drill.length;
    }
    expect(summed).toBe(all.length);
  });
});

describe("Tarefas count parity (badges vs filtered drills)", () => {
  it("total == open + done, and every filter is a subset of the full list", async () => {
    const all = (await get("/api/tasks")).tasks as Task[];
    expect(all.length).toBe(5); // other-tenant row excluded
    const allIds = new Set(all.map((t) => t.id));

    const open = (await get("/api/tasks", { filter: "open" })).tasks as Task[];
    const done = (await get("/api/tasks", { filter: "done" })).tasks as Task[];
    expect(open.length + done.length).toBe(all.length);
    expect(open.every((t) => !t.done)).toBe(true);
    expect(done.every((t) => t.done)).toBe(true);
    for (const t of [...open, ...done]) {
      expect(allIds.has(t.id)).toBe(true);
    }
    // Cross-check the counts against the full list.
    expect(open.length).toBe(all.filter((t) => !t.done).length); // 4
    expect(done.length).toBe(all.filter((t) => t.done).length); // 1
  });

  it("mine / theirs drills match the directions in the full list", async () => {
    const all = (await get("/api/tasks")).tasks as Task[];
    const mine = (await get("/api/tasks", { filter: "mine" })).tasks as Task[];
    const theirs = (await get("/api/tasks", { filter: "theirs" })).tasks as Task[];
    expect(mine.every((t) => t.direction === "mine")).toBe(true);
    expect(theirs.every((t) => t.direction === "theirs")).toBe(true);
    expect(mine.length).toBe(all.filter((t) => t.direction === "mine").length); // 3
    expect(theirs.length).toBe(
      all.filter((t) => t.direction === "theirs").length,
    ); // 1

    // "Pendências de mim" KPI = my open tasks (mine list, not done).
    const minePending = mine.filter((t) => !t.done).length;
    expect(minePending).toBe(2);
  });

  it("late drill == open tasks past due, and is a subset of open", async () => {
    const open = (await get("/api/tasks", { filter: "open" })).tasks as Task[];
    const late = (await get("/api/tasks", { filter: "late" })).tasks as Task[];
    const now = Date.now();
    const expectedLate = open.filter(
      (t) => t.due_at !== null && new Date(t.due_at).getTime() < now,
    );
    expect(late.length).toBe(expectedLate.length); // 1
    const openIds = new Set(open.map((t) => t.id));
    expect(late.every((t) => openIds.has(t.id))).toBe(true);
  });
});
