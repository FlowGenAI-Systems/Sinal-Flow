export default function Valor() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[4vw] py-[3.5vh]">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#DFDFDF] pb-[1.8vh]">
        <div className="flex items-center gap-[0.8vw]">
          <div className="relative w-[1.8vw] h-[1.8vw]"><span className="absolute left-0 top-0 w-[0.7vw] h-[0.7vw] rounded-full bg-accent" /><span className="absolute right-0 top-[0.2vw] w-[0.5vw] h-[0.5vw] rounded-full bg-accent opacity-70" /><span className="absolute left-[0.25vw] bottom-0 w-[0.55vw] h-[0.55vw] rounded-full bg-accent opacity-80" /><span className="absolute right-[0.1vw] bottom-[0.05vw] w-[0.8vw] h-[0.8vw] rounded-full bg-accent" /></div>
          <div className="text-[1.5vw] font-display font-bold tracking-[0.02em]">Sinal</div>
        </div>
        <div className="flex gap-[1.6vw] text-[1.5vw] font-medium text-muted">
          <div>RESULTADO</div>
          <div>12 / 13</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col justify-center min-h-0 py-[2vh]">
        <div className="text-[1.5vw] font-display font-semibold text-accent uppercase tracking-[0.08em] mb-[1.2vh]">
          Valor gerado
        </div>
        <h1 className="text-[3.4vw] font-display font-extrabold leading-[1.05] tracking-[-0.02em] mb-[3.4vh] text-primary max-w-[60vw]">
          De ~85 mil mensagens a decisões.
        </h1>

        <div className="grid grid-cols-3 gap-[2vw]">
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.8vw] py-[3.2vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.6vw] font-display font-bold text-primary mb-[1.2vh]">Foco</div>
            <div className="text-[2vw] leading-[1.45] text-muted">
              O que precisa de resposta aparece primeiro, por urgência.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.8vw] py-[3.2vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.6vw] font-display font-bold text-primary mb-[1.2vh]">Memória</div>
            <div className="text-[2vw] leading-[1.45] text-muted">
              Conversas viram CRM e histórico pesquisável por contato.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.8vw] py-[3.2vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.6vw] font-display font-bold text-primary mb-[1.2vh]">Visão</div>
            <div className="text-[2vw] leading-[1.45] text-muted">
              Tendências, menções e mídia reunidas em um só lugar.
            </div>
          </div>
        </div>

        <div className="mt-[4vh] flex items-center gap-[3vw] bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[3vw] py-[2.8vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
          <div>
            <div className="text-[2.4vw] font-display font-bold text-primary leading-none">~85 mil</div>
            <div className="text-[1.5vw] font-semibold text-muted uppercase tracking-[0.04em] mt-[0.8vh]">
              mensagens
            </div>
          </div>
          <div className="w-[1px] self-stretch bg-[#DFDFDF]" />
          <div>
            <div className="text-[2.4vw] font-display font-bold text-primary leading-none">7</div>
            <div className="text-[1.5vw] font-semibold text-muted uppercase tracking-[0.04em] mt-[0.8vh]">
              áreas
            </div>
          </div>
          <div className="w-[1px] self-stretch bg-[#DFDFDF]" />
          <div>
            <div className="text-[2.4vw] font-display font-bold text-primary leading-none">100%</div>
            <div className="text-[1.5vw] font-semibold text-muted uppercase tracking-[0.04em] mt-[0.8vh]">
              em português
            </div>
          </div>
          <div className="flex-1 text-right font-serif italic text-[2.2vw] font-medium text-accent leading-[1.15]">
            Todo número leva à mensagem de origem.
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
