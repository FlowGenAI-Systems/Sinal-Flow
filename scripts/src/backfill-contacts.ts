import { pool, refreshContactMsgCounts, getActiveOwnerPhones } from "@workspace/db";

// Derives CRM contacts from private (DM) chats. Per PRD: CRM = the ~521 DM
// contacts + manually promoted ones. DM contacts are keyed by chat_id (which is
// the partner phone); chat_name is the display name. Idempotent: upserts on
// (tenant_id, primary_phone). source='dm'. Set-based (fast).
//
// Run: pnpm --filter @workspace/scripts run backfill-contacts
const MVP_TENANT_ID = "00000000-0000-0000-0000-000000000001";

async function main(): Promise<void> {
  // Derive DM contacts across every active "Usuário" (WhatsApp number).
  const owners = await getActiveOwnerPhones(pool);
  if (owners.length === 0)
    throw new Error(
      "No active WhatsApp owner (whatsapp_accounts empty and WHATSAPP_OWNER unset).",
    );

  const ins = await pool.query(
    `insert into contacts
        (tenant_id, display_name, primary_phone, last_interaction_at, source)
     select $2,
            max(coalesce(nullif(chat_name,''), nullif(sender_name,''))),
            chat_id,
            max(message_created_at),
            'dm'
       from whatsapp_messages
      where whatsapp_owner = any($1) and chat_type = 'private' and chat_id is not null
      group by chat_id
     on conflict (tenant_id, primary_phone) where primary_phone is not null
     do update set
        display_name = coalesce(excluded.display_name, contacts.display_name),
        last_interaction_at = greatest(contacts.last_interaction_at, excluded.last_interaction_at),
        updated_at = now()`,
    [owners, MVP_TENANT_ID],
  );
  console.log(`✓ upserted ${ins.rowCount} DM contacts.`);

  // Set dominant_category from enriched messages (best-effort; partial data ok).
  const dom = await pool.query(
    `with dom as (
       select m.chat_id, e.category,
              row_number() over (
                partition by m.chat_id order by count(*) desc
              ) as rn
         from message_enrichment e
         join whatsapp_messages m on m.message_id = e.message_id
        where m.whatsapp_owner = any($1) and m.chat_type = 'private'
          and e.category is not null
        group by m.chat_id, e.category
     )
     update contacts c
        set dominant_category = d.category, updated_at = now()
       from dom d
      where d.rn = 1 and c.tenant_id = $2 and c.primary_phone = d.chat_id`,
    [owners, MVP_TENANT_ID],
  );
  console.log(`✓ set dominant_category for ${dom.rowCount} contacts.`);

  // Refresh the cached per-contact message volume so the /contacts list reads a
  // cheap column instead of scanning whatsapp_messages on every request.
  const refreshed = await refreshContactMsgCounts(pool, {
    owners,
    tenantId: MVP_TENANT_ID,
  });
  console.log(`✓ refreshed msg_count for ${refreshed} contacts.`);

  const total = await pool.query(
    `select count(*)::int n from contacts where tenant_id = $1`,
    [MVP_TENANT_ID],
  );
  console.log(`Total contacts: ${total.rows[0].n}.`);
  await pool.end();
}

void main().catch((e) => {
  console.error("backfill-contacts failed:", (e as Error).message);
  process.exit(1);
});
