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

// metadata payload helper — raw_type lives inside the jsonb metadata column.
function meta(rawType: string | null): string {
  return rawType === null ? "{}" : JSON.stringify({ raw_type: rawType });
}

interface Row {
  message_id: string;
  owner: string;
  chat_type: "private" | "group";
  chat_id: string;
  chat_name: string;
  direction: "inbound" | "outbound";
  media_url: string | null;
  raw_type: string | null;
  contact_phone?: string;
}

// Fixture rows. The KEY rows for this regression are those with a non-null
// media_url but a NULL raw_type: the drill (/media/messages) excludes them, so
// the aggregates (summary/by-contact/by-group/stats) MUST exclude them too, or
// the displayed totals would not match the drawer.
const ROWS: Row[] = [
  // --- private contact A ---
  { message_id: "a1", owner: OWNER, chat_type: "private", chat_id: "pA", chat_name: "Contato A", direction: "inbound", media_url: "u", raw_type: "AudioMessage" },
  { message_id: "a2", owner: OWNER, chat_type: "private", chat_id: "pA", chat_name: "Contato A", direction: "outbound", media_url: "u", raw_type: "ImageMessage" },
  // regression: media but no raw_type -> must be excluded everywhere
  { message_id: "a3", owner: OWNER, chat_type: "private", chat_id: "pA", chat_name: "Contato A", direction: "inbound", media_url: "u", raw_type: null },
  // --- private contact B ---
  { message_id: "b1", owner: OWNER, chat_type: "private", chat_id: "pB", chat_name: "Contato B", direction: "inbound", media_url: "u", raw_type: "VideoMessage" },
  { message_id: "b2", owner: OWNER, chat_type: "private", chat_id: "pB", chat_name: "Contato B", direction: "inbound", media_url: "u", raw_type: "PtvMessage" },
  { message_id: "b3", owner: OWNER, chat_type: "private", chat_id: "pB", chat_name: "Contato B", direction: "outbound", media_url: "u", raw_type: "DocumentMessage" },
  // --- private contact C: reachable ONLY via contact_phone (empty chat_id) ---
  // If by-contact / the drill keyed on chat_id alone these would collapse into an
  // empty bucket and diverge from each other; the effective-phone fallback must
  // attribute them to "pC" on both the aggregate and the drill.
  { message_id: "c1", owner: OWNER, chat_type: "private", chat_id: "", chat_name: "Contato C", direction: "inbound", media_url: "u", raw_type: "AudioMessage", contact_phone: "pC" },
  { message_id: "c2", owner: OWNER, chat_type: "private", chat_id: "", chat_name: "Contato C", direction: "outbound", media_url: "u", raw_type: "ImageMessage", contact_phone: "pC" },
  // --- group G1 ---
  { message_id: "g1a", owner: OWNER, chat_type: "group", chat_id: "g1", chat_name: "Grupo 1", direction: "inbound", media_url: "u", raw_type: "StickerMessage" },
  { message_id: "g1b", owner: OWNER, chat_type: "group", chat_id: "g1", chat_name: "Grupo 1", direction: "inbound", media_url: "u", raw_type: "ImageMessage" },
  // regression in a group
  { message_id: "g1c", owner: OWNER, chat_type: "group", chat_id: "g1", chat_name: "Grupo 1", direction: "outbound", media_url: "u", raw_type: null },
  // an "other" mapped type (raw_type present, not in the explicit mapping)
  { message_id: "g1d", owner: OWNER, chat_type: "group", chat_id: "g1", chat_name: "Grupo 1", direction: "inbound", media_url: "u", raw_type: "LocationMessage" },
  // --- group G2 ---
  { message_id: "g2a", owner: OWNER, chat_type: "group", chat_id: "g2", chat_name: "Grupo 2", direction: "outbound", media_url: "u", raw_type: "AudioMessage" },
  // --- pure noise: must never be counted ---
  // media_url null (has raw_type but no media)
  { message_id: "n1", owner: OWNER, chat_type: "private", chat_id: "pA", chat_name: "Contato A", direction: "inbound", media_url: null, raw_type: "AudioMessage" },
  // wrong owner
  { message_id: "n2", owner: "someone-else", chat_type: "group", chat_id: "g1", chat_name: "Grupo 1", direction: "inbound", media_url: "u", raw_type: "ImageMessage" },
];

