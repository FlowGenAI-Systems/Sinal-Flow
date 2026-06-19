# Contribuindo com o Sinal

Obrigado pelo interesse em melhorar o Sinal. Este guia cobre a configuração
local, as checagens que esperamos que passem e como propor mudanças.

## Configuração

1. Instale **Node.js 24** e **pnpm**.
2. Faça fork e clone o repositório, depois instale as dependências:
   ```bash
   pnpm install
   ```
3. Copie `.env.example` para `.env` e preencha os valores. O app lê `process.env`
   diretamente, então carregue o arquivo no seu shell antes de rodar qualquer
   coisa:
   ```bash
   cp .env.example .env
   set -a && source .env && set +a
   ```
4. Siga **[docs/INSTALACAO.md](docs/INSTALACAO.md)** para as migrations do banco,
   o bootstrap de auth e como rodar o servidor de API e o app web. O layout do
   monorepo está documentado em **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)** e o
   fluxo do Supabase em **[docs/SUPABASE.md](docs/SUPABASE.md)**.

## Antes de abrir um PR

Rode o type checker em todos os pacotes — ele precisa passar:

```bash
pnpm run typecheck
```

Se você editou algo em `lib/*`, compile as libs compostas primeiro para as leaf
packages não verem declarações desatualizadas:

```bash
pnpm run typecheck:libs
```

O servidor de API tem testes (Vitest); rode-os ao mexer nele:

```bash
pnpm --filter @workspace/api-server run test
```

## Convenções

- **TypeScript em todo lugar.** Acompanhe o estilo existente; rotas e o cliente de
  API do frontend são escritos à mão de propósito, não gerados — mantenha-os em
  sincronia.
- **Use imports do subpath `zod/v4`** (não a raiz do pacote).
- **Branch e PR.** Trabalhe em um branch de feature, mantenha as mudanças focadas
  e escreva uma descrição clara do *quê* e do *porquê*. Referencie qualquer issue
  relacionada.
- **Mantenha `whatsapp_messages` read-only.** Nunca adicione escritas, foreign
  keys ou índices a ela. Novas tabelas precisam carregar `tenant_id` e ter escopo
  por tenant e owner nas queries.
- **A UI é em português do Brasil, sem emojis** — use ícones `lucide-react`.

## Segurança

- **Nunca commite `.env` ou qualquer segredo.** `.env` é gitignored; mantenha
  assim. Chaves reais ficam em Replit Secrets ou no seu `.env` local não
  versionado.
- A chave **service_role do Supabase ignora o RLS** — é apenas do lado do servidor
  e nunca deve chegar ao navegador ou a um commit.
- Se encontrar um problema de segurança, por favor reporte de forma privada em vez
  de abrir uma issue pública.

## Consciência de custo

Alguns jobs de IA chamam APIs pagas sobre o dataset inteiro. Em particular, **não
rode o backfill de texto completo** (`backfill-text-full`) sem entender o custo —
ele pode chegar a dezenas ou baixas centenas de dólares. Rode os jobs de amostra
primeiro. Veja [docs/INSTALACAO.md](docs/INSTALACAO.md#5-jobs-de-ia--dados).
