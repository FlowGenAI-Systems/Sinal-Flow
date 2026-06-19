export default function Title() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[4vw] py-[3.5vh]">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#DFDFDF] pb-[1.8vh]">
        <div className="flex items-center gap-[0.8vw]">
          <div className="relative w-[1.8vw] h-[1.8vw]"><span className="absolute left-0 top-0 w-[0.7vw] h-[0.7vw] rounded-full bg-accent" /><span className="absolute right-0 top-[0.2vw] w-[0.5vw] h-[0.5vw] rounded-full bg-accent opacity-70" /><span className="absolute left-[0.25vw] bottom-0 w-[0.55vw] h-[0.55vw] rounded-full bg-accent opacity-80" /><span className="absolute right-[0.1vw] bottom-[0.05vw] w-[0.8vw] h-[0.8vw] rounded-full bg-accent" /></div>
          <div className="text-[1.5vw] font-display font-bold tracking-[0.02em]">Sinal</div>
        </div>
        <div className="flex gap-[1.6vw] text-[1.5vw] font-medium text-muted">
          <div>APRESENTAÇÃO</div>
          <div>2026</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 grid grid-cols-[5fr_6fr] gap-[3.5vw] items-center min-h-0 py-[2vh]">
        {/* Left */}
        <div className="flex flex-col">
          <div className="text-[1.5vw] font-display font-semibold text-accent uppercase tracking-[0.08em] mb-[1.4vh]">
            Inteligência de WhatsApp + CRM
          </div>
          <h1 className="text-[6vw] font-display font-extrabold leading-[1.0] tracking-[-0.03em] mb-[2.2vh] text-primary">
            Sinal
          </h1>
          <p className="text-[2vw] leading-[1.45] text-[#3D3D3A] mb-[3.4vh] max-w-[40vw] [text-wrap:pretty]">
            Transforma cerca de 85 mil mensagens de WhatsApp em um cockpit de decisão: o que
            responder, o que está em alta e quem fala de você.
          </p>

          <div className="flex gap-[1.4vw]">
            <div className="flex-1 bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.4vw] py-[2vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
              <div className="text-[2.6vw] font-display font-bold text-primary leading-none">~85 mil</div>
              <div className="text-[1.5vw] font-semibold text-muted uppercase tracking-[0.04em] mt-[1vh]">
                mensagens analisadas
              </div>
            </div>
            <div className="flex-1 bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.4vw] py-[2vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
              <div className="text-[2.6vw] font-display font-bold text-primary leading-none">7</div>
              <div className="text-[1.5vw] font-semibold text-muted uppercase tracking-[0.04em] mt-[1vh]">
                áreas de inteligência
              </div>
            </div>
            <div className="flex-1 bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.4vw] py-[2vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
              <div className="text-[2.6vw] font-display font-bold text-primary leading-none">100%</div>
              <div className="text-[1.5vw] font-semibold text-muted uppercase tracking-[0.04em] mt-[1vh]">
                em português
              </div>
            </div>
          </div>
        </div>

        {/* Right — screenshot */}
        <div className="rounded-[1vw] border border-[#DFDFDF] bg-white shadow-[0_1.2vw_3vw_rgba(16,28,126,0.12)] overflow-hidden">
          <div className="flex items-center gap-[0.5vw] px-[1.2vw] py-[1.1vh] border-b border-[#DFDFDF] bg-[#E8E7E1]">
            <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-[rgba(239,68,68,0.7)]" />
            <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-[rgba(245,158,11,0.7)]" />
            <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-[rgba(16,185,129,0.7)]" />
            <div className="ml-[1vw] flex-1 max-w-[22vw] text-[1.5vw] text-muted bg-white border border-[#DFDFDF] rounded-[1vw] px-[1vw] py-[0.4vh]">
              sinal.app
            </div>
          </div>
          <img
            src={`${import.meta.env.BASE_URL}screens/overview.png`}
            crossOrigin="anonymous"
            alt="Tela de Visão Geral do Sinal"
            className="w-full aspect-[1440/776] object-cover object-top"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center border-t border-[#DFDFDF] pt-[1.6vh] text-[1.5vw] text-[#6C6A64] font-medium">
        <div>Sinal — Inteligência de WhatsApp + CRM</div>
        <div className="flex gap-[0.8vw]">
          <span>Open source</span>
          <span>·</span>
          <span>Construído no Replit</span>
        </div>
      </div>
    </div>
  );
}