beforeAll(async () => {
  const harness = await setupHarness();
  pool = harness.pool;
  get = harness.get;

  await createWhatsappMessagesTable(pool);

  let i = 0;
  for (const r of ROWS) {
    i += 1;
    await pool.query(
      `insert into whatsapp_messages
         (message_id, whatsapp_owner, chat_type, chat_id, contact_phone, chat_name,
          direction, media_url, metadata, message_created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, now() - ($10 || ' minutes')::interval)`,
      [
        r.message_id,
        r.owner,
        r.chat_type,
        r.chat_id,
        r.contact_phone ?? null,
        r.chat_name,
        r.direction,
        r.media_url,
        meta(r.raw_type),
        String(i),
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

const TYPE_KEYS = ["audio", "image", "document", "sticker", "video"] as const;

describe("media count parity (aggregates vs drill-down)", () => {
  it("total geral: summary total == drawer total (no filter)", async () => {
    const summary = await get("/api/media/summary");
    const drawer = await get("/api/media/messages");
    // sanity: fixtures actually produced media rows
    expect(drawer.total).toBeGreaterThan(0);
    expect(summary.total).toBe(drawer.total);
  });

  it("excludes the media_url-not-null + raw_type-null regression rows", async () => {
    const drawer = await get("/api/media/messages");
    const ids = (drawer.messages as Array<{ message_id: string }>).map(
      (m) => m.message_id,
    );
    // the two regression rows and the noise rows must be absent
    expect(ids).not.toContain("a3");
    expect(ids).not.toContain("g1c");
    expect(ids).not.toContain("n1");
    expect(ids).not.toContain("n2");
  });

  it("por tipo: stats per-type total == drawer total filtered by that type", async () => {
    const stats = await get("/api/media/stats");
    const byKey = new Map<string, { total: number; inbound: number; outbound: number }>(
      (stats.byType as Array<{ key: string; total: number; inbound: number; outbound: number }>).map(
        (t) => [t.key, t],
      ),
    );
    for (const key of TYPE_KEYS) {
      const drawer = await get("/api/media/messages", { type: key });
      const expected = byKey.get(key)?.total ?? 0;
      expect(drawer.total, `type=${key}`).toBe(expected);
    }
  });

  it("inbound/outbound: drawer total by direction == summed stats", async () => {
    const stats = await get("/api/media/stats");
    const types = stats.byType as Array<{ inbound: number; outbound: number }>;
    const inbound = types.reduce((a, t) => a + t.inbound, 0);
    const outbound = types.reduce((a, t) => a + t.outbound, 0);
    const drawerIn = await get("/api/media/messages", { direction: "inbound" });
    const drawerOut = await get("/api/media/messages", {
      direction: "outbound",
    });
    expect(drawerIn.total).toBe(inbound);
    expect(drawerOut.total).toBe(outbound);
  });

  it("por contato: a contact_phone-only DM is attributed by its effective phone", async () => {
    const { contacts } = await get("/api/media/by-contact");
    const c = (contacts as Array<Record<string, number | string>>).find(
      (x) => x.chat_id === "pC",
    );
    // c1+c2 both carry only contact_phone (empty chat_id); they must land on "pC"
    // and the drill for that key must return the same two messages (parity).
    expect(c, "contact_phone-only contact present in by-contact").toBeTruthy();
    expect(c!.total).toBe(2);
    const drawer = await get("/api/media/messages", {
      scope: "private",
      chatId: "pC",
    });
    expect(drawer.total).toBe(2);
  });

  it("por contato: by-contact totals (and per-type) == drawer for the same contact", async () => {
    const { contacts } = await get("/api/media/by-contact");
    expect(contacts.length).toBeGreaterThan(0);
    for (const c of contacts as Array<Record<string, number | string>>) {
      const chatId = c.chat_id as string;
      const drawer = await get("/api/media/messages", {
        scope: "private",
        chatId,
      });
      expect(drawer.total, `contact ${chatId} total`).toBe(c.total);
      for (const key of TYPE_KEYS) {
        const typed = await get("/api/media/messages", {
          scope: "private",
          chatId,
          type: key,
        });
        expect(typed.total, `contact ${chatId} type ${key}`).toBe(
          c[key] as number,
        );
      }
    }
  });

  it("por grupo: by-group totals (and per-type) == drawer for the same group", async () => {
    const { groups } = await get("/api/media/by-group");
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups as Array<Record<string, number | string>>) {
      const chatId = g.chat_id as string;
      const drawer = await get("/api/media/messages", {
        scope: "group",
        chatId,
      });
      expect(drawer.total, `group ${chatId} total`).toBe(g.total);
      for (const key of TYPE_KEYS) {
        const typed = await get("/api/media/messages", {
          scope: "group",
          chatId,
          type: key,
        });
        expect(typed.total, `group ${chatId} type ${key}`).toBe(
          g[key] as number,
        );
      }
    }
  });
});
