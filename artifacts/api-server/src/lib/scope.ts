import type { Request, Response, NextFunction } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { pool, MVP_TENANT_ID } from "@workspace/db";
import type { AuthedRequest } from "./auth";

// Shared scoping constants/helpers. Every data query must be scoped by the
// authenticated tenant (req.auth.tenantId) AND, for whatsapp_messages reads, by
// the WhatsApp owner phone(s).
export const OWNER = process.env.WHATSAPP_OWNER;
if (!OWNER) {
  throw new Error("WHATSAPP_OWNER is required.");
}

// ---------------------------------------------------------------------------
// Multi-account owner scope.
//
// The app used to read a single fixed WhatsApp number (OWNER). To let the UI
// pick "Todos os vendedores" or one specific vendor, each request now carries a
// *set* of owner phones, resolved by the `ownerScope` middleware from the
// `?account=` query param against the active rows in `whatsapp_accounts`.
//
// The resolved owners are stashed in an AsyncLocalStorage so the data queries
// can read them via getOwners() without threading the value through every call.
// OWNER stays exported for the routes that haven't been migrated yet.
// ---------------------------------------------------------------------------

export interface AccountInfo {
  phone: string;
  name: string | null;
}

interface OwnerScopeState {
  // The owner phones to read (one when a vendor is selected, all active when not).
  owners: string[];
  // The specific selected account phone, or null for "Todos os usuários". CRM
  // screens (contacts/tasks/saved) use this to decide whether to narrow by owner.
  account: string | null;
}

const ownerStore = new AsyncLocalStorage<OwnerScopeState>();

// The owner phones the current request is allowed to read. Defaults to the
// single configured OWNER when no scope was established (e.g. a route mounted
// before `ownerScope`, or a unit test), so legacy behaviour is preserved.
export function getOwners(): string[] {
  return ownerStore.getStore()?.owners ?? [OWNER!];
}

// The specific account selected for this request, or null when "Todos os
// usuários" (no narrowing). CRM data (contacts/tasks/saved) is tenant-wide and
// only filtered to one owner when a specific account is chosen.
export function getSelectedAccount(): string | null {
  return ownerStore.getStore()?.account ?? null;
}

// Active vendor accounts, cached briefly to avoid a DB round-trip on every
// data request (the Overview alone fires ~10 in parallel). Scoped to the owner
// tenant — whatsapp_accounts is where the per-vendor numbers live.
const ACCOUNTS_TTL_MS = 30_000;
let accountsCache: { at: number; rows: AccountInfo[] } | null = null;

export async function getActiveAccounts(): Promise<AccountInfo[]> {
  const now = Date.now();
  if (accountsCache && now - accountsCache.at < ACCOUNTS_TTL_MS) {
    return accountsCache.rows;
  }
  const { rows } = await pool.query<{ phone: string; name: string | null }>(
    `select owner_phone as phone, display_name as name
       from whatsapp_accounts
      where active = true and tenant_id = $1
      order by display_name nulls last, owner_phone`,
    [OWNER_TENANT_ID],
  );
  const list: AccountInfo[] = rows.map((r) => ({
    phone: String(r.phone),
    name: r.name ?? null,
  }));
  accountsCache = { at: now, rows: list };
  return list;
}

// Drop the cached account list so the next getActiveAccounts()/ownerScope sees a
// fresh read. Call after any write to whatsapp_accounts so the global selector
// (and the per-request owner scope) reflect the change immediately.
export function invalidateAccountsCache(): void {
  accountsCache = null;
}

// Express middleware: resolves the per-request owner scope and runs the rest of
// the chain inside an AsyncLocalStorage context so getOwners() works in every
// downstream handler. `?account=<owner_phone>` narrows the scope to that one
// number when it is an active account; otherwise the scope is all active
// numbers (the "Todos os vendedores" case). On any failure it falls back to the
// single configured OWNER so the app never goes blank.
export function ownerScope(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  getActiveAccounts()
    .then((accounts) => {
      const activePhones = accounts.map((a) => a.phone);
      const requested =
        typeof req.query.account === "string" ? req.query.account : "";
      let owners: string[];
      let account: string | null;
      if (requested && activePhones.includes(requested)) {
        owners = [requested];
        account = requested;
      } else {
        owners = activePhones.length > 0 ? activePhones : [OWNER!];
        account = null;
      }
      ownerStore.run({ owners, account }, () => next());
    })
    .catch(() => {
      ownerStore.run({ owners: [OWNER!], account: null }, () => next());
    });
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
