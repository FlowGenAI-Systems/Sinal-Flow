import { useState, useEffect } from "react";
import { useMentions, useEntities } from "@/lib/api";
import { Loader2, Bookmark, Star, EyeOff, Eye } from "lucide-react";
import EntityManagerDialog from "@/components/EntityManagerDialog";

export default function Mencoes() {
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [showSupport, setShowSupport] = useState(false);
  const { data: entities, isLoading: loadingE } = useEntities();

  // If the selected entity is deleted, fall back to "Todas".
  useEffect(() => {
    if (selectedEntity && entities && !entities.some((e) => e.id === selectedEntity)) {
      setSelectedEntity("");
    }
  }, [entities, selectedEntity]);
  const { data: mentionsData, isLoading: loadingM } = useMentions({
    entity: selectedEntity || undefined,
    includeSupport: showSupport,
  });

  if (loadingE || loadingM) {
    return <div className="flex items-center justify-center h-[calc(100vh-200px)]"><Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" /></div>;
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="flex items-center gap-[8px] flex-wrap mb-[18px]">
        <div 
          onClick={() => setSelectedEntity("")}
          className={`text-[12.5px] px-[13px] py-[6px] rounded-[20px] border border-[var(--border)] cursor-pointer transition-[0.14s] font-medium ${!selectedEntity ? "bg-[var(--accent-glow)] text-[var(--accent)] border-[var(--accent-dim)]" : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent-dim)]"}`}
        >
          Todas
        </div>
        {entities?.map((ent) => (
          <div 
            key={ent.id}
            onClick={() => setSelectedEntity(ent.id)}
            className={`text-[12.5px] px-[13px] py-[6px] rounded-[20px] border border-[var(--border)] cursor-pointer transition-[0.14s] font-medium ${selectedEntity === ent.id ? "bg-[var(--accent-glow)] text-[var(--accent)] border-[var(--accent-dim)]" : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent-dim)]"}`}
          >
            {ent.name}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-[8px]">
          <EntityManagerDialog />
          <button
            onClick={() => setShowSupport((v) => !v)}
            title={showSupport ? "Grupos de suporte visíveis — clique para ocultar" : "Grupos de suporte ocultos — clique para mostrar"}
            className={`inline-flex items-center gap-[6px] text-[12.5px] px-[13px] py-[6px] rounded-[20px] border cursor-pointer transition-[0.14s] font-medium ${!showSupport ? "bg-[var(--accent-glow)] text-[var(--accent)] border-[var(--accent-dim)]" : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--accent-dim)]"}`}
          >
            {showSupport ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Ocultar grupos de suporte
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-[16px]">
        {/* Feed de menções */}
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-[16px]">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">Menções</h3>
          </div>
          <div className="flex flex-col">
            {mentionsData?.mentions?.map((m, i) => {
              const typeLower = m.mention_type?.toLowerCase() || '';
              let typeClass = "text-[var(--muted)]";
              let bgClass = "bg-[var(--surface-3)]";
              
              if (typeLower === 'elogio') { typeClass = "text-[var(--ok)]"; bgClass = "bg-[rgba(74,222,128,0.12)]"; }
              else if (typeLower === 'critica') { typeClass = "text-[var(--danger)]"; bgClass = "bg-[rgba(239,68,68,0.14)]"; }
              else if (typeLower === 'objecao') { typeClass = "text-[var(--warn)]"; bgClass = "bg-[rgba(251,191,36,0.13)]"; }
              else if (typeLower === 'recomendacao') { typeClass = "text-[var(--accent)]"; bgClass = "bg-[var(--accent-glow)]"; }

              return (
                <div key={i} className="flex items-start gap-[11px] py-[12px] border-b border-[var(--border-soft)] last:border-none">
                  <div className={`w-[8px] h-[8px] rounded-full mt-[6px] shrink-0 ${typeLower === 'elogio' ? 'bg-[var(--ok)]' : typeLower === 'critica' ? 'bg-[var(--danger)]' : typeLower === 'objecao' ? 'bg-[var(--warn)]' : typeLower === 'recomendacao' ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]'}`}></div>
                  <div className="flex-1 text-[13px] leading-[1.45]">
                    <span className={`font-semibold mr-2 ${typeClass}`}>{m.mention_type}</span>
                    <span className="font-mono text-[var(--muted)] mr-2">em {m.chat_name || "Privado"}</span>
                    <span className="italic text-[var(--text)]">“{m.text}”</span>
                    <div className="text-[11px] text-[var(--muted-2)] font-mono mt-[4px] flex gap-[9px] items-center">
                      <span className="bg-[var(--surface-3)] text-[var(--muted)] px-[7px] py-[1px] rounded-[5px]">{m.entity_name}</span>
                      <span className="bg-[var(--surface-3)] text-[var(--muted)] px-[7px] py-[1px] rounded-[5px]">De: {m.sender_name || "Desconhecido"}</span>
                    </div>
                  </div>
                  <button className="text-[11px] font-sans font-semibold text-[var(--accent)] bg-[var(--accent-glow)] border-none px-[10px] py-[4px] rounded-[7px] cursor-pointer inline-flex items-center gap-[5px] transition-[0.14s] whitespace-nowrap hover:bg-[rgba(45,212,191,0.22)]"><Bookmark className="w-3 h-3" /> salvar</button>
                </div>
              );
            })}
            {!mentionsData?.mentions?.length && (
              <div className="text-center py-8 text-[var(--muted-2)] text-[13px]">Nenhuma menção encontrada.</div>
            )}
          </div>
        </div>

        {/* Recomendações & Métricas */}
        <div className="flex flex-col gap-[16px]">
          <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
            <div className="flex items-center justify-between mb-[16px]">
              <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]"><Star className="w-3.5 h-3.5" /> Recomendações (venda)</h3>
            </div>
            <div className="flex flex-col">
              {mentionsData?.mentions?.filter(m => m.mention_type?.toLowerCase() === 'recomendacao').slice(0,3).map((m, i) => (
                <div key={i} className="flex items-start gap-[12px] py-[13px] border-b border-[var(--border-soft)] last:border-none">
                  <div className="shrink-0 pt-[1px] text-[var(--accent)]"><Star className="w-4 h-4" /></div>
                  <div>
                    <div className="text-[13.5px] font-medium leading-[1.4]">“{m.text}”</div>
                    <div className="text-[11px] text-[var(--muted-2)] font-mono mt-[4px] flex gap-[9px] items-center">
                      <span className="bg-[var(--surface-3)] text-[var(--muted)] px-[7px] py-[1px] rounded-[5px]">{m.chat_name}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!mentionsData?.mentions?.filter(m => m.mention_type?.toLowerCase() === 'recomendacao').length && (
                <div className="text-center py-4 text-[var(--muted-2)] text-[13px]">Sem recomendações recentes.</div>
              )}
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
            <div className="flex items-center justify-between mb-[16px]">
              <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">Métricas</h3>
            </div>
            <div className="flex flex-col gap-[12px]">
              {mentionsData?.kpis?.map((kpi, i) => {
                const typeLower = kpi.mention_type?.toLowerCase() || '';
                let typeClass = "text-[var(--text)]";
                if (typeLower === 'elogio') typeClass = "text-[var(--ok)]";
                else if (typeLower === 'critica') typeClass = "text-[var(--danger)]";
                else if (typeLower === 'objecao') typeClass = "text-[var(--warn)]";
                else if (typeLower === 'recomendacao') typeClass = "text-[var(--accent)]";

                return (
                  <div key={i} className="flex items-center justify-between text-[13.5px]">
                    <span className={`capitalize font-semibold ${typeClass}`}>{kpi.mention_type}</span>
                    <span className="font-mono text-[var(--muted)]">{kpi.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
