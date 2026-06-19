import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useRefreshStatus, useStartRefresh, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Top-level query prefixes whose data the refresh pipeline rewrites. Invalidated
// when a cycle finishes so every tab reflects the new messages without a reload.
const DATA_PREFIXES = [
  ["metrics"],
  ["contacts"],
  ["topics"],
  ["groups"],
  ["mentions"],
  ["entities"],
  ["tasks"],
  ["media"],
] as const;

function lastUpdatedLabel(iso: string | null): string {
  if (!iso) return "sem registro";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RefreshControl() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useRefreshStatus();
  const start = useStartRefresh();

  const run = data?.run ?? null;
  const isRunning = run?.status === "running";
  const busy = isRunning || start.isPending;

  // Detect a running -> finished transition to refresh the tabs + notify once.
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevStatus.current;
    const curr = run?.status ?? null;
    if (prev === "running" && curr && curr !== "running") {
      if (curr === "completed") {
        for (const key of DATA_PREFIXES)
          qc.invalidateQueries({ queryKey: key });
        toast({ title: "Dados atualizados", description: "As abas refletem as mensagens novas." });
      } else if (curr === "failed") {
        // Some steps may still have succeeded; refresh anyway.
        for (const key of DATA_PREFIXES)
          qc.invalidateQueries({ queryKey: key });
        toast({
          variant: "destructive",
          title: "Falha na atualização",
          description: run?.error ?? "Não foi possível concluir a atualização.",
        });
      }
    }
    prevStatus.current = curr;
  }, [run?.status, run?.error, qc, toast]);

  const onClick = () => {
    if (busy) return;
    start.mutate(undefined, {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          // Another cycle is already running — the status poll will catch up.
          return;
        }
        toast({
          variant: "destructive",
          title: "Não foi possível iniciar",
          description:
            err instanceof Error ? err.message : "Tente novamente em instantes.",
        });
      },
    });
  };

  const lastDone = run && run.status !== "running" ? run.finishedAt : null;

  return (
    <div className="flex items-center gap-[10px]">
      <span className="text-[11px] text-[var(--muted-2)] hidden md:inline">
        {isRunning ? (
          "Atualizando dados…"
        ) : start.isError && !(start.error instanceof ApiError) ? (
          <span className="inline-flex items-center gap-[4px] text-[var(--danger)]">
            <AlertTriangle className="w-3 h-3" /> erro ao atualizar
          </span>
        ) : (
          <>Última atualização: {lastUpdatedLabel(lastDone)}</>
        )}
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Atualizar dados (puxa mensagens novas e recalcula as abas)"
        className="flex items-center gap-[7px] bg-[var(--surface-2)] border border-[var(--border)] p-[7px_12px] rounded-[var(--radius-sm)] text-[12.5px] text-[var(--muted)] hover:border-[var(--accent-dim)] hover:text-[var(--text)] transition-colors outline-none disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        <RefreshCw
          className={`w-[14px] h-[14px] ${busy ? "animate-spin text-[var(--accent)]" : ""}`}
        />
        {busy ? "Atualizando…" : "Atualizar"}
      </button>
    </div>
  );
}
