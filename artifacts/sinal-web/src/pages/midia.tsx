import { useState } from "react";
import {
  useMediaSummary,
  useMediaStats,
  useMediaTimeseries,
  useMediaByContact,
  useMediaByGroup,
  useMediaMessages,
  type MediaBreakdownRow,
  type MediaGranularity,
  type MediaMessagesFilter,
} from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Loader2,
  Mic,
  Image as ImageIcon,
  FileText,
  Sticker,
  Video,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLUMNS = [
  { key: "audio", label: "Áudios", icon: Mic, color: "#2DD4BF", types: ["AudioMessage"] },
  { key: "image", label: "Imagens", icon: ImageIcon, color: "#60A5FA", types: ["ImageMessage"] },
  { key: "document", label: "Docs", icon: FileText, color: "#F59E0B", types: ["DocumentMessage"] },
  { key: "sticker", label: "Figurinhas", icon: Sticker, color: "#C084FC", types: ["StickerMessage"] },
  { key: "video", label: "Vídeos", icon: Video, color: "#EF4444", types: ["VideoMessage", "PtvMessage"] },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

const GRANULARITIES: { key: MediaGranularity; label: string }[] = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
];

function nf(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function nf1(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}

function labelFor(key: string) {
  return COLUMNS.find((c) => c.key === key)?.label ?? key;
}

function colorFor(key: string) {
  return COLUMNS.find((c) => c.key === key)?.color ?? "var(--muted)";
}

function fmtBucket(iso: string, g: MediaGranularity) {
  const d = new Date(iso);
  if (g === "month")
    return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
  if (g === "week")
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ChartTip({
  active,
  payload,
  label,
  granularity,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string }[];
  label?: string;
  granularity: MediaGranularity;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => (p.value ?? 0) > 0);
  const total = payload.reduce((a, p) => a + (p.value ?? 0), 0);
  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] p-[11px] text-[12px] shadow-xl min-w-[150px]">
      <div className="text-[var(--muted)] mb-[7px] font-medium">
        {label ? fmtBucket(label, granularity) : ""}
      </div>
      {rows
        .slice()
        .reverse()
        .map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-[8px] py-[1px]">
            <span
              className="w-[8px] h-[8px] rounded-[2px] shrink-0"
              style={{ background: p.color }}
            />
            <span className="text-[var(--text)]">{labelFor(String(p.dataKey))}</span>
            <span className="ml-auto font-mono text-[var(--text)]">{nf(p.value ?? 0)}</span>
          </div>
        ))}
      <div className="flex items-center gap-[8px] pt-[6px] mt-[6px] border-t border-[var(--border-soft)]">
        <span className="text-[var(--muted)]">Total</span>
        <span className="ml-auto font-mono font-semibold text-[var(--text)]">{nf(total)}</span>
      </div>
    </div>
  );
}

type Drill = { filter: MediaMessagesFilter; title: string; subtitle: string };

function iconForType(key: string) {
  return COLUMNS.find((c) => c.key === key)?.icon ?? Layers;
}

