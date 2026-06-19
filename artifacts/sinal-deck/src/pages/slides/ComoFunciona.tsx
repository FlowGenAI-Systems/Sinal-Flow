export default function ComoFunciona() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[4vw] py-[3.5vh]">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#DFDFDF] pb-[1.8vh]">
        <div className="flex items-center gap-[0.8vw]">
          <div className="relative w-[1.8vw] h-[1.8vw]"><span className="absolute left-0 top-0 w-[0.7vw] h-[0.7vw] rounded-full bg-accent" /><span className="absolute right-0 top-[0.2vw] w-[0.5vw] h-[0.5vw] rounded-full bg-accent opacity-70" /><span className="absolute left-[0.25vw] bottom-0 w-[0.55vw] h-[0.55vw] rounded-full bg-accent opacity-80" /><span className="absolute right-[0.1vw] bottom-[0.05vw] w-[0.8vw] h-[0.8vw] rounded-full bg-accent" /></div>
          <div className="text-[1.5vw] font-display font-bold tracking-[0.02em]">Sinal</div>
        </div>
        <div className="flex gap-[1.6vw] text-[1.5vw] font-medium text-muted">
          <div>ARQUITETURA</div>
          <div>03 / 13</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col justify-center min-h-0 py-[2vh]">
        <div className="text-[1.5vw] font-display font-semibold text-accent uppercase tracking-[0.08em] mb-[1.2vh]">
          Como funciona
        </div>
        <h1 className="text-[3.4vw] font-display font-extrabold leading-[1.05] tracking-[-0.02em] mb-[3.4vh] text-primary max-w-[60vw]">
          Da mensagem bruta à decisão.
        </h1>

        {/* Pipeline */}
        <div className="flex items-stretch gap-[1vw]">
          <div className="flex-1 bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.4vw] py-[2.6vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-[rgba(254,80,0,0.12)] text-accent text-[1.5vw] font-bold flex items-center justify-center mb-[1.6vh]">
              1
            </div>
            <div className="text-[2vw] font-display font-bold text-primary mb-[0.8vh]">Captura</div>
            <div className="text-[1.6vw] leading-[1.4] text-muted">
              Mensagens ficam no Supabase — somente leitura, nunca alteradas.
            </div>
          </div>

          <div className="flex items-center text-accent text-[1.8vw] font-bold">›</div>

          <div className="flex-1 bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.4vw] py-[2.6vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-[rgba(254,80,0,0.12)] text-accent text-[1.5vw] font-bold flex items-center justify-center mb-[1.6vh]">
              2
            </div>
            <div className="text-[2vw] font-display font-bold text-primary mb-[0.8vh]">Classifica</div>
            <div className="text-[1.6vw] leading-[1.4] text-muted">
              IA atribui categoria, urgência, tópicos e menções a cada mensagem.
            </div>
          </div>

          <div className="flex items-center text-accent text-[1.8vw] font-bold">›</div>

          <div className="flex-1 bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.4vw] py-[2.6vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-[rgba(254,80,0,0.12)] text-accent text-[1.5vw] font-bold flex items-center justify-center mb-[1.6vh]">
              3
            </div>
            <div className="text-[2vw] font-display font-bold text-primary mb-[0.8vh]">Enriquece</div>
            <div className="text-[1.6vw] leading-[1.4] text-muted">
              Pipeline incremental monta contatos, pautas e menções.
            </div>
          </div>

          <div className="flex items-center text-accent text-[1.8vw] font-bold">›</div>

          <div className="flex-1 bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.4vw] py-[2.6vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-accent text-white text-[1.5vw] font-bold flex items-center justify-center mb-[1.6vh]">
              4
            </div>
            <div className="text-[2vw] font-display font-bold text-primary mb-[0.8vh]">Cockpit</div>
            <div className="text-[1.6vw] leading-[1.4] text-muted">
              Sete áreas de inteligência, em português, com drill-down.
            </div>
          </div>
        </div>

        {/* Tech strip */}
        <div className="mt-[4vh] bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[2vw] py-[2.2vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)] flex items-center justify-between">
          <div className="text-[1.5vw] font-semibold text-muted uppercase tracking-[0.06em]">
            Stack
          </div>
          <div className="text-[1.5vw] font-semibold text-primary">
            Replit · TypeScript · Express · Supabase/Postgres · Drizzle · OpenAI · React
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center border-t border-[#DFDFDF] pt-[1.6vh] text-[1.5vw] text-[#6C6A64] font-medium">
        <div>Sinal — Inteligência de WhatsApp + CRM</div>
        <div className="flex gap-[0.8vw]">
          <span>Open source</span>
          <span>·</span>
          <span>pt-BR</span>
        </div>
      </div>
    </div>
  );
}
