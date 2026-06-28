import { createContext, useContext, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccounts, setApiAccount, type Account } from "@/lib/api";

// Sentinel for "Todos os usuários" — no ?account param is sent, so the
// backend scopes the data to every active account.
export const ALL_ACCOUNTS = "todos";

interface AccountCtx {
  account: string; // selected owner_phone, or ALL_ACCOUNTS
  setAccount: (account: string) => void;
  accounts: Account[]; // active vendors (from GET /api/accounts)
  isLoading: boolean;
}

const Ctx = createContext<AccountCtx | null>(null);

// Mirrors TimeWindowProvider: holds the globally-selected vendor and exposes the
// active vendor list. Switching vendor updates the module-level account used by
// every request (setApiAccount) and busts the react-query cache so all screens
// refetch under the new owner scope — the account is intentionally NOT part of
// each queryKey (there are ~40 hooks); a single invalidate is the central
// equivalent. Must live inside QueryClientProvider (it uses useQueryClient).
export function AccountProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: accounts = [], isLoading } = useAccounts();
  const [account, setAccountState] = useState<string>(ALL_ACCOUNTS);

  function setAccount(next: string) {
    const value = next || ALL_ACCOUNTS;
    setApiAccount(value);
    setAccountState(value);
    qc.invalidateQueries();
  }

  return (
    <Ctx.Provider value={{ account, setAccount, accounts, isLoading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAccount(): AccountCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return ctx;
}
