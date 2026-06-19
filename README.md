# Sinal

**Inteligência de WhatsApp + CRM.** O Sinal transforma um grande arquivo de
mensagens de WhatsApp (já armazenadas no Supabase) em um cockpit acionável: o que
precisa de resposta, o que está em alta nos seus grupos, quem está te mencionando
e um CRM de contatos — tudo em português do Brasil. O nome é *sinal* sobre
*ruído*.

> Feito por **Bruno Okamoto** usando o **[Replit](https://replit.com)**.
> Projeto **gratuito e open source** sob licença [MIT](LICENSE): qualquer pessoa
> pode visualizar o que acontece no seu WhatsApp, clonar, instalar com as próprias
> credenciais e adaptar como quiser. Use como base para criar a sua versão.

> ### ⚠️ Não existe integração ao vivo com o WhatsApp
> O Sinal **apenas lê** dados. As mensagens são **pré-carregadas em uma tabela
> read-only do Supabase** (`whatsapp_messages`); o app lê essa tabela e a
> enriquece com IA. **Não há telefone para conectar, nenhuma API do WhatsApp e
> nada nunca é enviado.** Para usar o Sinal você traz os seus próprios dados de
> mensagens para o Supabase — veja [Fonte de dados](#fonte-de-dados). Agir no
> WhatsApp continua sendo papel de um humano.

## Funcionalidades

Seis áreas de produto, construídas sobre um princípio — *"nenhum número é beco
sem saída"*: toda métrica permite abrir as mensagens de origem.

- **Visão Geral** — KPIs gerais, mensagens não respondidas e o que está em alta.
- **Privado** — categorias de DMs, triagem de convites, tópicos privados e tempo
  gasto.
- **Grupos** — *pautas* (temas) que cruzam grupos e digests por grupo.
- **Menções** — quem está falando de você ou dos seus produtos, com trechos reais.
- **Contatos** — um CRM com perfis editáveis e histórico por contato.
- **Salvos & Tasks** — itens salvos e tarefas de acompanhamento.

(O app também traz as telas **Mídia** e **Conectores**; a sincronização opcional
de Contatos do Google fica em Conectores.)

## Stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **API:** Express 5 (rotas escritas à mão, sessão por cookie)
- **Banco de dados:** Supabase PostgreSQL + Drizzle ORM
- **IA:** OpenAI (direto), com OpenRouter opcional para execuções em massa mais
  baratas
- **Frontend:** React + Vite + Tailwind v4 + shadcn/ui + React Query + wouter + recharts

## Arquitetura em um relance

```
Supabase  ──►  Jobs de IA       ──►  tabelas do app    ──►  Servidor API  ──►  React
whatsapp_messages   (scripts +       (topics, mentions,    (Express,        frontend
(read-only)          lib/ai)          crm, enrichment…)     leituras com     (/api)
                                                            escopo)
```

Um monorepo pnpm com três grupos de nível superior:

- **`lib/*`** — bibliotecas compartilhadas: `db` (schema Drizzle + pool +
  migrations), `ai` (classificação, clustering, menções, taxonomia) e os pacotes
  de cliente/spec/zod da API.
- **`artifacts/*`** — apps publicáveis: `api-server` (Express) e `sinal-web`
  (React/Vite). `mockup-sandbox` guarda referências estáticas de design e
  `sinal-deck` é a apresentação do projeto.
- **`scripts/*`** — jobs de dados e IA (migrations, bootstrap de auth, backfills,
  construtores de tópicos/menções).

Detalhes completos em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Início rápido

Você precisa de **Node.js 24** e **pnpm**, mais um projeto **Supabase** e uma
**chave de API da OpenAI**.

```bash
pnpm install
cp .env.example .env        # depois preencha os valores
set -a && source .env && set +a

pnpm --filter @workspace/scripts run migrate          # cria as tabelas do app
pnpm --filter @workspace/scripts run bootstrap-auth   # cria seu login de admin

# em dois terminais (cada um com o env carregado):
PORT=8080 pnpm --filter @workspace/api-server run dev
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/sinal-web run dev
```

O servidor de desenvolvimento web faz proxy de `/api` para o servidor de API,
então, com os dois no ar, você abre `http://localhost:5173` e tudo funciona
localmente. O passo a passo completo — variáveis de ambiente, configuração do
Supabase e os jobs de IA — está em **[docs/INSTALACAO.md](docs/INSTALACAO.md)**.

## Documentação

- **[docs/INSTALACAO.md](docs/INSTALACAO.md)** — pré-requisitos, instalação passo
  a passo, todas as APIs/serviços externos e como obter cada credencial, e como
  rodar os jobs de dados/IA.
- **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)** — estrutura do monorepo, rotas
  da API, páginas do frontend, lógica de IA e o pipeline de refresh.
- **[docs/SUPABASE.md](docs/SUPABASE.md)** — como funciona a conexão com o
  Supabase (pooler, SSL), a tabela read-only `whatsapp_messages`, o modelo
  multi-tenant + RLS e a estrutura de todas as tabelas do projeto.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — como contribuir.

## Fonte de dados

O Sinal lê uma única tabela read-only, `whatsapp_messages`, no seu banco
Supabase. O app nunca escreve nela. Para trazer seus próprios dados, carregue
linhas com este formato (colunas de texto, salvo indicação):

| Coluna | Observações |
| --- | --- |
| `id` (bigint) | id da linha |
| `whatsapp_owner` | precisa bater com a variável de ambiente `WHATSAPP_OWNER` |
| `chat_type` | ex.: privado vs grupo |
| `chat_id` | para DMs, o telefone do parceiro; a chave da conversa |
| `chat_name` | nome da conversa / contato |
| `contact_phone` | vazio para DMs |
| `sender_phone`, `sender_name` | autor da mensagem |
| `recipient_phone`, `direction` | roteamento / entrada-saída |
| `message_type`, `message`, `caption` | conteúdo |
| `media_url`, `media_mime_type`, `transcription` | mídia + transcrição |
| `message_id` | único; a chave de junção de todo o enriquecimento |
| `reply_to_message_id`, `forwarded`, `reaction`, `reacted_to_message_id` | threading/reações |
| `status` | status de entrega |
| `message_created_at` (timestamptz) | horário da mensagem |
| `metadata` (jsonb) | extras específicos da origem |

Tudo o que o Sinal calcula (tópicos, menções, CRM, enriquecimento) vive em
tabelas separadas, próprias do app, criadas pelas migrations e ligadas por
`message_id`. A tabela de origem nunca é modificada.

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Em resumo: `pnpm install`, rode
`pnpm run typecheck`, crie um branch e abra um PR. Nunca commite `.env` ou
segredos.

## Licença

[MIT](LICENSE) © 2026 Bruno Okamoto (Pixel Educação).
