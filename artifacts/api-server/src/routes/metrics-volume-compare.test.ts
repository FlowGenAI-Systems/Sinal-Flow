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

// Closes the last untested volume panel: the Overview "comparativo de volume"
// (/metrics/private/volume-compare). It aligns the current period's daily
// received (inbound) DM volume, day-by-day, against the equivalent previous
// period (last N days vs the N days before). The series is keyed by `offset`
// (0..days-1) so the frontend can overlay two lines; for a given offset the
// previous point is the same calendar weekday shifted back exactly `days`.
//
// What can break silently here is the window/alignment math:
//   - current vs previous window boundaries (off-by-one or overlap),
//   - per-day pairing (the previous series must land on the SAME offset as the
//     current day it is being compared to, i.e. shifted by exactly `days`),
//   - DM-only (chat_type='private'), inbound-only and owner scoping,
//   - the zero-filled `days`-long series (missing days padded to 0/0).
//
// Timestamps are relative (now() - N days). The route buckets by date in the
// working timezone (America/Sao_Paulo, a fixed UTC-3 offset with no DST), so a
// message at now()-N days always falls on today_local - N — deterministic
// regardless of run time, except across an exact local-midnight tick (the same
// tolerance the sibling volume suite already accepts).
//
// The fixture targets a 7-day period:
//   current  date today-2 (offset 4): 5 inbound
//   current  date today-3 (offset 3): 3 inbound   -> current total 8
//   previous date today-9 (offset 4): 2 inbound   (today-2 shifted back 7)
//   previous date today-10 (offset 3): 4 inbound  (today-3 shifted back 7)
//                                                  -> previous total 6
// So offset 4 has current>previous and offset 3 has current<previous, proving
// the two series are paired per-offset and not transposed. The 4..8-day gap is
// deliberately empty so a narrowed window can exercise the empty-previous path
// without a boundary message drifting in.
interface CmpMsg {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  direction: "inbound" | "outbound";
  days_ago: number;
}

function cluster(
  prefix: string,
  daysAgo: number,
  inbound: number,
  opts: {
    owner?: string;
    chat_type?: "private" | "group";
    direction?: "inbound" | "outbound";
  } = {},
): CmpMsg[] {
  const owner = opts.owner ?? OWNER;
  const chat_type = opts.chat_type ?? "private";
  const direction = opts.direction ?? "inbound";
  const out: CmpMsg[] = [];
  for (let i = 0; i < inbound; i++) {
    out.push({
      message_id: `${prefix}_${direction}_${i}`,
      owner,
      chat_type,
      direction,
      days_ago: daysAgo,
    });
  }
  return out;
}

const CMP_MSGS: CmpMsg[] = [
  // --- legit current-period inbound DM traffic (period = 7d) ---
  ...cluster("cur2", 2, 5), // today-2 -> offset 4, current 5
  ...cluster("cur3", 3, 3), // today-3 -> offset 3, current 3
  // --- legit previous-period inbound DM traffic (each is current+7 days) ---
  ...cluster("prev9", 9, 2), // today-9 -> offset 4, previous 2
  ...cluster("prev10", 10, 4), // today-10 -> offset 3, previous 4
  // --- noise that must never count toward either series ---
  // outbound at 2d: excluded by direction='inbound'.
  ...cluster("out2", 2, 3, { direction: "outbound" }),
  // group copy at 2d: excluded by chat_type='private'.
  ...cluster("grp2", 2, 2, { chat_type: "group" }),
  // wrong-owner private copy at 2d: excluded by the owner filter.
  ...cluster("wrong2", 2, 2, { owner: "someone-else" }),
  // out-of-both-windows DM (20d > 2*7): excluded from current and previous.
  ...cluster("old20", 20, 4),
];

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  get = harness.get;

  await createWhatsappMessagesTable(pool);

  for (const m of CMP_MSGS) {
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, chat_name, direction,
          message, message_created_at)
       values ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' days')::interval)`,
      [
        m.message_id,
        m.owner,
        m.chat_type,
        m.message_id,
        `Contato ${m.message_id}`,
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

interface ComparePoint {
  offset: number;
  day: string;
  current: number;
  previous: number;
}
interface CompareResp {
  days: number;
  current: number;
  previous: number;
  pctChange: number;
  series: ComparePoint[];
}

describe("Overview · Comparativo de volume (current vs previous, day-by-day)", () => {
  it("aligns the current daily inbound series against the previous period per offset", async () => {
    const r = (await get("/api/metrics/private/volume-compare", {
      days: "7",
    })) as CompareResp;

    // A zero-filled series exactly `days` long, keyed by contiguous offsets.
    expect(r.days).toBe(7);
    expect(r.series.length).toBe(7);
    expect(r.series.map((p) => p.offset)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // Ascending calendar days (offset 0 oldest, offset days-1 = today).
    const days = r.series.map((p) => p.day);
    expect([...days].sort()).toEqual(days);

    // Per-offset pairing: today-2 (offset 4) and its previous-period twin
    // (today-9, same offset 4) sit on the SAME row.
    const off4 = r.series.find((p) => p.offset === 4)!;
    expect(off4).toMatchObject({ current: 5, previous: 2 });

    // today-3 (offset 3) vs today-10 (offset 3). Here previous > current,
    // proving the two series are not transposed.
    const off3 = r.series.find((p) => p.offset === 3)!;
    expect(off3).toMatchObject({ current: 3, previous: 4 });
  });

  it("zero-fills every day with no inbound traffic in either period", async () => {
    const r = (await get("/api/metrics/private/volume-compare", {
      days: "7",
    })) as CompareResp;

    // Only offsets 3 and 4 carry data; every other day is padded to 0/0.
    for (const p of r.series) {
      if (p.offset === 3 || p.offset === 4) continue;
      expect(p.current).toBe(0);
      expect(p.previous).toBe(0);
    }
  });

  it("totals and pctChange are derived from the inbound series only", async () => {
    const r = (await get("/api/metrics/private/volume-compare", {
      days: "7",
    })) as CompareResp;

    // current = 5 + 3 = 8; previous = 2 + 4 = 6. The outbound (3), group (2),
    // wrong-owner (2) and 20-day-old (4) copies would all distort these totals
    // if they leaked through the inbound/DM/owner/window filters.
    expect(r.current).toBe(8);
    expect(r.previous).toBe(6);
    // round((8 - 6) / 6 * 100) = round(33.33) = 33.
    expect(r.pctChange).toBe(33);

    // Series totals must equal the top-level aggregates.
    const seriesCurrent = r.series.reduce((s, p) => s + p.current, 0);
    const seriesPrevious = r.series.reduce((s, p) => s + p.previous, 0);
    expect(seriesCurrent).toBe(8);
    expect(seriesPrevious).toBe(6);
  });

  it("honours a narrower days window and yields +100% when previous is empty", async () => {
    // days=4: the current series spans today-3..today, so both today-2 (5) and
    // today-3 (3) land in it -> current 8. The previous window covers the empty
    // 4..8-day gap (today-9/10 are older), so previous is 0 and the
    // divide-by-zero guard returns +100%.
    const r = (await get("/api/metrics/private/volume-compare", {
      days: "4",
    })) as CompareResp;

    expect(r.days).toBe(4);
    expect(r.series.length).toBe(4);
    expect(r.current).toBe(8);
    expect(r.previous).toBe(0);
    expect(r.pctChange).toBe(100);
  });
});