function MediaDrillSheet({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  const { data, isLoading } = useMediaMessages(drill?.filter ?? null);
  const total = data?.total ?? 0;
  const messages = data?.messages ?? [];
  return (
    <Sheet open={!!drill} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[460px] max-w-[92vw] bg-[var(--surface)] border-l border-[var(--border)] p-0 flex flex-col sm:max-w-none">
        <SheetHeader className="p-[22px_22px_18px] border-b border-[var(--border-soft)] space-y-0">
          <SheetTitle className="font-display font-semibold text-[18px] leading-[1.25]">
            {drill?.title ?? ""}
          </SheetTitle>
          <SheetDescription className="text-[13px] text-[var(--muted)] mt-1">
            {drill?.subtitle ?? ""}
            {!isLoading && total > 0 && (
              <>
                {drill?.subtitle ? " · " : ""}
                {nf(total)} {total === 1 ? "mensagem" : "mensagens"}
                {total > messages.length ? ` (exibindo ${nf(messages.length)})` : ""}
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-[22px]">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-[13px] text-[var(--muted-2)] py-6 text-center">
              Nenhuma mídia encontrada.
            </div>
          ) : (
            <div className="space-y-[12px]">
              {messages.map((m) => {
                const Icon = iconForType(m.type);
                return (
                  <div
                    key={m.message_id}
                    className="flex gap-[11px] py-[12px] border-b border-[var(--border-soft)] last:border-none"
                  >
                    <div
                      className={`w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0 ${
                        m.direction === "inbound"
                          ? "bg-[var(--surface-3)] text-[var(--info)]"
                          : "bg-[rgba(45,212,191,0.1)] text-[var(--accent)]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-[8px]">
                        <span className="text-[12px] font-medium text-[var(--muted)] truncate">
                          {m.sender || m.chat_name || m.chat_id}
                        </span>
                        <span
                          className={`text-[10px] uppercase tracking-[0.06em] font-semibold shrink-0 ${
                            m.direction === "inbound" ? "text-[var(--ok)]" : "text-[var(--accent)]"
                          }`}
                        >
                          {m.direction === "inbound" ? "Recebido" : "Enviado"}
                        </span>
                      </div>
                      {m.chat_name && m.sender && m.chat_name !== m.sender && (
                        <div className="text-[11px] text-[var(--muted-2)] truncate">
                          em {m.chat_name}
                        </div>
                      )}
                      <div className="text-[13.5px] leading-[1.4] text-[var(--text)] mt-[3px]">
                        {m.text || (
                          <span className="text-[var(--muted-2)] italic">{labelFor(m.type)} sem legenda</span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--muted-2)] mt-[3px]">
                        {m.message_created_at ? new Date(m.message_created_at).toLocaleString("pt-BR") : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BreakdownTable({
  rows,
  firstColLabel,
  scope,
  onOpen,
}: {
  rows: MediaBreakdownRow[] | undefined;
  firstColLabel: string;
  scope: "private" | "group";
  onOpen: (d: Drill) => void;
}) {
  const who = scope === "private" ? "contato" : "grupo";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px]">
              {firstColLabel}
            </th>
            <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px] text-right">
              Total
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px] text-right"
              >
                <span className="inline-flex items-center gap-1.5 justify-end">
                  <c.icon className="w-3.5 h-3.5" style={{ color: c.color }} />
                  {c.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.map((row) => {
            const label = row.name || row.chat_id;
            return (
              <tr key={row.chat_id} className="hover:bg-[var(--surface-2)] transition-[0.12s]">
                <td
                  onClick={() =>
                    onOpen({
                      filter: { scope, chatId: row.chat_id },
                      title: label,
                      subtitle: "Todas as mídias",
                    })
                  }
                  className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] font-medium text-[var(--text)] max-w-[220px] truncate cursor-pointer hover:text-[var(--accent)]"
                >
                  {label}
                </td>
                <td
                  onClick={() =>
                    onOpen({
                      filter: { scope, chatId: row.chat_id },
                      title: label,
                      subtitle: "Todas as mídias",
                    })
                  }
                  className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13px] text-[var(--text)] font-mono font-semibold text-right cursor-pointer hover:text-[var(--accent)]"
                >
                  {nf(row.total)}
                </td>
                {COLUMNS.map((c) => {
                  const v = row[c.key] as number;
                  return (
                    <td
                      key={c.key}
                      onClick={
                        v > 0
                          ? () =>
                              onOpen({
                                filter: { scope, chatId: row.chat_id, type: c.key },
                                title: label,
                                subtitle: `${c.label} · ${who}`,
                              })
                          : undefined
                      }
                      className={`py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13px] font-mono text-right ${
                        v > 0
                          ? "text-[var(--text)] cursor-pointer hover:text-[var(--accent)]"
                          : "text-[var(--muted-2)]"
                      }`}
                    >
                      {v > 0 ? nf(v) : "–"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {rows && rows.length === 0 && (
            <tr>
              <td
                colSpan={2 + COLUMNS.length}
                className="py-8 text-center text-[13px] text-[var(--muted-2)]"
              >
                Nenhuma mídia encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Midia() {
  const { data: summary, isLoading: loadingS } = useMediaSummary();
  const { data: stats } = useMediaStats();
  const [granularity, setGranularity] = useState<MediaGranularity>("day");
  const { data: timeseries, isLoading: loadingT } = useMediaTimeseries(granularity);
  const [tab, setTab] = useState<"contatos" | "grupos">("contatos");
  const { data: byContact, isLoading: loadingC } = useMediaByContact(50);
  const { data: byGroup, isLoading: loadingG } = useMediaByGroup(50);
  const [drill, setDrill] = useState<Drill | null>(null);

  if (loadingS) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const audioRow = summary?.byType.find((t) => t.raw_type === "AudioMessage");

  // Number of calendar days covered by the data, used to derive averages per
  // period. Truncate to local midnight so a single day with messages hours
  // apart counts as one day (inclusive day count), avoiding average skew.
  const dayStart = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const spanDays =
    stats?.range.min_at && stats?.range.max_at
      ? Math.max(
          1,
          Math.floor((dayStart(stats.range.max_at) - dayStart(stats.range.min_at)) / 86400000) + 1,
        )
      : 0;

  const statByKey = (key: ColKey) => stats?.byType.find((t) => t.key === key);
  const totalStat = (stats?.byType ?? []).reduce(
    (acc, t) => ({
      total: acc.total + t.total,
      inbound: acc.inbound + t.inbound,
      outbound: acc.outbound + t.outbound,
      private_count: acc.private_count + t.private_count,
      group_count: acc.group_count + t.group_count,
    }),
    { total: 0, inbound: 0, outbound: 0, private_count: 0, group_count: 0 },
  );

  const avg = (total: number, per: "day" | "week" | "month") => {
    if (!spanDays) return 0;
    const divisor = per === "day" ? spanDays : per === "week" ? spanDays / 7 : spanDays / 30.44;
    return total / divisor;
  };

  return (
    <div className="flex flex-col gap-[16px] animate-in fade-in slide-in-from-bottom-2 duration-400">
      {/* Inventory cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[14px]">
        <button
          onClick={() =>
            setDrill({ filter: {}, title: "Toda a mídia", subtitle: "Todos os tipos" })
          }
          className="text-left bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[16px] flex flex-col gap-[4px] cursor-pointer transition-[0.14s] hover:border-[var(--border)] hover:bg-[var(--surface-2)]"
        >
          <div className="flex items-center gap-[8px] text-[var(--muted)]">
            <Layers className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-[11px] uppercase tracking-[0.08em] font-semibold">Total</span>
          </div>
          <div className="font-mono text-[27px] font-semibold text-[var(--text)] mt-[4px]">
            {nf(summary?.total ?? 0)}
          </div>
        </button>

        {COLUMNS.map((c) => {
          const total =
            summary?.byType
              .filter((t) => (c.types as readonly string[]).includes(t.raw_type))
              .reduce((a, t) => a + Number(t.total), 0) ?? 0;
          return (
            <button
              key={c.key}
              onClick={() =>
                setDrill({ filter: { type: c.key }, title: c.label, subtitle: "Todos os chats" })
              }
              className="text-left bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[16px] flex flex-col gap-[4px] cursor-pointer transition-[0.14s] hover:border-[var(--border)] hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-center gap-[8px] text-[var(--muted)]">
                <c.icon className="w-4 h-4" style={{ color: c.color }} />
                <span className="text-[11px] uppercase tracking-[0.08em] font-semibold">{c.label}</span>
              </div>
              <div className="font-mono text-[27px] font-semibold text-[var(--text)] mt-[4px]">
                {nf(total)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Temporal evolution chart */}
      <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
        <div className="flex items-center justify-between mb-[16px] flex-wrap gap-[12px]">
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
            Evolução por tipo
          </h3>
          <div className="inline-flex bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] p-[3px] gap-[2px]">
            {GRANULARITIES.map((g) => (
              <button
                key={g.key}
                onClick={() => setGranularity(g.key)}
                className={`bg-transparent border-none font-inherit text-[12px] font-medium px-[11px] py-[4px] rounded-[6px] cursor-pointer transition-[0.14s] ${
                  granularity === g.key
                    ? "bg-[var(--surface-3)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center flex-wrap gap-x-[16px] gap-y-[6px] mb-[14px]">
          {COLUMNS.map((c) => (
            <div key={c.key} className="flex items-center gap-[6px] text-[12px] text-[var(--muted)]">
              <span className="w-[10px] h-[10px] rounded-[2px]" style={{ background: c.color }} />
              {c.label}
            </div>
          ))}
        </div>

        <div className="h-[280px] w-full">
          {loadingT ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : timeseries && timeseries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeseries} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border-soft)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(v: string) => fmtBucket(v, granularity)}
                  tick={{ fill: "var(--muted-2)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border-soft)" }}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: "var(--muted-2)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)", opacity: 0.5 }}
                  content={<ChartTip granularity={granularity} />}
                />
                {COLUMNS.map((c, i) => (
                  <Bar
                    key={c.key}
                    dataKey={c.key}
                    stackId="media"
                    fill={c.color}
                    radius={i === COLUMNS.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={48}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex justify-center items-center h-full text-[13px] text-[var(--muted-2)]">
              Sem dados de mídia no período.
            </div>
          )}
        </div>
      </div>

      {/* Panorama por tipo: recebido/enviado, privado/grupo, médias */}
      <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
        <div className="flex items-center justify-between mb-[16px] flex-wrap gap-[8px]">
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
            Panorama por tipo
          </h3>
          {spanDays > 0 && (
            <span className="text-[11.5px] text-[var(--muted-2)]">
              Médias sobre {nf(spanDays)} dias de histórico
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px]">
                  Tipo
                </th>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px] text-right">
                  Total
                </th>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px] text-right">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--ok)]" /> Recebidos
                  </span>
                </th>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px] text-right">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--accent)]" /> Enviados
                  </span>
                </th>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px] text-right">
                  Privado
                </th>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px] text-right">
                  Grupos
                </th>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px] text-right">
                  /dia
                </th>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px] text-right">
                  /sem
                </th>
                <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[12px] text-right">
                  /mês
                </th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((c) => {
                const s = statByKey(c.key);
                const total = s?.total ?? 0;
                const drillCell = (
                  v: number,
                  extra: MediaMessagesFilter,
                  subtitle: string,
                ) =>
                  v > 0
                    ? () =>
                        setDrill({
                          filter: { type: c.key, ...extra },
                          title: c.label,
                          subtitle,
                        })
                    : undefined;
                const clickCls = (v: number, base: string) =>
                  v > 0 ? `${base} cursor-pointer hover:text-[var(--accent)]` : base;
                return (
                  <tr key={c.key} className="hover:bg-[var(--surface-2)] transition-[0.12s]">
                    <td
                      onClick={drillCell(total, {}, "Todos os chats")}
                      className={clickCls(
                        total,
                        "py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13.5px] font-medium text-[var(--text)]",
                      )}
                    >
                      <span className="inline-flex items-center gap-[8px]">
                        <c.icon className="w-4 h-4" style={{ color: c.color }} />
                        {c.label}
                      </span>
                    </td>
                    <td
                      onClick={drillCell(total, {}, "Todos os chats")}
                      className={clickCls(
                        total,
                        "py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13px] font-mono font-semibold text-right text-[var(--text)]",
                      )}
                    >
                      {nf(total)}
                    </td>
                    <td
                      onClick={drillCell(s?.inbound ?? 0, { direction: "inbound" }, "Recebidos")}
                      className={clickCls(
                        s?.inbound ?? 0,
                        "py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13px] font-mono text-right text-[var(--text)]",
                      )}
                    >
                      {nf(s?.inbound ?? 0)}
                    </td>
                    <td
                      onClick={drillCell(s?.outbound ?? 0, { direction: "outbound" }, "Enviados")}
                      className={clickCls(
                        s?.outbound ?? 0,
                        "py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13px] font-mono text-right text-[var(--text)]",
                      )}
                    >
                      {nf(s?.outbound ?? 0)}
                    </td>
                    <td
                      onClick={drillCell(s?.private_count ?? 0, { scope: "private" }, "Privado")}
                      className={clickCls(
                        s?.private_count ?? 0,
                        "py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13px] font-mono text-right text-[var(--muted)]",
                      )}
                    >
                      {nf(s?.private_count ?? 0)}
                    </td>
                    <td
                      onClick={drillCell(s?.group_count ?? 0, { scope: "group" }, "Grupos")}
                      className={clickCls(
                        s?.group_count ?? 0,
                        "py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13px] font-mono text-right text-[var(--muted)]",
                      )}
                    >
                      {nf(s?.group_count ?? 0)}
                    </td>
                    <td className="py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13px] font-mono text-right text-[var(--muted)]">
                      {nf1(avg(total, "day"))}
                    </td>
                    <td className="py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13px] font-mono text-right text-[var(--muted)]">
                      {nf1(avg(total, "week"))}
                    </td>
                    <td className="py-[13px] px-[12px] border-b border-[var(--border-soft)] text-[13px] font-mono text-right text-[var(--muted)]">
                      {nf1(avg(total, "month"))}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[var(--surface-2)]">
                <td
                  onClick={() =>
                    setDrill({ filter: {}, title: "Toda a mídia", subtitle: "Todos os tipos" })
                  }
                  className="py-[13px] px-[12px] text-[13.5px] font-semibold text-[var(--text)] cursor-pointer hover:text-[var(--accent)]"
                >
                  Total
                </td>
                <td
                  onClick={() =>
                    setDrill({ filter: {}, title: "Toda a mídia", subtitle: "Todos os tipos" })
                  }
                  className="py-[13px] px-[12px] text-[13px] font-mono font-semibold text-right text-[var(--text)] cursor-pointer hover:text-[var(--accent)]"
                >
                  {nf(totalStat.total)}
                </td>
                <td
                  onClick={() =>
                    setDrill({
                      filter: { direction: "inbound" },
                      title: "Toda a mídia",
                      subtitle: "Recebidos",
                    })
                  }
                  className="py-[13px] px-[12px] text-[13px] font-mono font-semibold text-right text-[var(--text)] cursor-pointer hover:text-[var(--accent)]"
                >
                  {nf(totalStat.inbound)}
                </td>
                <td
                  onClick={() =>
                    setDrill({
                      filter: { direction: "outbound" },
                      title: "Toda a mídia",
                      subtitle: "Enviados",
                    })
                  }
                  className="py-[13px] px-[12px] text-[13px] font-mono font-semibold text-right text-[var(--text)] cursor-pointer hover:text-[var(--accent)]"
                >
                  {nf(totalStat.outbound)}
                </td>
                <td
                  onClick={() =>
                    setDrill({
                      filter: { scope: "private" },
                      title: "Toda a mídia",
                      subtitle: "Privado",
                    })
                  }
                  className="py-[13px] px-[12px] text-[13px] font-mono font-semibold text-right text-[var(--muted)] cursor-pointer hover:text-[var(--accent)]"
                >
                  {nf(totalStat.private_count)}
                </td>
                <td
                  onClick={() =>
                    setDrill({
                      filter: { scope: "group" },
                      title: "Toda a mídia",
                      subtitle: "Grupos",
                    })
                  }
                  className="py-[13px] px-[12px] text-[13px] font-mono font-semibold text-right text-[var(--muted)] cursor-pointer hover:text-[var(--accent)]"
                >
                  {nf(totalStat.group_count)}
                </td>
                <td className="py-[13px] px-[12px] text-[13px] font-mono font-semibold text-right text-[var(--muted)]">
                  {nf1(avg(totalStat.total, "day"))}
                </td>
                <td className="py-[13px] px-[12px] text-[13px] font-mono font-semibold text-right text-[var(--muted)]">
                  {nf1(avg(totalStat.total, "week"))}
                </td>
                <td className="py-[13px] px-[12px] text-[13px] font-mono font-semibold text-right text-[var(--muted)]">
                  {nf1(avg(totalStat.total, "month"))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {audioRow && (
          <div className="text-[12.5px] text-[var(--muted)] flex items-start gap-[8px] mt-[14px]">
            <Mic className="w-4 h-4 text-[var(--accent)] shrink-0 mt-[1px]" style={{ color: colorFor("audio") }} />
            <span>
              Áudios são contados em quantidade, não em minutos — a captação não baixa a duração na
              origem. Dos {nf(audioRow.total)} áudios, {nf(statByKey("audio")?.inbound ?? 0)} foram
              recebidos e {nf(statByKey("audio")?.outbound ?? 0)} enviados.
            </span>
          </div>
        )}
      </div>

      {/* Breakdown por contato/grupo */}
      <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
        <div className="inline-flex bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] p-[3px] gap-[2px] mb-[16px]">
          <button
            onClick={() => setTab("contatos")}
            className={`bg-transparent border-none font-inherit text-[12px] font-medium px-[11px] py-[4px] rounded-[6px] cursor-pointer transition-[0.14s] ${
              tab === "contatos"
                ? "bg-[var(--surface-3)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            Por contato
          </button>
          <button
            onClick={() => setTab("grupos")}
            className={`bg-transparent border-none font-inherit text-[12px] font-medium px-[11px] py-[4px] rounded-[6px] cursor-pointer transition-[0.14s] ${
              tab === "grupos"
                ? "bg-[var(--surface-3)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            Por grupo
          </button>
        </div>

        {tab === "contatos" ? (
          loadingC ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
            </div>
          ) : (
            <BreakdownTable rows={byContact} firstColLabel="Contato" scope="private" onOpen={setDrill} />
          )
        ) : loadingG ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <BreakdownTable rows={byGroup} firstColLabel="Grupo" scope="group" onOpen={setDrill} />
        )}
      </div>

      <MediaDrillSheet drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
