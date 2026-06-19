export default function OpenSource() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[4vw] py-[3.5vh]">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#DFDFDF] pb-[1.8vh]">
        <div className="flex items-center gap-[0.8vw]">
          <div className="relative w-[1.8vw] h-[1.8vw]"><span className="absolute left-0 top-0 w-[0.7vw] h-[0.7vw] rounded-full bg-accent" /><span className="absolute right-0 top-[0.2vw] w-[0.5vw] h-[0.5vw] rounded-full bg-accent opacity-70" /><span className="absolute left-[0.25vw] bottom-0 w-[0.55vw] h-[0.55vw] rounded-full bg-accent opacity-80" /><span className="absolute right-[0.1vw] bottom-[0.05vw] w-[0.8vw] h-[0.8vw] rounded-full bg-accent" /></div>
          <div className="text-[1.5vw] font-display font-bold tracking-[0.02em]">Sinal</div>
        </div>
        <div className="flex gap-[1.6vw] text-[1.5vw] font-medium text-muted">
          <div>DISPONÍVEL</div>
          <div>13 / 13</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col justify-center items-center text-center min-h-0 py-[2vh]">
        <div className="w-[5vw] h-[5vw] rounded-full bg-[rgba(254,80,0,0.1)] flex items-center justify-center mb-[3.4vh]">
          <div className="w-[2.4vw] h-[2.4vw] rounded-[0.5vw] bg-accent" />
        </div>

        <div className="text-[1.5vw] font-display font-semibold text-accent uppercase tracking-[0.08em] mb-[1.4vh]">
          Open source
        </div>
        <h1 className="text-[4.4vw] font-display font-extrabold leading-[1.05] tracking-[-0.02em] mb-[2.4vh] text-primary">
          Feito para ser compartilhado.
        </h1>
        <p className="text-[2vw] leading-[1.5] text-[#3D3D3A] mb-[5vh] max-w-[56vw] [text-wrap:pretty]">
          O Sinal será disponibilizado como código aberto. Clone, rode com o seu próprio WhatsApp e
          adapte ao seu fluxo.
        </p>

        <div className="flex gap-[2vw]">
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[2.4vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent mb-[0.6vh]">1 · Conecte</div>
            <div className="text-[2vw] text-primary font-medium">sua base de mensagens</div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[2.4vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent mb-[0.6vh]">2 · Rode</div>
            <div className="text-[2vw] text-primary font-medium">o pipeline de inteligência</div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[2.4vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent mb-[0.6vh]">3 · Use</div>
            <div className="text-[2vw] text-primary font-medium">o cockpit completo</div>
          </div>
        </div>

        <div className="mt-[5vh] text-[2vw] font-semibold text-primary">
          Em breve no GitHub · Construído no Replit
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
