import { useState } from "react";
import {
  useManagedAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  type ManagedAccount,
} from "@/lib/api";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";

const btnBase =
  "px-[12px] py-[6px] rounded-[9px] text-[12.5px] font-semibold cursor-pointer transition-colors disabled:opacity-50 inline-flex items-center gap-1.5";

function AddForm() {
  const create = useCreateAccount();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const valid = /^\d{8,20}$/.test(phone.trim()) && name.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!valid) {
      setErr("Informe um telefone (só dígitos, 8–20) e um nome.");
      return;
    }
    create.mutate(
      { phone: phone.trim(), name: name.trim() },
      {
        onSuccess: () => {
          setPhone("");
          setName("");
        },
        onError: () => setErr("Não foi possível salvar. Tente novamente."),
      },
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 p-[18px] border border-[var(--border-soft)] rounded-[var(--radius)] bg-[var(--surface)]"
    >
      <div className="font-semibold text-[14px]">Adicionar usuário</div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex.: Pedro Thomaz)"
          className="flex-1 min-w-[180px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-[12px] py-[8px] text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="Telefone (ex.: 5511999999999)"
          inputMode="numeric"
          className="flex-1 min-w-[180px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-[12px] py-[8px] text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] font-mono"
        />
        <button
          type="submit"
          disabled={!valid || create.isPending}
          className={`${btnBase} border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] hover:opacity-90`}
        >
          {create.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Adicionar
        </button>
      </div>
      {err && <div className="text-[12px] text-[var(--danger,#f87171)]">{err}</div>}
    </form>
  );
}

function AccountRow({ acc }: { acc: ManagedAccount }) {
  const update = useUpdateAccount();
  const del = useDeleteAccount();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(acc.name);

  function saveName() {
    const name = draft.trim();
    if (!name || name === acc.name) {
      setEditing(false);
      setDraft(acc.name);
      return;
    }
    update.mutate(
      { id: acc.id, data: { name } },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <div className="flex items-center gap-[12px] p-[14px_18px] border border-[var(--border-soft)] rounded-[var(--radius)] bg-[var(--surface)]">
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(acc.name);
                }
              }}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[7px] px-[10px] py-[5px] text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
            />
            <button
              onClick={saveName}
              disabled={update.isPending}
              className="text-[var(--accent)] hover:opacity-80 disabled:opacity-50 inline-flex"
              title="Salvar"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setDraft(acc.name);
              }}
              className="text-[var(--muted)] hover:text-[var(--text)] inline-flex"
              title="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[14px] truncate">{acc.name}</span>
            <button
              onClick={() => {
                setDraft(acc.name);
                setEditing(true);
              }}
              className="text-[var(--muted-2)] hover:text-[var(--text)] inline-flex shrink-0"
              title="Editar nome"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="text-[12px] text-[var(--muted)] font-mono mt-[2px]">
          {acc.phone}
        </div>
      </div>

      <span
        className={`flex items-center gap-1.5 text-[12px] font-medium ${
          acc.active ? "text-[var(--ok,#4ade80)]" : "text-[var(--muted-2)]"
        }`}
      >
        <span
          className={`w-[8px] h-[8px] rounded-full ${
            acc.active
              ? "bg-[var(--ok,#4ade80)] shadow-[0_0_8px_var(--ok,#4ade80)]"
              : "bg-[var(--muted-2)]"
          }`}
        />
        {acc.active ? "Ativo" : "Inativo"}
      </span>

      <button
        onClick={() =>
          update.mutate({ id: acc.id, data: { active: !acc.active } })
        }
        disabled={update.isPending}
        className={`${btnBase} border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent-dim)]`}
      >
        {acc.active ? "Desativar" : "Ativar"}
      </button>

      <button
        onClick={() => {
          if (confirm(`Remover "${acc.name}" (${acc.phone})?`)) del.mutate(acc.id);
        }}
        disabled={del.isPending}
        className="text-[var(--muted-2)] hover:text-[var(--danger,#f87171)] inline-flex shrink-0 disabled:opacity-50"
        title="Remover"
      >
        {del.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

export default function Usuarios() {
  const { data: accounts, isLoading } = useManagedAccounts();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-400 max-w-[760px]">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
          Usuários
        </h3>
        <p className="text-[12.5px] text-[var(--muted-2)] mt-[3px]">
          Números de WhatsApp monitorados. Os ativos aparecem no seletor do topo
          e somam em "Todos os usuários".
        </p>
      </div>

      <AddForm />

      {isLoading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <div className="text-[13px] text-[var(--muted)]">
          Nenhum usuário cadastrado ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((acc) => (
            <AccountRow key={acc.id} acc={acc} />
          ))}
        </div>
      )}
    </div>
  );
}
