import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  OWNER,
  type Pool,
  createWhatsappMessagesTable,
  dropWhatsappMessagesTable,
  setupHarness,
} from "../test/fixtures";

let pool: Pool;
let get: Awaited<ReturnType<typeof setupHarness>>["get"];

// Closes the last two Privado/Overview volume panels left untested:
//   - "Volume diário" (/metrics/private/volume): received/sent counts grouped by
//     day, DM only, owner-scoped, within the days window. A leak of group,
//     wrong-owner or out-of-window traffic would skew a day bucket or add one.
//   - "Resumo de volume" (/metrics/private/volume-summary): the period math —
//     current vs previous window (received only), avg/day and pctChange (with the
//     divide-by-zero / 100% / both-zero edge branches) plus the fixed 30-day
//     sparkline that ignores the selected period.
//
// One unified fixture set feeds both routes. Every message is private + owner
// unless explicitly marked as noise. Timestamps are relative (now() - N days) so
// the previous-window boundary math is deterministic regardless of run time: a
// message inserted at now()-N days is always strictly older than the query-time
// now()-N days bound, so it never straddles a window edge.
interface VolMsg {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  chat_id: string;
  direction: "inbound" | "outbound";
  days_ago: number;
}

function cluster(
  prefix: string,
  daysAgo: number,
  inbound: number,
  outbound: number,
  opts: { owner?: string; chat_type?: "private" | "group" } = {},
): VolMsg[] {
  const owner = opts.owner ?? OWNER;
  const chat_type = opts.chat_type ?? "private";
  const out: VolMsg[] = [];
  for (let i = 0; i < inbound; i++) {
    out.push({
      message_id: `${prefix}i${i}`,
      owner,
      chat_type,
      chat_id: prefix,
      direction: "inbound",
      days_ago: daysAgo,
    });
  }
  for (let i = 0; i < outbound; i++) {
    out.push({
      message_id: `${prefix}o${i}`,
      owner,
      chat_type,
      chat_id: prefix,
      direction: "outbound",
      days_ago: daysAgo,
    });
  }
  return out;
}

