import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useSearch } from "@/lib/api";
import {
  LayoutGrid,
  MessageCircle,
  Users,
  AtSign,
  Image,
  Contact,
  Bookmark,
  User,
  Hash,
  Loader2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Visão Geral", icon: LayoutGrid },
  { href: "/privado", label: "Privado", icon: MessageCircle },
  { href: "/grupos", label: "Grupos", icon: Users },
  { href: "/mencoes", label: "Menções", icon: AtSign },
  { href: "/midia", label: "Mídia", icon: Image },
  { href: "/contatos", label: "Contatos", icon: Contact },
  { href: "/salvos", label: "Salvos & Tasks", icon: Bookmark },
];

function useDebounced(value: string, delay = 220): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const { data, isFetching } = useSearch(debounced);

  // Reset the query whenever the palette closes.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function go(path: string) {
    onOpenChange(false);
    setLocation(path);
  }

  const hasTerm = debounced.trim().length >= 2;
  const people = data?.people ?? [];
  const groups = data?.groups ?? [];
  const topics = data?.topics ?? [];
  const noResults =
    hasTerm && !isFetching && !people.length && !groups.length && !topics.length;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Buscar pessoas, grupos, pautas…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* cmdk filters client-side by default; we filter on the server. */}
        {!hasTerm && (
          <CommandGroup heading="Navegar">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() => go(item.href)}
              >
                <item.icon className="text-[var(--muted)]" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasTerm && (
          <CommandEmpty>
            {isFetching ? (
              <span className="inline-flex items-center gap-2 text-[var(--muted)]">
                <Loader2 className="w-4 h-4 animate-spin" /> Buscando…
              </span>
            ) : noResults ? (
              "Nenhum resultado encontrado."
            ) : null}
          </CommandEmpty>
        )}

        {people.length > 0 && (
          <CommandGroup heading="Pessoas">
            {people.map((p) => (
              <CommandItem
                key={`p-${p.id}`}
                value={`pessoa ${p.name ?? ""} ${p.phone ?? ""} ${p.id}`}
                onSelect={() => go(`/contatos?c=${p.id}`)}
              >
                <User className="text-[var(--muted)]" />
                <span className="truncate">{p.name || p.phone || "Sem nome"}</span>
                {p.phone && p.name && (
                  <span className="ml-auto font-mono text-[11px] text-[var(--muted-2)]">
                    {p.phone}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groups.length > 0 && (
          <CommandGroup heading="Grupos">
            {groups.map((g) => (
              <CommandItem
                key={`g-${g.chat_id}`}
                value={`grupo ${g.name ?? ""} ${g.chat_id}`}
                onSelect={() => go(`/grupos?g=${encodeURIComponent(g.chat_id)}`)}
              >
                <Users className="text-[var(--muted)]" />
                <span className="truncate">{g.name || "Grupo sem nome"}</span>
                <span className="ml-auto font-mono text-[11px] text-[var(--muted-2)]">
                  {g.message_count} msgs
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {topics.length > 0 && (
          <CommandGroup heading="Pautas">
            {topics.map((tp) => (
              <CommandItem
                key={`t-${tp.id}`}
                value={`pauta ${tp.label} ${tp.id}`}
                onSelect={() =>
                  go(tp.scope === "private" ? "/privado" : "/grupos")
                }
              >
                <Hash className="text-[var(--muted)]" />
                <span className="truncate">{tp.label}</span>
                {tp.message_count != null && (
                  <span className="ml-auto font-mono text-[11px] text-[var(--muted-2)]">
                    {tp.message_count}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
