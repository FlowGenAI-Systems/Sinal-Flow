import { useState, useEffect, useMemo } from "react";
import { useSearch as useRouteSearch } from "wouter";
import {
  useContacts,
  useContactMessages,
  useContactMetrics,
  useContactLinks,
  useContactAnalysis,
  useGenerateContactAnalysis,
  useContactTasks,
  useUpdateContact,
  useCreateTask,
  useUpdateTask,
  useExportContactToGoogle,
  useLabels,
  useCreateLabel,
  useDeleteLabel,
  useAssignLabel,
  useUnassignLabel,
  useSeedLabels,
  ApiError,
  type Contact,
  type ContactListFilters,
  type Task,
} from "@/lib/api";
import {
  Loader2,
  Link2,
  User,
  X,
  Check,
  Tag,
  Plus,
  Trash2,
  Search,
  ArrowUpDown,
  Sparkles,
  RefreshCw,
  MessageSquare,
  CalendarDays,
  CalendarClock,
  ListTodo,
  Pencil,
  ExternalLink,
} from "lucide-react";

const TAG_PALETTE = [
  "#2DD4BF",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
  "#F59E0B",
  "#22C55E",
  "#FB923C",
  "#38BDF8",
];

function tagStyle(color: string | null | undefined) {
  const c = color || "#60A5FA";
  return {
    color: c,
    backgroundColor: `${c}1f`,
    borderColor: `${c}44`,
  };
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
}
function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR");
}

const SECTION_TITLE =
  "text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px] flex items-center gap-[6px]";

