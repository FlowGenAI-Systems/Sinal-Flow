import type { Pool } from "pg";
import { MVP_TENANT_ID } from "./schema";

// Active WhatsApp owner phones for a tenant — the registered "Usuários" in
// whatsapp_accounts. The data/AI jobs use this to enrich every active number,
// not just one. Falls back to the single WHATSAPP_OWNER env when the table is
// empty (or unset), so jobs keep working before any account is registered.
export async function getActiveOwnerPhones(
  pool: Pool,
  tenantId: string = MVP_TENANT_ID,
): Promise<string[]> {
  const { rows } = await pool.query<{ owner_phone: string }>(
    `select owner_phone from whatsapp_accounts
      where active = true and tenant_id = $1`,
    [tenantId],
  );
  const phones = rows.map((r) => String(r.owner_phone));
  if (phones.length > 0) return phones;
  const fallback = process.env.WHATSAPP_OWNER;
  return fallback ? [fallback] : [];
}
