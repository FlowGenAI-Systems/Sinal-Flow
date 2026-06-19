export default function Replit() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[4vw] py-[3.5vh]">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#DFDFDF] pb-[1.8vh]">
        <div className="flex items-center gap-[0.8vw]">
          <div className="relative w-[1.8vw] h-[1.8vw]"><span className="absolute left-0 top-0 w-[0.7vw] h-[0.7vw] rounded-full bg-accent" /><span className="absolute right-0 top-[0.2vw] w-[0.5vw] h-[0.5vw] rounded-full bg-accent opacity-70" /><span className="absolute left-[0.25vw] bottom-0 w-[0.55vw] h-[0.55vw] rounded-full bg-accent opacity-80" /><span className="absolute right-[0.1vw] bottom-[0.05vw] w-[0.8vw] h-[0.8vw] rounded-full bg-accent" /></div>
          <div className="text-[1.5vw] font-display font-bold tracking-[0.02em]">Sinal</div>
        </div>
        <div className="flex gap-[1.6vw] text-[1.5vw] font-medium text-muted">
          <div>STACK &amp; PROCESSO</div>
          <div>11 / 13</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col justify-center min-h-0 py-[2vh]">
        <div className="text-[1.5vw] font-display font-semibold text-accent uppercase tracking-[0.08em] mb-[1.2vh]">
          Construído no Replit
        </div>
        <h1 className="text-[3.4vw] font-display font-extrabold leading-[1.05] tracking-[-0.02em] mb-[1.6vh] text-primary max-w-[60vw]">
          Do banco à interface, tudo em um só lugar.
        </h1>
        <p className="text-[2vw] leading-[1.5] text-[#3D3D3A] mb-[3.4vh] max-w-[58vw] [text-wrap:pretty]">
          Todo o Sinal foi desenvolvido e roda no Replit — código, banco, IA e deploy.
        </p>

        <div className="grid grid-cols-3 gap-[2vw]">
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent uppercase tracking-[0.06em] mb-[0.8vh]">
              Frontend
            </div>
            <div className="text-[2vw] leading-[1.4] text-primary font-medium">
              React, Vite, Tailwind e shadcn/ui.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent uppercase tracking-[0.06em] mb-[0.8vh]">
              Backend
            </div>
            <div className="text-[2vw] leading-[1.4] text-primary font-medium">
              Express 5 em Node + TypeScript.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent uppercase tracking-[0.06em] mb-[0.8vh]">
              Dados
            </div>
            <div className="text-[2vw] leading-[1.4] text-primary font-medium">
              Supabase/Postgres com Drizzle ORM.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent uppercase tracking-[0.06em] mb-[0.8vh]">
              IA
            </div>
            <div className="text-[2vw] leading-[1.4] text-primary font-medium">
              OpenAI para classificação, pautas e menções.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent uppercase tracking-[0.06em] mb-[0.8vh]">
              Operação
            </div>
            <div className="text-[2vw] leading-[1.4] text-primary font-medium">
              Pipeline incremental agendado mantém tudo atualizado.
            </div>
          </div>
          <div className="bg-white rounded-[0.9vw] border border-[#DFDFDF] px-[1.6vw] py-[2.4vh] shadow-[0_0.5vw_1.5vw_rgba(16,28,126,0.05)]">
            <div className="text-[1.5vw] font-semibold text-accent uppercase tracking-[0.06em] mb-[0.8vh]">
              Fundação
            </div>
            <div className="text-[2vw] leading-[1.4] text-primary font-medium">
              Multi-tenant desde o início; mensagens originais somente leitura.
            </div>
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
