import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMe } from "@/lib/api";
import { TimeWindowProvider } from "@/lib/timeWindow";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Login from "@/pages/login";
import Overview from "@/pages/overview";
import Privado from "@/pages/privado";
import Grupos from "@/pages/grupos";
import Midia from "@/pages/midia";
import Mencoes from "@/pages/mencoes";
import Contatos from "@/pages/contatos";
import Conectores from "@/pages/conectores";
import Salvos from "@/pages/salvos";
import Vendedores from "@/pages/vendedores";
import NotFound from "@/pages/not-found";
const queryClient = new QueryClient();
function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error } = useMe();
  const [, setLocation] = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)]">
        <div className="w-12 h-12 rounded-xl bg-[radial-gradient(120%_120%_at_30%_20%,var(--accent),var(--accent-dim))] flex items-center justify-center shadow-[0_0_0_1px_rgba(45,212,191,0.3),0_6px_18px_var(--accent-glow)] mb-6">
          <Loader2 className="w-6 h-6 animate-spin text-[#06201e]" />
        </div>
        <h1 className="font-display font-semibold text-2xl tracking-wide">Sinal</h1>
        <p className="text-sm text-[#94A3B8] mt-2 font-mono">Carregando inteligência...</p>
      </div>
    );
  }
  if (error || !data?.user) {
    return <Login />;
  }
  return <>{children}</>;
}
function Router() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/privado" component={Privado} />
      <Route path="/grupos" component={Grupos} />
      <Route path="/midia" component={Midia} />
      <Route path="/mencoes" component={Mencoes} />
      <Route path="/contatos" component={Contatos} />
      <Route path="/conectores" component={Conectores} />
      <Route path="/salvos" component={Salvos} />
      <Route path="/vendedores" component={Vendedores} />
      <Route component={NotFound} />
    </Switch>
  );
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <TimeWindowProvider>
            <AuthGate>
              <AppShell>
                <Router />
              </AppShell>
            </AuthGate>
          </TimeWindowProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
export default App;
