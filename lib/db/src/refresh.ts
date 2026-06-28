import type { Pool } from "pg";

// Recompute and cache each contact's private (DM) message volume into the
// contacts.msg_count column, so the /contacts list can read a cheap cached
// number instead of scanning the whole READ-ONLY whatsapp_messages table on
// every request. Call this from the contacts-maintenance job (backfill-contacts)
// and from tests that need the cached counts populated.
//
// Keying mirrors the per-contact history/metrics endpoints exactly — the
// effective DM partner phone coalesce(nullif(chat_id,''), nullif(contact_phone,''))
// joined onto contacts.primary_phone — so list totals stay consistent with the
// drill-down counts. Owner scoping is mandatory: whatsapp_messages has no
// tenant_id and is keyed only by whatsapp_owner.
//
// Returns the number of contacts that matched at least one message.
export async function refreshContactMsgCounts(
  pool: Pool,
  opts: { owners: string[]; tenantId: string },
): Promise<number> {
  const { owners, tenantId } = opts;

  // Reset + recompute run in a single transaction so a mid-run failure can
  // never leave contacts temporarily zeroed (the reset zeroes everyone first so
  // contacts that no longer match any message fall back to 0).
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update contacts set msg_count = 0, msg_count_at = now() where tenant_id = $1`,
      [tenantId],
    );
    const res = await client.query(
      `with vol as (
         select coalesce(nullif(chat_id,''), nullif(contact_phone,'')) as phone,
                count(*)::int as msg_count
           from whatsapp_messages
          where whatsapp_owner = any($1)
            and chat_type = 'private'
            and coalesce(nullif(chat_id,''), nullif(contact_phone,'')) is not null
          group by 1
       )
       update contacts c
          set msg_count = v.msg_count, msg_count_at = now()
         from vol v
        where c.tenant_id = $2 and c.primary_phone = v.phone`,
      [owners, tenantId],
    );
    await client.query("commit");
    return res.rowCount ?? 0;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
