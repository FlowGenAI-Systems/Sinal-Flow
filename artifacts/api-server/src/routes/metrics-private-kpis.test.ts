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

// Closes the two remaining Privado KPI panels left untested:
//   - "Tempo médio de resposta" (/metrics/private/response-time): latency is
//     measured in *business minutes* inside the 08:00–20:00, Mon–Fri window, so
//     overnight and weekend gaps must NOT inflate the average/median, and the
//     3-day wall-clock cap drops abandoned threads.
//   - "Distribuição por categoria" (/metrics/private/categories): one count per
//     category, DM only, within the days window, owner-scoped — group, wrong-
//     owner and out-of-window noise must never be counted.

const WINDOW_DAYS = 30;

// --- Response-time fixtures -------------------------------------------------
// All timestamps are anchored to the Monday of the week two weeks ago in São
// Paulo wall-clock time. That keeps every message 7–20 days in the past (well
// inside the 30-day window) AND on a known weekday/hour, so the business-minute
// math is fully deterministic regardless of when the suite runs.
//
// The default work window is 08:00–20:00 (12h/day), Mon–Fri. Expected pairs:
//   rt1 (same-day):  in Mon 10:00 -> out Mon 10:30          = 30 min
//   rt2 (overnight): in Mon 19:00 -> out Tue 09:00          = 60 (Mon) + 60 (Tue) = 120 min
//   rt3 (weekend):   in Fri 18:00 -> out next Mon 09:00     = 120 (Fri) + 60 (Mon) = 180 min
//   rt4 (cp-only):   in Mon 10:00 -> out Mon 10:30          = 30 min  (contact_phone, empty chat_id)
// => sample 4, latencies [30,120,180,30] -> avg 90, median 75. rt4 proves a
// contact_phone-only DM (empty chat_id) is keyed via the effective-phone
// fallback. If the overnight/weekend windowing were broken these would balloon
// to hundreds/thousands of minutes, so pinning avg/median proves the window is
// applied.
interface RtMsg {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  chat_id: string;
  contact_phone?: string;
  direction: "inbound" | "outbound";
  day_offset: number; // days from the anchor Monday (0 = Mon, 4 = Fri, 7 = next Mon)
  hour: number;
  minute: number;
}

const RT_MSGS: RtMsg[] = [
  // rt1: same-day reply, fully inside the window -> 30 business minutes.
  { message_id: "rt1i", owner: OWNER, chat_type: "private", chat_id: "rt1", direction: "inbound", day_offset: 0, hour: 10, minute: 0 },
  { message_id: "rt1o", owner: OWNER, chat_type: "private", chat_id: "rt1", direction: "outbound", day_offset: 0, hour: 10, minute: 30 },
  // rt2: overnight gap -> only the in-window slices count = 120 min (not ~14h).
  { message_id: "rt2i", owner: OWNER, chat_type: "private", chat_id: "rt2", direction: "inbound", day_offset: 0, hour: 19, minute: 0 },
  { message_id: "rt2o", owner: OWNER, chat_type: "private", chat_id: "rt2", direction: "outbound", day_offset: 1, hour: 9, minute: 0 },
  // rt3: weekend gap -> Sat/Sun excluded = 180 min (not ~3 days).
  { message_id: "rt3i", owner: OWNER, chat_type: "private", chat_id: "rt3", direction: "inbound", day_offset: 4, hour: 18, minute: 0 },
  { message_id: "rt3o", owner: OWNER, chat_type: "private", chat_id: "rt3", direction: "outbound", day_offset: 7, hour: 9, minute: 0 },
  // rt4: contact_phone-only DM (empty chat_id) -> same-day reply = 30 min. Keyed
  // via the effective-phone fallback so this thread joins the latency sample.
  { message_id: "rt4i", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "rt4", direction: "inbound", day_offset: 0, hour: 10, minute: 0 },
  { message_id: "rt4o", owner: OWNER, chat_type: "private", chat_id: "", contact_phone: "rt4", direction: "outbound", day_offset: 0, hour: 10, minute: 30 },
  // --- noise that must never count toward the sample ---
  // rtcap: reply >3 days later (wall clock) -> dropped by the abandoned-thread cap.
  { message_id: "rtci", owner: OWNER, chat_type: "private", chat_id: "rtcap", direction: "inbound", day_offset: 0, hour: 10, minute: 0 },
  { message_id: "rtco", owner: OWNER, chat_type: "private", chat_id: "rtcap", direction: "outbound", day_offset: 4, hour: 14, minute: 0 },
  // group pair -> excluded by chat_type = 'private'.
  { message_id: "rtgi", owner: OWNER, chat_type: "group", chat_id: "rtg", direction: "inbound", day_offset: 0, hour: 11, minute: 0 },
  { message_id: "rtgo", owner: OWNER, chat_type: "group", chat_id: "rtg", direction: "outbound", day_offset: 0, hour: 11, minute: 20 },
  // wrong-owner private pair -> excluded by owner scoping.
  { message_id: "rtwi", owner: "someone-else", chat_type: "private", chat_id: "rtw", direction: "inbound", day_offset: 0, hour: 11, minute: 0 },
  { message_id: "rtwo", owner: "someone-else", chat_type: "private", chat_id: "rtw", direction: "outbound", day_offset: 0, hour: 11, minute: 20 },
  // out-of-window private pair (~40 days ago) -> excluded by the days filter.
  { message_id: "rtoi", owner: OWNER, chat_type: "private", chat_id: "rto", direction: "inbound", day_offset: -26, hour: 10, minute: 0 },
  { message_id: "rtoo", owner: OWNER, chat_type: "private", chat_id: "rto", direction: "outbound", day_offset: -26, hour: 10, minute: 30 },
];

