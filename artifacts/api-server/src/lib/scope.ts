import type { Response, NextFunction } from "express";
import { MVP_TENANT_ID } from "@workspace/db";
import type { AuthedRequest } from "./auth";

// Shared scoping constants/helpers. Every data query must be scoped by the
// authenticated tenant (req.auth.tenantId) AND, for whatsapp_messages reads, by
// the WhatsApp owner phone.
export const OWNER = process.env.WHATSAPP_OWNER;
if (!OWNER) {
  throw new Error("WHATSAPP_OWNER is required.");
}

// Builds a SQL fragment that EXCLUDES support-group rows for the given message
// alias, pushing its params onto `params`. The support-group list is now
// user-managed (table `support_groups`, scoped by tenant) instead of hardcoded,
// so Bruno can mark/unmark groups without a code deploy. coalesce(..., false)
// keeps rows with a null chat (e.g. DM mentions) instead of dropping them.
export function excludeSupportGroupsSql(
  alias: string,
  tenantId: string,
  params: unknown[],
): string {
  const tIdx = params.push(tenantId);
  return ` and not coalesce(${alias}.chat_id in (select chat_id from support_groups where tenant_id = $${tIdx}), false)`;
}

// The global WHATSAPP_OWNER phone belongs to exactly one tenant — the tenant of
// the WhatsApp account owner. Until a per-tenant owner mapping is stored, that
// is the MVP tenant. `whatsapp_messages` carries no tenant_id, so raw reads of
// it (volume, response time, threads, unanswered) can only be filtered by
// owner; this guard enforces the tenant half of the contract by ensuring the
// authenticated tenant is the one allowed to read this owner's messages.
export const OWNER_TENANT_ID = MVP_TENANT_ID;

// Express middleware: rejects any authenticated tenant that does not own the
// configured WhatsApp account, preventing cross-tenant access to whatsapp_messages.
export function requireOwnerTenant(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.auth?.tenantId !== OWNER_TENANT_ID) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}