function ContactTags({ contact }: { contact: Contact }) {
  const { data: labels } = useLabels();
  const assign = useAssignLabel();
  const unassign = useUnassignLabel();
  const createLabel = useCreateLabel();
  const deleteLabel = useDeleteLabel();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const own = contact.labels || [];
  const ownIds = new Set(own.map((l) => l.id));
  const available = (labels || []).filter((l) => !ownIds.has(l.id));

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const color = TAG_PALETTE[(labels?.length || 0) % TAG_PALETTE.length];
      const res = await createLabel.mutateAsync({ name, color });
      await assign.mutateAsync({ contactId: contact.id, labelId: res.label.id });
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mb-[22px]">
      <h4 className={SECTION_TITLE}>
        <Tag className="w-3.5 h-3.5" /> Tags
      </h4>

      <div className="flex flex-wrap gap-[7px] mb-[12px]">
        {own.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-[6px] text-[12px] font-medium px-[10px] py-[4px] rounded-[7px] border"
            style={tagStyle(l.color)}
          >
            {l.name}
            <button
              onClick={() =>
                unassign.mutate({ contactId: contact.id, labelId: l.id })
              }
              className="cursor-pointer inline-flex items-center opacity-70 hover:opacity-100"
              aria-label={`Remover tag ${l.name ?? ""}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {own.length === 0 && (
          <span className="text-[12px] text-[var(--muted-2)]">
            Nenhuma tag neste contato.
          </span>
        )}
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap gap-[7px] mb-[12px]">
          {available.map((l) => (
            <button
              key={l.id}
              onClick={() =>
                assign.mutate({ contactId: contact.id, labelId: l.id })
              }
              className="group inline-flex items-center gap-[6px] text-[12px] font-medium px-[10px] py-[4px] rounded-[7px] border border-dashed cursor-pointer hover:border-solid"
              style={tagStyle(l.color)}
            >
              <Plus className="w-3 h-3" /> {l.name}
              <span className="font-mono text-[10px] opacity-60">
                {l.contact_count}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteLabel.mutate(l.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    deleteLabel.mutate(l.id);
                  }
                }}
                className="opacity-0 group-hover:opacity-70 hover:!opacity-100 inline-flex items-center cursor-pointer"
                aria-label={`Excluir tag ${l.name ?? ""}`}
              >
                <Trash2 className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-[8px]">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="Nova tag (ex.: cliente, imprensa)"
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[8px] px-[10px] py-[7px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] placeholder:text-[var(--muted-2)]"
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim() || creating}
          className="px-[12px] py-[7px] rounded-[8px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] text-[12px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-[6px]"
        >
          {creating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Criar
        </button>
      </div>
    </div>
  );
}

const ANALYSIS_MIN = 10;

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border-soft)] rounded-[8px] bg-[var(--surface-2)] p-[10px]">
      <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted-2)]">
        {label}
      </div>
      <div className="text-[15px] font-semibold text-[var(--text)] mt-[2px] font-mono">
        {value}
      </div>
    </div>
  );
}

function MetricsSection({ contactId }: { contactId: string }) {
  const { data: m, isLoading } = useContactMetrics(contactId);
  return (
    <div className="mb-[22px]">
      <h4 className={SECTION_TITLE}>
        <MessageSquare className="w-3.5 h-3.5" /> Métricas
      </h4>
      {isLoading || !m ? (
        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-[8px] mb-[10px]">
            <MetricBox label="Total" value={String(m.total)} />
            <MetricBox label="Enviadas" value={String(m.sent)} />
            <MetricBox label="Recebidas" value={String(m.received)} />
            <MetricBox label="Dias" value={String(m.days)} />
            <MetricBox label="1ª interação" value={fmtDate(m.first_at)} />
            <MetricBox label="Última" value={fmtDate(m.last_at)} />
          </div>
          {m.topics.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted-2)] mb-[6px]">
                Principais pautas
              </div>
              <div className="flex flex-wrap gap-[6px]">
                {m.topics.map((tpc) => (
                  <span
                    key={tpc.topic}
                    className="inline-flex items-center gap-[6px] text-[12px] px-[9px] py-[3px] rounded-[7px] border border-[var(--border-soft)] bg-[var(--surface-2)] text-[var(--text)]"
                  >
                    {tpc.topic}
                    <span className="font-mono text-[10px] text-[var(--muted-2)]">
                      {tpc.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AnalysisSection({
  contactId,
  msgCount,
}: {
  contactId: string;
  msgCount: number;
}) {
  const { data, isLoading } = useContactAnalysis(contactId);
  const generate = useGenerateContactAnalysis();
  const eligible = msgCount > ANALYSIS_MIN;
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    try {
      await generate.mutateAsync(contactId);
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 422
          ? "Contato sem mensagens suficientes para análise."
          : "Falha ao gerar a análise. Tente novamente.";
      setError(msg);
    }
  }

  const analysis = data?.analysis ?? null;

  return (
    <div className="mb-[22px]">
      <h4 className={SECTION_TITLE}>
        <Sparkles className="w-3.5 h-3.5" /> Análise de IA
      </h4>

      {!eligible ? (
        <div className="text-[12.5px] text-[var(--muted-2)] border border-dashed border-[var(--border-soft)] rounded-[8px] p-[12px] bg-[var(--surface-2)]">
          A análise de IA fica disponível para contatos com mais de {ANALYSIS_MIN}{" "}
          mensagens. Este contato tem {msgCount}.
        </div>
      ) : isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
      ) : (
        <div>
          {analysis ? (
            <div className="text-[13px] text-[var(--text)] leading-[1.55] border border-[var(--border-soft)] p-[12px] rounded-[8px] bg-[var(--surface-2)] whitespace-pre-wrap">
              {analysis}
            </div>
          ) : (
            <div className="text-[12.5px] text-[var(--muted-2)] mb-[10px]">
              Nenhuma análise gerada ainda.
            </div>
          )}

          <div className="flex items-center gap-[10px] mt-[10px]">
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="px-[12px] py-[7px] rounded-[8px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] text-[12px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-[6px]"
            >
              {generate.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : analysis ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {analysis ? "Regenerar análise" : "Gerar análise"}
            </button>
            {data?.generatedAt && (
              <span className="text-[11px] text-[var(--muted-2)] font-mono">
                Gerada em {fmtDateTime(data.generatedAt)}
              </span>
            )}
          </div>
          {error && (
            <div className="text-[12px] text-[var(--danger,#EF4444)] mt-[8px]">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinksSection({ contactId }: { contactId: string }) {
  const { data: links, isLoading } = useContactLinks(contactId);
  return (
    <div className="mb-[22px]">
      <h4 className={SECTION_TITLE}>
        <Link2 className="w-3.5 h-3.5" /> Links enviados
      </h4>
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
      ) : !links?.length ? (
        <div className="text-[12.5px] text-[var(--muted-2)]">
          Nenhum link trocado com este contato.
        </div>
      ) : (
        <div className="space-y-[6px] max-h-[220px] overflow-y-auto">
          {links.map((l, i) => (
            <a
              key={`${l.message_id}-${i}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-[8px] text-[12.5px] px-[10px] py-[7px] rounded-[7px] border border-[var(--border-soft)] bg-[var(--surface-2)] hover:border-[var(--accent-dim)] group"
            >
              <span
                className={`shrink-0 text-[10px] font-bold ${l.direction === "inbound" ? "text-[var(--info)]" : "text-[var(--accent)]"}`}
              >
                {l.direction === "inbound" ? "IN" : "OUT"}
              </span>
              <span className="truncate flex-1 text-[var(--text)] group-hover:text-[var(--accent)]">
                {l.url}
              </span>
              <span className="font-mono text-[10px] text-[var(--muted-2)] shrink-0">
                {fmtDate(l.message_created_at)}
              </span>
              <ExternalLink className="w-3 h-3 text-[var(--muted-2)] shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function isOverdue(dueAt: string | null, done: boolean): boolean {
  if (!dueAt || done) return false;
  return new Date(dueAt) < new Date();
}

// <input type="date"> wants YYYY-MM-DD; the API stores a full ISO timestamp.
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function fromDateInput(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toISOString();
}

function TaskRow({ task }: { task: Task }) {
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [due, setDue] = useState(toDateInput(task.due_at));

  function startEdit() {
    setTitle(task.title);
    setNote(task.note ?? "");
    setDue(toDateInput(task.due_at));
    setEditing(true);
  }

  async function save() {
    const t = title.trim();
    if (!t || updateTask.isPending) return;
    await updateTask.mutateAsync({
      id: task.id,
      data: {
        title: t,
        note: note.trim() || null,
        dueAt: fromDateInput(due),
      },
    });
    setEditing(false);
  }

  const overdue = isOverdue(task.due_at, task.done);

  if (editing) {
    return (
      <div className="px-[10px] py-[10px] rounded-[7px] border border-[var(--accent-dim)] bg-[var(--surface-2)] space-y-[8px]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título da task"
          className="w-full bg-[var(--surface)] border border-[var(--border-soft)] rounded-[6px] px-[9px] py-[6px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] placeholder:text-[var(--muted-2)]"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota (opcional)"
          rows={2}
          className="w-full resize-none bg-[var(--surface)] border border-[var(--border-soft)] rounded-[6px] px-[9px] py-[6px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] placeholder:text-[var(--muted-2)]"
        />
        <div className="flex items-center gap-[8px]">
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[6px] px-[9px] py-[6px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
          />
          <div className="flex-1" />
          <button
            onClick={() => setEditing(false)}
            className="px-[10px] py-[6px] rounded-[7px] border border-[var(--border-soft)] text-[12px] text-[var(--muted)] cursor-pointer hover:bg-[var(--surface)]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || updateTask.isPending}
            className="px-[12px] py-[6px] rounded-[7px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] text-[12px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-[6px]"
          >
            {updateTask.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            Salvar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-[10px] px-[10px] py-[8px] rounded-[7px] border bg-[var(--surface-2)] ${
        overdue ? "border-[var(--danger)]" : "border-[var(--border-soft)]"
      }`}
    >
      <button
        onClick={() =>
          updateTask.mutate({ id: task.id, data: { done: !task.done } })
        }
        className={`w-[18px] h-[18px] mt-[1px] rounded-[5px] border flex items-center justify-center shrink-0 cursor-pointer ${
          task.done
            ? "bg-[var(--accent)] border-[var(--accent)] text-[#06201e]"
            : "border-[var(--border)] text-transparent hover:border-[var(--accent-dim)]"
        }`}
        aria-label={task.done ? "Reabrir task" : "Concluir task"}
      >
        <Check className="w-3 h-3" />
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`text-[12.5px] ${task.done ? "line-through text-[var(--muted-2)]" : "text-[var(--text)]"}`}
        >
          {task.title}
        </div>
        {task.note && (
          <div className="text-[11.5px] text-[var(--muted-2)] mt-[2px] whitespace-pre-wrap break-words">
            {task.note}
          </div>
        )}
        {task.due_at && (
          <div
            className={`font-mono text-[10px] mt-[3px] inline-flex items-center gap-[4px] ${
              overdue ? "text-[var(--danger)]" : "text-[var(--muted-2)]"
            }`}
          >
            <CalendarClock className="w-3 h-3" />
            {fmtDate(task.due_at)}
            {overdue && " · atrasada"}
          </div>
        )}
      </div>
      <button
        onClick={startEdit}
        aria-label="Editar task"
        className="shrink-0 text-[var(--muted-2)] hover:text-[var(--accent)] cursor-pointer"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TasksSection({ contactId }: { contactId: string }) {
  const { data: tasks, isLoading } = useContactTasks(contactId);
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  async function handleCreate() {
    const t = title.trim();
    if (!t || createTask.isPending) return;
    await createTask.mutateAsync({
      title: t,
      contactId,
      note: note.trim() || null,
      dueAt: fromDateInput(due),
    });
    setTitle("");
    setNote("");
    setDue("");
    setShowDetails(false);
  }

  return (
    <div className="mb-[22px]">
      <h4 className={SECTION_TITLE}>
        <ListTodo className="w-3.5 h-3.5" /> Tasks
      </h4>

      <div className="mb-[12px] space-y-[8px]">
        <div className="flex items-center gap-[8px]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder="Nova task para este contato"
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[8px] px-[10px] py-[7px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] placeholder:text-[var(--muted-2)]"
          />
          <button
            onClick={() => setShowDetails((v) => !v)}
            aria-label="Prazo e nota"
            className={`px-[9px] py-[7px] rounded-[8px] border text-[12px] cursor-pointer inline-flex items-center ${
              showDetails || due || note.trim()
                ? "border-[var(--accent-dim)] text-[var(--accent)]"
                : "border-[var(--border-soft)] text-[var(--muted-2)] hover:border-[var(--accent-dim)]"
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || createTask.isPending}
            className="px-[12px] py-[7px] rounded-[8px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] text-[12px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-[6px]"
          >
            {createTask.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Add
          </button>
        </div>
        {showDetails && (
          <div className="space-y-[8px] rounded-[8px] border border-[var(--border-soft)] bg-[var(--surface-2)] p-[10px]">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota (opcional)"
              rows={2}
              className="w-full resize-none bg-[var(--surface)] border border-[var(--border-soft)] rounded-[6px] px-[9px] py-[6px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] placeholder:text-[var(--muted-2)]"
            />
            <div className="flex items-center gap-[8px]">
              <span className="text-[11.5px] text-[var(--muted-2)]">Prazo</span>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[6px] px-[9px] py-[6px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
              />
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
      ) : !tasks?.length ? (
        <div className="text-[12.5px] text-[var(--muted-2)]">
          Nenhuma task para este contato.
        </div>
      ) : (
        <div className="space-y-[6px]">
          {tasks.map((tk) => (
            <TaskRow key={tk.id} task={tk} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactDrawer({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const { data: messages, isLoading: loadingMsgs } = useContactMessages(
    contact.id,
  );
  const updateContact = useUpdateContact();
  const exportMut = useExportContactToGoogle();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    displayName: contact.display_name ?? "",
    email: contact.email ?? "",
    primaryPhone: contact.primary_phone ?? "",
    description: contact.description ?? "",
  });

  useEffect(() => {
    setEditing(false);
    setForm({
      displayName: contact.display_name ?? "",
      email: contact.email ?? "",
      primaryPhone: contact.primary_phone ?? "",
      description: contact.description ?? "",
    });
  }, [contact.id, contact.display_name, contact.email, contact.primary_phone, contact.description]);

  async function handleSave() {
    await updateContact.mutateAsync({
      id: contact.id,
      data: {
        displayName: form.displayName.trim() || undefined,
        email: form.email.trim() || null,
        primaryPhone: form.primaryPhone.trim() || null,
        description: form.description.trim() || null,
      },
    });
    setEditing(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start gap-[12px] p-[22px_22px_18px] border-b border-[var(--border-soft)]">
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-[18px] leading-[1.25] truncate">
            {contact.display_name || "Desconhecido"}
          </h2>
          <div className="flex items-center gap-[8px] mt-[4px] flex-wrap">
            <span className="font-mono text-[12px] text-[var(--muted)]">
              {contact.primary_phone || contact.email || "-"}
            </span>
            {contact.dominant_category && (
              <span className="text-[11px] px-[8px] py-[2px] rounded-[6px] border border-[var(--border-soft)] bg-[var(--surface-2)] text-[var(--muted)]">
                {contact.dominant_category}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="w-[30px] h-[30px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] cursor-pointer flex items-center justify-center shrink-0 hover:text-[var(--text)]"
          aria-label="Editar contato"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          className="w-[30px] h-[30px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] cursor-pointer flex items-center justify-center shrink-0 hover:text-[var(--text)]"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-[20px_22px] overflow-y-auto flex-1">
        {editing && (
          <div className="mb-[22px] space-y-[10px] border border-[var(--border-soft)] rounded-[8px] p-[14px] bg-[var(--surface-2)]">
            <h4 className={SECTION_TITLE}>
              <Pencil className="w-3.5 h-3.5" /> Editar contato
            </h4>
            {(
              [
                ["displayName", "Nome"],
                ["primaryPhone", "Telefone"],
                ["email", "Email"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted-2)]">
                  {label}
                </label>
                <input
                  value={form[k]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [k]: e.target.value }))
                  }
                  className="w-full mt-[3px] bg-[var(--surface)] border border-[var(--border-soft)] rounded-[8px] px-[10px] py-[7px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
                />
              </div>
            ))}
            <div>
              <label className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted-2)]">
                Contexto / Bio
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                className="w-full mt-[3px] bg-[var(--surface)] border border-[var(--border-soft)] rounded-[8px] px-[10px] py-[7px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] resize-y"
              />
            </div>
            <div className="flex items-center gap-[8px]">
              <button
                onClick={handleSave}
                disabled={updateContact.isPending}
                className="px-[12px] py-[7px] rounded-[8px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] text-[12px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-[6px]"
              >
                {updateContact.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Salvar
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-[12px] py-[7px] rounded-[8px] border border-[var(--border)] bg-transparent text-[var(--muted)] text-[12px] font-semibold cursor-pointer hover:text-[var(--text)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="mb-[22px]">
          <h4 className={SECTION_TITLE}>
            <User className="w-3.5 h-3.5" /> Contexto / Bio
          </h4>
          <div className="text-[13px] text-[var(--text)] leading-[1.5] border border-[var(--border-soft)] p-[12px] rounded-[8px] bg-[var(--surface-2)]">
            {contact.description || "Nenhuma descrição adicionada."}
          </div>
          <button
            onClick={() => exportMut.mutate(contact.id)}
            disabled={exportMut.isPending}
            className="mt-3 px-[10px] py-[5px] rounded-[7px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] font-inherit text-[11px] font-semibold cursor-pointer hover:border-[var(--accent-dim)] hover:text-[var(--accent)] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {exportMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            {contact.google_resource_name ? (
              <>
                <Check className="w-3 h-3" /> Sincronizado com Google
              </>
            ) : (
              "Exportar para Google Contacts"
            )}
          </button>
        </div>

        <ContactTags contact={contact} />
        <MetricsSection contactId={contact.id} />
        <AnalysisSection contactId={contact.id} msgCount={contact.msg_count} />
        <LinksSection contactId={contact.id} />
        <TasksSection contactId={contact.id} />

        <div>
          <h4 className={SECTION_TITLE}>
            <MessageSquare className="w-3.5 h-3.5" /> Histórico de Mensagens
          </h4>
          {loadingMsgs ? (
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)] mx-auto my-4" />
          ) : (
            <div className="space-y-[12px]">
              {messages?.map((m, i) => (
                <div
                  key={i}
                  className="flex gap-[11px] py-[12px] border-b border-[var(--border-soft)] last:border-none"
                >
                  <div
                    className={`w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0 text-[13px] font-bold ${m.direction === "inbound" ? "bg-[var(--surface-3)] text-[var(--info)]" : "bg-[rgba(45,212,191,0.1)] text-[var(--accent)]"}`}
                  >
                    {m.direction === "inbound" ? "IN" : "OUT"}
                  </div>
                  <div className="flex-1">
                    <div className="text-[13.5px] leading-[1.4] text-[var(--text)]">
                      {m.text}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--muted-2)] mt-[3px]">
                      {fmtDateTime(m.message_created_at)}
                    </div>
                  </div>
                </div>
              ))}
              {!messages?.length && (
                <div className="text-[13px] text-[var(--muted-2)] py-4 text-center">
                  Sem histórico.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Contatos() {
  const [filterLabel, setFilterLabel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [hasTasks, setHasTasks] = useState(false);
  const [sort, setSort] =
    useState<NonNullable<ContactListFilters["sort"]>>("last_interaction");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const filters: ContactListFilters = {
    label: filterLabel || undefined,
    q: debouncedSearch || undefined,
    category: category || undefined,
    hasTasks: hasTasks || undefined,
    sort,
  };

  const { data: contacts, isLoading } = useContacts(filters);
  const { data: labels } = useLabels();
  const seedLabels = useSeedLabels();
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const routeSearch = useRouteSearch();
  useEffect(() => {
    const c = new URLSearchParams(routeSearch).get("c");
    if (c) {
      setSelectedContact(c);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [routeSearch]);

  // Distinct categories present in the loaded base, for the category filter.
  const categories = useMemo(() => {
    const set = new Set<string>();
    (contacts || []).forEach((c) => {
      if (c.dominant_category) set.add(c.dominant_category);
    });
    if (category) set.add(category);
    return Array.from(set).sort();
  }, [contacts, category]);

  const selectedC = contacts?.find((x) => x.id === selectedContact);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
        <div className="flex items-center justify-between mb-[16px]">
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
            Contatos (CRM)
          </h3>
          <span className="font-mono text-[var(--muted)] text-[12px]">
            {contacts?.length || 0} total
          </span>
        </div>

        {/* Search + sort + category + open-tasks toggle */}
        <div className="flex items-center flex-wrap gap-[10px] mb-[14px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              className="w-full bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[8px] pl-[32px] pr-[10px] py-[8px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] placeholder:text-[var(--muted-2)]"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[8px] px-[10px] py-[8px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] cursor-pointer"
          >
            <option value="">Todas as categorias</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <button
            onClick={() => setHasTasks((v) => !v)}
            className={`text-[12px] font-medium px-[12px] py-[8px] rounded-[8px] border cursor-pointer inline-flex items-center gap-[6px] ${
              hasTasks
                ? "border-[var(--accent)] bg-[rgba(45,212,191,0.14)] text-[var(--accent)]"
                : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent-dim)]"
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" /> Com tasks abertas
          </button>

          <div className="inline-flex items-center gap-[6px]">
            <ArrowUpDown className="w-3.5 h-3.5 text-[var(--muted-2)]" />
            <select
              value={sort}
              onChange={(e) =>
                setSort(
                  e.target.value as NonNullable<ContactListFilters["sort"]>,
                )
              }
              className="bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[8px] px-[10px] py-[8px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] cursor-pointer"
            >
              <option value="last_interaction">Última interação</option>
              <option value="volume">Volume de mensagens</option>
              <option value="name">Nome (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Tag filter chips (consumes the TAG system) */}
        <div className="flex items-center flex-wrap gap-[7px] mb-[16px]">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] flex items-center gap-[6px] mr-[2px]">
            <Tag className="w-3.5 h-3.5" /> Tags
          </span>
          <button
            onClick={() => setFilterLabel(null)}
            className={`text-[12px] font-medium px-[10px] py-[4px] rounded-[7px] border cursor-pointer transition-[0.12s] ${
              filterLabel === null
                ? "border-[var(--accent)] bg-[rgba(45,212,191,0.14)] text-[var(--accent)]"
                : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent-dim)]"
            }`}
          >
            Todos
          </button>
          {(labels || []).map((l) => {
            const active = filterLabel === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setFilterLabel(active ? null : l.id)}
                className="inline-flex items-center gap-[6px] text-[12px] font-medium px-[10px] py-[4px] rounded-[7px] border cursor-pointer transition-[0.12s]"
                style={
                  active
                    ? tagStyle(l.color)
                    : {
                        color: "var(--muted)",
                        borderColor: "var(--border-soft)",
                      }
                }
              >
                {l.name}
                <span className="font-mono text-[10px] opacity-60">
                  {l.contact_count}
                </span>
              </button>
            );
          })}
          {(labels?.length || 0) === 0 && (
            <button
              onClick={() => seedLabels.mutate()}
              disabled={seedLabels.isPending}
              className="inline-flex items-center gap-[6px] text-[12px] font-medium px-[10px] py-[4px] rounded-[7px] border border-dashed border-[var(--border-soft)] text-[var(--muted)] cursor-pointer hover:border-[var(--accent-dim)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              {seedLabels.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              Criar tags base (VIP, equipe, cliente)
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-[60px]">
            <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px]">Nome</th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px]">Contato</th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px]">Tags</th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px] text-center">Mensagens</th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px] text-center">Tasks Abertas</th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] font-semibold pb-[12px] border-b border-[var(--border-soft)] px-[14px] text-right">Última Interação</th>
                </tr>
              </thead>
              <tbody>
                {contacts?.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-[var(--surface-2)] transition-[0.12s]"
                    onClick={() => setSelectedContact(c.id)}
                  >
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle">
                      <div className="flex items-center gap-[11px] font-semibold text-[var(--text)]">
                        <div className="w-[30px] h-[30px] rounded-[8px] bg-[var(--surface-3)] flex items-center justify-center shrink-0 text-[var(--muted)]"><User className="w-4 h-4" /></div>
                        {c.display_name || "Desconhecido"}
                      </div>
                    </td>
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle font-mono text-[var(--muted)]">
                      {c.primary_phone || c.email || "-"}
                    </td>
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle">
                      {c.labels && c.labels.length > 0 ? (
                        <div className="flex flex-wrap gap-[5px] max-w-[220px]">
                          {c.labels.slice(0, 3).map((l) => (
                            <span
                              key={l.id}
                              className="inline-flex items-center text-[11px] font-medium px-[8px] py-[2px] rounded-[6px] border whitespace-nowrap"
                              style={tagStyle(l.color)}
                            >
                              {l.name}
                            </span>
                          ))}
                          {c.labels.length > 3 && (
                            <span className="text-[11px] text-[var(--muted-2)]">
                              +{c.labels.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--muted-2)]">-</span>
                      )}
                    </td>
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle text-center font-mono text-[var(--muted)]">
                      {c.msg_count > 0 ? c.msg_count : "-"}
                    </td>
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle text-center">
                      {c.open_tasks > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-[6px] rounded-full bg-[rgba(45,212,191,0.14)] text-[var(--accent)] font-mono text-[11px] font-semibold">
                          {c.open_tasks}
                        </span>
                      ) : (
                        <span className="text-[var(--muted-2)]">-</span>
                      )}
                    </td>
                    <td className="py-[13px] px-[14px] border-b border-[var(--border-soft)] text-[13.5px] align-middle text-right font-mono text-[var(--muted)]">
                      {c.last_interaction_at ? fmtDate(c.last_interaction_at) : "-"}
                    </td>
                  </tr>
                ))}
                {contacts?.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-[28px] px-[14px] text-center text-[13px] text-[var(--muted-2)]"
                    >
                      Nenhum contato encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedContact && (
        <div
          className="fixed inset-0 bg-[rgba(5,5,8,0.66)] z-40 transition-[0.2s]"
          onClick={() => setSelectedContact(null)}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-screen w-[460px] max-w-[94vw] bg-[var(--surface)] border-l border-[var(--border)] transform ${selectedContact ? "translate-x-0" : "translate-x-[101%]"} transition-transform duration-300 ease-out z-50`}
      >
        {selectedC && (
          <ContactDrawer
            key={selectedC.id}
            contact={selectedC}
            onClose={() => setSelectedContact(null)}
          />
        )}
      </div>
    </div>
  );
}
