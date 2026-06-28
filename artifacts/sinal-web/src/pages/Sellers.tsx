import { useEffect, useMemo, useState } from "react";

type SellerRow = {
  phone: string | null;
  vendedor: string;
  tempo_resp_min: number;
  conversas_dia: number;
  pendencias: number;
};
type SortKey = "vendedor" | "tempo_resp_min" | "conversas_dia" | "pendencias";

export default function SellersPage() {
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>("pendencias");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/sellers?days=${days}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => alive && setRows(Array.isArray(d.rows) ? d.rows : []))
      .catch((e) => alive && setError(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  const { team, sellers } = useMemo(() => {
    const team = rows.find((r) => r.phone == null) ?? null;
    const list = rows.filter((r) => r.phone != null);
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return { team, sellers: sorted };
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "vendedor" ? "asc" : "desc");
    }
  }

  const cols: { key: SortKey; label: string; align: string }[] = [
    { key: "vendedor", label: "Vendedor", align: "text-left" },
    { key: "tempo_resp_min", label: "Tempo de resposta", align: "text-right" },
    { key: "conversas_dia", label: "Conversas/dia", align: "text-right" },
    { key: "pendencias", label: "Pendências", align: "text-right" },
  ];

  const fmtTempo = (m: number) =>
    m <= 0 ? "—" : m < 60 ? `${m.toFixed(0)} min` : `${(m / 60).toFixed(1)} h`;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Vendedores</h1>
          <p className="text-sm text-slate-500">
            Comparativo do time — últimos {days} dias
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm"
        >
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`cursor-pointer select-none px-4 py-3 font-medium text-slate-600 ${c.align} hover:text-slate-900`}
                >
                  {c.label}
                  {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Carregando…</td></tr>
            ) : error ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-rose-500">Erro ao carregar ({error})</td></tr>
            ) : (
              <>
                {team && (
                  <tr className="border-b border-slate-200 bg-teal-50/60 font-semibold text-slate-800">
                    <td className="px-4 py-3">{team.vendedor}</td>
                    <td className="px-4 py-3 text-right">{fmtTempo(team.tempo_resp_min)}</td>
                    <td className="px-4 py-3 text-right">{team.conversas_dia}</td>
                    <td className="px-4 py-3 text-right">{team.pendencias}</td>
                  </tr>
                )}
                {sellers.map((s) => (
                  <tr key={s.phone} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{s.vendedor}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{fmtTempo(s.tempo_resp_min)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{s.conversas_dia}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={s.pendencias > 0
                        ? "inline-flex min-w-7 justify-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700"
                        : "text-slate-400"}>
                        {s.pendencias}
                      </span>
                    </td>
                  </tr>
                ))}
                {sellers.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhum vendedor cadastrado ainda.</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Tempo de resposta: mediana em horário comercial (seg–sex, 8h–17h, fuso SP).
        Conversas/dia: média de contatos distintos. Pendências: conversas cuja última
        mensagem é do cliente.
      </p>
    </div>
  );
}
