export default function Problema() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[4vw] py-[3.5vh]">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#DFDFDF] pb-[1.8vh]">
        <div className="flex items-center gap-[0.8vw]">
          <div className="relative w-[1.8vw] h-[1.8vw]"><span className="absolute left-0 top-0 w-[0.7vw] h-[0.7vw] rounded-full bg-accent" /><span className="absolute right-0 top-[0.2vw] w-[0.5vw] h-[0.5vw] rounded-full bg-accent opacity-70" /><span className="absolute left-[0.25vw] bottom-0 w-[0.55vw] h-[0.55vw] rounded-full bg-accent opacity-80" /><span className="absolute right-[0.1vw] bottom-[0.05vw] w-[0.8vw] h-[0.8vw] rounded-full bg-accent" /></div>
          <div className="text-[1.5vw] font-display font-bold tracking-[0.02em]">Sinal</div>
        </div>
        <div className="flex gap-[1.6vw] text-[1.5vw] font-medium text-muted">
          <div>CONTEXTO</div>
          <div>02 / 13</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col justify-center min-h-0 py-[2vh]">
        <div className="text-[1.5vw] font-display font-semibold text-accent uppercase tracking-[0.08em] mb-[1.2vh]">
          O problema
        </div>
        <h1 className="text-[3.6vw] font-display font-extrabold leading-[1.05] tracking-[-0.02em] mb-[2vh] text-primary max-w-[60vw]">
          Um WhatsApp cheio vira ruído.
        </h1>
        <p className="text-[2vw] leading-[1.5] text-[#3D3D3A] mb-[4vh] max-w-[58vw] [text-wrap:pretty]">
          Dezenas de grupos e conversas privadas geram milhares de mensagens por semana. As
          importantes se perdem, convites ficam sem resposta e não há como enxergar o que realmente
          importa.
        </p>

        <div className="grid grid-cols-3 gap-[2vw]">
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.8vw] py-[3vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[2vw] font-display font-bold text-primary mb-[1vh]">Volume</div>
            <div className="text-[2vw] leading-[1.4] text-muted">
              Milhares de mensagens espalhadas entre grupos e conversas privadas.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.8vw] py-[3vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[2vw] font-display font-bold text-primary mb-[1vh]">Perda</div>
            <div className="text-[2vw] leading-[1.4] text-muted">
              Pedidos, convites e perguntas diretas somem no meio do fluxo.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.8vw] py-[3vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[2vw] font-display font-bold text-primary mb-[1vh]">Sem visão</div>
            <div className="text-[2vw] leading-[1.4] text-muted">
              Nenhuma forma de ver tendências, pendências ou quem fala de você.
            </div>
          </div>
        </div>

        <div className="mt-[4vh] text-[2vw] font-semibold text-primary border-l-[0.3vw] border-accent pl-[1.4vw]">
          Princípio do Sinal: nenhum número é beco sem saída — todo dado leva à mensagem de origem.
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