// --- Category fixtures -----------------------------------------------------
// All private category messages are inbound-only so they never form a response-
// time pair (no following outbound) and thus cannot pollute the sample above.
interface CatMsg {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  chat_id: string;
  category: string | null;
  minutes_ago: number;
}

const OLD = WINDOW_DAYS * 24 * 60 + 100; // safely older than the 30-day window

const CAT_MSGS: CatMsg[] = [
  // duvida x3 (two share a chat, one in another).
  { message_id: "ca1", owner: OWNER, chat_type: "private", chat_id: "catA", category: "duvida", minutes_ago: 60 },
  { message_id: "ca2", owner: OWNER, chat_type: "private", chat_id: "catA", category: "duvida", minutes_ago: 55 },
  { message_id: "ca3", owner: OWNER, chat_type: "private", chat_id: "catB", category: "duvida", minutes_ago: 50 },
  // convite x2.
  { message_id: "ca4", owner: OWNER, chat_type: "private", chat_id: "catC", category: "convite", minutes_ago: 45 },
  { message_id: "ca5", owner: OWNER, chat_type: "private", chat_id: "catC", category: "convite", minutes_ago: 40 },
  // agradecimento x1.
  { message_id: "ca6", owner: OWNER, chat_type: "private", chat_id: "catD", category: "agradecimento", minutes_ago: 35 },
  // null category -> bucketed as '(sem)'.
  { message_id: "ca7", owner: OWNER, chat_type: "private", chat_id: "catE", category: null, minutes_ago: 30 },
  // --- noise that must never count ---
  // group message reusing a private category -> excluded by chat_type.
  { message_id: "cg1", owner: OWNER, chat_type: "group", chat_id: "catG", category: "duvida", minutes_ago: 25 },
  // wrong-owner private message -> excluded by the owner join.
  { message_id: "cw1", owner: "someone-else", chat_type: "private", chat_id: "catW", category: "duvida", minutes_ago: 20 },
  // out-of-window private message -> excluded by the days filter.
  { message_id: "co1", owner: OWNER, chat_type: "private", chat_id: "catO", category: "duvida", minutes_ago: OLD },
];

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  tenantId = harness.tenantId;
  get = harness.get;

  await createWhatsappMessagesTable(pool);
  await createMessageEnrichmentTable(pool);

  // Response-time messages: SP wall-clock anchored timestamps.
  for (const m of RT_MSGS) {
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, contact_phone, chat_name, direction,
          message, message_created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,
         (date_trunc('week', (now() at time zone 'America/Sao_Paulo') - interval '14 days')
          + make_interval(days => $9::int, hours => $10::int, mins => $11::int))
          at time zone 'America/Sao_Paulo')`,
      [
        m.message_id,
        m.owner,
        m.chat_type,
        m.chat_id,
        m.contact_phone ?? null,
        `Contato ${m.contact_phone ?? m.chat_id}`,
        m.direction,
        `texto ${m.message_id}`,
        m.day_offset,
        m.hour,
        m.minute,
      ],
    );
  }

  // Category messages: relative-to-now timestamps + enrichment rows.
  for (const m of CAT_MSGS) {
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, chat_name, direction,
          message, message_created_at)
       values ($1,$2,$3,$4,$5,'inbound',$6, now() - ($7 || ' minutes')::interval)`,
      [
        m.message_id,
        m.owner,
        m.chat_type,
        m.chat_id,
        `Contato ${m.chat_id}`,
        `texto ${m.message_id}`,
        String(m.minutes_ago),
      ],
    );
    await pool.query(
      `insert into message_enrichment
         (message_id, tenant_id, chat_type, category)
       values ($1,$2,$3,$4)`,
      [m.message_id, tenantId, m.chat_type, m.category],
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

interface ResponseTime {
  avg_minutes: number | null;
  median_minutes: number | null;
  sample: number;
  work_window: {
    start_hour: number;
    end_hour: number;
    tz: string;
    weekdays_only: boolean;
  };
}

describe("Privado · Tempo médio de resposta (business-hours latency)", () => {
  it("sample, average and median reflect business-minute latencies only", async () => {
    const rt = (await get("/api/metrics/private/response-time", {
      days: String(WINDOW_DAYS),
    })) as ResponseTime;
    // rt1 (30), rt2 (120), rt3 (180), rt4 (30) — four qualifying inbound->reply
    // pairs (rt4 is contact_phone-only, keyed via the effective-phone fallback).
    expect(rt.sample).toBe(4);
    // avg([30,120,180,30]) = 90, median = 75. Wall-clock gaps (overnight ~14h,
    // weekend ~3 days) would dwarf these, so matching them proves the
    // 08:00-20:00 weekday window is honoured.
    expect(rt.avg_minutes).toBe(90);
    expect(rt.median_minutes).toBe(75);
  });

  it("ignores overnight and weekend pauses (no inflated latency)", async () => {
    const rt = (await get("/api/metrics/private/response-time", {
      days: String(WINDOW_DAYS),
    })) as ResponseTime;
    // The largest single pair is the weekend one at 180 business minutes. If
    // overnight/weekend time leaked in, the average alone would exceed a full
    // business day (720 min). Guard against that regression directly.
    expect(rt.avg_minutes!).toBeLessThan(720);
    expect(rt.median_minutes!).toBeLessThanOrEqual(180);
    expect(rt.work_window.weekdays_only).toBe(true);
    expect(rt.work_window.start_hour).toBe(8);
    expect(rt.work_window.end_hour).toBe(20);
  });

  it("drops group, wrong-owner, out-of-window and abandoned (>3d) threads", async () => {
    // All four noise chats (rtcap, rtg, rtw, rto) are constructed to look like
    // valid pairs; if any leaked the sample would rise above 4.
    const rt = (await get("/api/metrics/private/response-time", {
      days: String(WINDOW_DAYS),
    })) as ResponseTime;
    expect(rt.sample).toBe(4);
  });
});

interface CategoryRow {
  category: string;
  count: number;
}

async function fetchCategories(days = WINDOW_DAYS): Promise<CategoryRow[]> {
  const { categories } = await get("/api/metrics/private/categories", {
    days: String(days),
  });
  return categories as CategoryRow[];
}

describe("Privado · Distribuição por categoria (DM count parity)", () => {
  it("counts each category for in-window DM messages (null -> '(sem)')", async () => {
    const rows = await fetchCategories();
    const byCat = new Map(rows.map((r) => [r.category, r.count]));
    expect(byCat.get("duvida")).toBe(3);
    expect(byCat.get("convite")).toBe(2);
    expect(byCat.get("agradecimento")).toBe(1);
    expect(byCat.get("(sem)")).toBe(1);
    // Ordered by count desc -> 'duvida' is the top bucket.
    expect(rows[0].category).toBe("duvida");
  });

  it("excludes group, wrong-owner and out-of-window noise", async () => {
    const rows = await fetchCategories();
    // 'duvida' has exactly 3 valid DM occurrences; the group copy (cg1),
    // wrong-owner copy (cw1) and out-of-window copy (co1) all reuse 'duvida'.
    // A count of 3 proves none of them leaked in.
    expect(rows.find((r) => r.category === "duvida")!.count).toBe(3);
    // The total across all buckets equals only the 7 valid DM messages.
    const total = rows.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(7);
  });
});
