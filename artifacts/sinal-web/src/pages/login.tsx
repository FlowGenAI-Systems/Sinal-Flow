import { useState } from "react";
import { useLogin } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FlowgenIcon } from "@/components/FlowgenLogo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex flex-col items-center justify-center text-[var(--text)] font-sans p-4 relative overflow-hidden">
      
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--accent)] rounded-full blur-[120px] opacity-[0.03] pointer-events-none" />
      
      <div className="w-full max-w-sm flex flex-col items-center z-10">
        <div className="mb-8"><FlowgenIcon size={56} /></div>
        
        <h1 className="font-display font-semibold text-3xl tracking-wide mb-2 text-white">Bem-vindo ao SinalFlow</h1>
        <p className="text-[var(--muted)] text-sm font-mono mb-8">WhatsApp Intelligence + CRM</p>

        <form onSubmit={handleSubmit} className="w-full bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-6 shadow-xl">
          {login.error && (
            <div className="bg-[rgba(239,68,68,0.14)] text-[var(--danger)] text-[13px] px-4 py-3 rounded-lg mb-6 border border-[rgba(239,68,68,0.2)]">
              {(login.error as any).message || "Falha ao entrar. Verifique suas credenciais."}
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)]">Email</label>
              <Input 
                type="email" 
                name="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br"
                className="bg-[var(--surface-2)] border-[var(--border)] focus-visible:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] h-11 text-sm placeholder:text-[var(--muted-2)]"
                required
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)]">Senha</label>
              </div>
              <Input 
                type="password" 
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-[var(--surface-2)] border-[var(--border)] focus-visible:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] h-11 text-sm placeholder:text-[var(--muted-2)]"
                required
              />
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={login.isPending}
            className="w-full h-11 bg-[var(--accent)] hover:bg-[#14B8A6] text-[#06201e] font-semibold text-sm transition-all"
          >
            {login.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar no Dashboard"}
          </Button>
        </form>
        
        <p className="mt-8 text-[11px] text-[var(--muted-2)] font-mono text-center max-w-[280px]">
          Acesso restrito. Autentique-se para visualizar a inteligência extraída das mensagens.
        </p>
      </div>
    </div>
  );
}