// Distinct calendar days so the per-day grouping and the period windows are
// unambiguous. Received/sent are intentionally different per day to prove the
// inbound/outbound split is not transposed.
const VOL_MSGS: VolMsg[] = [
  // --- in-window, in-30-days DM traffic (the only legit private+owner data) ---
  ...cluster("d2", 2, 4, 1), // received 4, sent 1
  ...cluster("d3", 3, 4, 2), // received 4, sent 2
  ...cluster("d9", 9, 3, 1), // received 3, sent 1
  ...cluster("d10", 10, 3, 2), // received 3, sent 2
  // --- noise that must never count toward either route ---
  // out-of-30-days DM (40d): excluded from volume (days=30) and the sparkline.
  ...cluster("old", 40, 1, 0),
  // group copy at 3d reusing inbound: excluded by chat_type='private'.
  ...cluster("g3", 3, 1, 0, { chat_type: "group" }),
  // wrong-owner private copy at 3d: excluded by the owner filter.
  ...cluster("w3", 3, 1, 0, { owner: "someone-else" }),
];

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  get = harness.get;

  await createWhatsappMessagesTable(pool);

  for (const m of VOL_MSGS) {
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, chat_name, direction,
          message, message_created_at)
       values ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' days')::interval)`,
      [
        m.message_id,
        m.owner,
        m.chat_type,
        m.chat_id,
        `Contato ${m.chat_id}`,
        m.direction,
        `texto ${m.message_id}`,
        String(m.days_ago),
      ],
    );
  }
});

afterAll(async () => {
  if (pool) {
    await dropWhatsappMessagesTable(pool);
    await pool.end();
  }
});

interface VolumeRow {
  day: string;
  received: number;
  sent: number;
}

describe("Privado · Volume diário (received/sent per day)", () => {
  it("splits received vs sent per day, DM-only, in window, ordered asc", async () => {
    const { volume } = await get("/api/metrics/private/volume", { days: "30" });
    const rows = volume as VolumeRow[];

    // Exactly 4 day buckets: 2,3,9,10 days ago. The 40-day message is outside
    // the 30-day window and the group/wrong-owner copies are filtered out, so no
    // extra bucket appears.
    expect(rows.length).toBe(4);

    // Ascending by day -> oldest (10d) first, newest (2d) last.
    expect(rows[0]).toMatchObject({ received: 3, sent: 2 }); // 10 days ago
    expect(rows[1]).toMatchObject({ received: 3, sent: 1 }); // 9 days ago
    expect(rows[2]).toMatchObject({ received: 4, sent: 2 }); // 3 days ago
    expect(rows[3]).toMatchObject({ received: 4, sent: 1 }); // 2 days ago

    // Days come back sorted ascending.
    const days = rows.map((r) => r.day);
    expect([...days].sort()).toEqual(days);

    // Totals: 14 received / 6 sent across the legit DM traffic only.
    const totReceived = rows.reduce((s, r) => s + r.received, 0);
    const totSent = rows.reduce((s, r) => s + r.sent, 0);
    expect(totReceived).toBe(14);
    expect(totSent).toBe(6);
  });

  it("excludes group, wrong-owner and out-of-window noise", async () => {
    const { volume } = await get("/api/metrics/private/volume", { days: "30" });
    const rows = volume as VolumeRow[];
    // The 3-day bucket holds exactly the 4 legit inbound DMs. The group copy
    // (g3) and wrong-owner copy (w3) also sit at 3 days ago and reuse inbound;
    // if either leaked this bucket's received would be 5 or 6.
    expect(rows[2].received).toBe(4);
    // No 5th bucket from the 40-day-old message.
    expect(rows.length).toBe(4);
  });

  it("honours a narrower days window", async () => {
    // days=5 keeps only the 2d and 3d buckets; the 9d/10d traffic falls out.
    const { volume } = await get("/api/metrics/private/volume", { days: "5" });
    const rows = volume as VolumeRow[];
    expect(rows.length).toBe(2);
    const totReceived = rows.reduce((s, r) => s + r.received, 0);
    expect(totReceived).toBe(8); // 4 + 4
  });
});

interface VolumeSummary {
  current: number;
  previous: number;
  pctChange: number;
  avgPerDay: number;
  days: number;
  sparkline: { day: string; received: number }[];
}

describe("Privado · Resumo de volume (period math + sparkline)", () => {
  it("computes current/previous, avgPerDay and a positive pctChange", async () => {
    // days=7: current window (0-7d) = inbound at 2d + 3d = 8.
    //         previous window (7-14d) = inbound at 9d + 10d = 6.
    const s = (await get("/api/metrics/private/volume-summary", {
      days: "7",
    })) as VolumeSummary;
    expect(s.current).toBe(8);
    expect(s.previous).toBe(6);
    // round((8-6)/6 * 100) = round(33.33) = 33.
    expect(s.pctChange).toBe(33);
    // round(8 / 7 * 10) / 10 = round(11.43) / 10 = 1.1.
    expect(s.avgPerDay).toBe(1.1);
    expect(s.days).toBe(7);
    // Only inbound private+owner traffic counts: the group / wrong-owner copies
    // at 3d would have pushed current to 9 or 10 if they leaked.
  });

  it("returns +100% when the previous window is empty but current is not", async () => {
    // days=4: current (0-4d) = inbound at 2d + 3d = 8; previous (4-8d) has no
    // messages (9d/10d are older), so the divide-by-zero guard yields 100.
    const s = (await get("/api/metrics/private/volume-summary", {
      days: "4",
    })) as VolumeSummary;
    expect(s.current).toBe(8);
    expect(s.previous).toBe(0);
    expect(s.pctChange).toBe(100);
    // round(8 / 4 * 10) / 10 = 2.0.
    expect(s.avgPerDay).toBe(2);
  });

  it("returns 0% (no change) when both windows are empty", async () => {
    // days=1: the nearest inbound is 2 days old, so both the current (0-1d) and
    // previous (1-2d) windows are empty. previous=0 AND current=0 -> 0, never a
    // NaN/Infinity from dividing by zero.
    const s = (await get("/api/metrics/private/volume-summary", {
      days: "1",
    })) as VolumeSummary;
    expect(s.current).toBe(0);
    expect(s.previous).toBe(0);
    expect(s.pctChange).toBe(0);
    expect(s.avgPerDay).toBe(0);
  });

  it("returns a fixed 30-day inbound sparkline independent of the period", async () => {
    // The sparkline is always the last 30 days of received DMs regardless of the
    // selected period, so days=4 must still surface all four in-window buckets.
    const s = (await get("/api/metrics/private/volume-summary", {
      days: "4",
    })) as VolumeSummary;
    // 2d, 3d, 9d, 10d -> 4 buckets; the 40-day message is outside 30 days.
    expect(s.sparkline.length).toBe(4);
    const total = s.sparkline.reduce((acc, p) => acc + p.received, 0);
    expect(total).toBe(14); // 4 + 4 + 3 + 3
    // Ascending by day.
    const days = s.sparkline.map((p) => p.day);
    expect([...days].sort()).toEqual(days);
  });
});
