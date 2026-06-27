import { ReactNode, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGoogleStatus,
  useGoogleImport,
  useGoogleDisconnect,
  getGoogleConnectUrl,
  qk,
} from "@/lib/api";
import {
  Loader2,
  X,
  Contact,
  MessageCircle,
  Code2,
  Bot,
} from "lucide-react";

function ConnectorCard({
  icon,
  name,
  description,
  children,
}: {
  icon: ReactNode;
  name: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-[14px] p-[18px] border border-[var(--border-soft)] rounded-[var(--radius)] bg-[var(--surface)]">
      <div className="w-[44px] h-[44px] rounded-[11px] flex items-center justify-center bg-[var(--surface-3)] text-[#F4F6F9] shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[14px]">{name}</div>
        <div className="text-[12px] text-[var(--muted)] mt-[2px]">
          {description}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-[7px] text-[12.5px] font-medium shrink-0">
        {children}
      </div>
    </div>
  );
}

function ComingSoonBadge() {
  return (
    <span className="px-[12px] py-[6px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-2)] text-[12px] font-semibold">
      Em breve
    </span>
  );
}

function GoogleCard() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useGoogleStatus();
  const importMut = useGoogleImport();
  const disconnect = useGoogleDisconnect();
  const [banner, setBanner] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data as { source?: string; status?: string } | null;
      if (!d || d.source !== "sinal-google") return;
      setConnecting(false);
      if (d.status === "connected") {
        setBanner("Google conectado com sucesso.");
        qc.invalidateQueries({ queryKey: qk.googleStatus });
      } else if (d.status === "denied") {
        setBanner("Conexão com o Google cancelada.");
      } else {
        setBanner("Falha ao conectar com o Google. Tente novamente.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [qc]);

  async function handleConnect() {
    setConnecting(true);
    const tab = window.open("", "_blank");
    try {
      const { url } = await getGoogleConnectUrl();
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
    } catch {
      if (tab) tab.close();
      setConnecting(false);
      setBanner("Não foi possível iniciar a conexão com o Google.");
    }
  }

  return (
    <ConnectorCard
      icon={<Contact className="w-5 h-5" />}
      name="Google Contatos"
      description={
        isLoading
          ? "Verificando conexão..."
          : status?.connected
            ? `Sincronizando com ${status.email}`
            : "Importe seus contatos para o CRM"
      }
    >
      {status?.connected ? (
        <>
          <span className="text-[var(--ok)] flex items-center gap-1.5 mr-2">
            <span className="w-[8px] h-[8px] rounded-full bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]"></span>{" "}
            Ativo
          </span>
          <button
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending}
            className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-inherit text-[12.5px] font-semibold cursor-pointer hover:border-[var(--accent-dim)] disabled:opacity-50 inline-flex items-center gap-2"
          >
            {importMut.isPending && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            Importar / Sincronizar
          </button>
          <button
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-transparent text-[var(--muted)] font-inherit text-[12.5px] font-semibold cursor-pointer hover:border-[var(--border)] hover:text-[var(--text)] disabled:opacity-50"
          >
            Desconectar
          </button>
        </>
      ) : (
        <>
          <span className="text-[var(--muted-2)] flex items-center gap-1.5 mr-2">
            <span className="w-[8px] h-[8px] rounded-full bg-[var(--muted-2)]"></span>{" "}
            Inativo
          </span>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-[14px] py-[7px] rounded-[9px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] font-inherit text-[12.5px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {connecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Conectar Google
          </button>
        </>
      )}
      {banner && (
        <div className="fixed top-4 right-4 bg-[var(--surface-2)] border border-[var(--border)] px-4 py-2 rounded shadow-lg text-sm text-[var(--text)] z-50 flex items-center gap-2">
          {banner}
          <button
            onClick={() => setBanner(null)}
            className="text-[var(--muted)] ml-2 hover:text-[var(--text)] inline-flex items-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </ConnectorCard>
  );
}

export default function Conectores() {
  return (
    <div className="flex flex-col gap-7 animate-in fade-in slide-in-from-bottom-2 duration-400 max-w-[860px]">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
            Ferramentas
          </h3>
          <p className="text-[12.5px] text-[var(--muted-2)] mt-[3px]">
            Integrações com serviços externos.
          </p>
        </div>
        <GoogleCard />
        <ConnectorCard
          icon={<MessageCircle className="w-5 h-5" />}
          name="WhatsApp"
          description="Conexão direta com sua conta do WhatsApp."
        >
          <ComingSoonBadge />
        </ConnectorCard>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
            Conexões técnicas
          </h3>
          <p className="text-[12.5px] text-[var(--muted-2)] mt-[3px]">
            Acesso aos seus dados via API e ferramentas de IA.
          </p>
        </div>
        <ConnectorCard
          icon={<Code2 className="w-5 h-5" />}
          name="API"
          description="Acesse seus dados do Sinal por uma API REST."
        >
          <ComingSoonBadge />
        </ConnectorCard>
        <ConnectorCard
          icon={<Bot className="w-5 h-5" />}
          name="Claude (MCP)"
          description="Conecte o Claude aos seus dados via MCP."
        >
          <ComingSoonBadge />
        </ConnectorCard>
      </section>
    </div>
  );
}
