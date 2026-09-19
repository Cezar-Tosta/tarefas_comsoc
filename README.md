# Tarefas COMSOC

Painel de tarefas e subtarefas para publicar no **GitHub Pages**, com Gantt, filtros e perfis de acesso.
Front-end estático (Vite + TypeScript, sem framework) e **Supabase** como backend (login + Postgres).

## O que faz

- **Tarefas e subtarefas**: cadastrar, editar, excluir; responsável, prioridade, status, datas de início/fim.
- **Progresso**: percentual por tarefa calculado pelas subtarefas concluídas + progresso geral.
- **Subtarefas**: checkbox; as concluídas ficam riscadas e agrupadas em um bloco recolhido ("Concluídas (n)").
- **Gantt**: escala por dia/semana/mês, linha de "hoje", barras com progresso, subtarefas opcionais, atrasadas em vermelho.
- **Filtros** (valem para lista, Gantt e exportação): busca, status (inclui "atrasadas"), responsável, prioridade, período, ocultar concluídas. Ficam salvos no navegador.
- **Comentários** em cada tarefa, em formato de chat (atualiza sozinho a cada 8 s enquanto aberto). Administradores e usuários comentam; visualizadores só leem. Apaga quem escreveu ou um administrador. Links coladas no texto viram clicáveis.
- **Links** anexados à tarefa (título opcional; só http/https). Quem edita a tarefa adiciona e remove.
- **Relatórios**: o administrador vê o andamento por pessoa (tarefas e subtarefas, atrasos, próximos prazos); cada usuário vê o seu. Mostra dias de atraso, dias que faltam, maior atraso e o que vence em 7 dias. Visualizadores não têm essa aba.
- **Visibilidade**: o usuário só vê tarefas em que é responsável (pela tarefa ou por uma subtarefa). Sem nada atribuído, as abas ficam vazias com um aviso. Administrador e visualizador veem tudo.
- **Exportar CSV** (abre direto no Excel).
- **Perfis**:

  | Perfil               | Pode                                                                                              |
  | -------------------- | ------------------------------------------------------------------------------------------------- |
  | Administrador        | Tudo: criar/editar/excluir tarefas e subtarefas, atribuir responsáveis, gerir usuários            |
  | Usuário              | Editar **somente** tarefas atribuídas a ele (e as subtarefas delas) e subtarefas atribuídas a ele |
  | Visualizador         | Somente consulta                                                                                  |
  | Aguardando aprovação | Sem acesso até um administrador definir o perfil                                                  |

  O **primeiro cadastro vira administrador**; os seguintes entram como "aguardando aprovação".
  As permissões são **aplicadas no banco** (Row Level Security em `supabase/schema.sql`); a interface apenas esconde o que não se pode fazer.

## Configuração (uma vez)

1. Crie um projeto em <https://supabase.com>.
2. No **SQL Editor**, cole e execute o **conteúdo** de `supabase/schema.sql` e, em seguida, de `supabase/002_comments_links.sql` (comentários e links) e `supabase/003_user_visibility.sql` (cada usuário só enxerga o que está ligado a ele). Rode cada um, nessa ordem.
3. Em **Authentication → Providers → Email**, decida se exige confirmação de e-mail
   (desligar simplifica o primeiro acesso; ligar é mais seguro). Em **Authentication → URL Configuration**,
   coloque a URL do seu Pages (`https://<usuario>.github.io/<repo>/`) em _Site URL_.
4. Copie **Project URL** e a chave **anon** (Project Settings → API).
5. Local: `cp .env.example .env.local`, preencha, e rode `pnpm install && pnpm dev`.
6. **Cadastre-se pelo próprio site** com o e-mail que será o administrador (o primeiro cadastro é admin).

## Publicar no GitHub Pages

1. Crie o repositório no GitHub e envie o código (branch `main`).
2. _Settings → Pages → Source_: **GitHub Actions**.
3. _Settings → Secrets and variables → Actions → **Variables**_: crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Todo push em `main` roda typecheck, lint, testes, build e publica (`.github/workflows/deploy.yml`).

> A chave `anon` é pública por design e vai no JavaScript do site. **Nunca** use a chave `service_role` aqui.

## Desenvolvimento

```bash
pnpm install
pnpm dev          # servidor local
pnpm check        # tsc + oxlint + vitest
pnpm build        # gera dist/
pnpm oxfmt        # formata
```

Estrutura: `src/lib/` (lógica pura testada: progresso, filtros, Gantt, permissões, CSV), `src/ui/` (telas),
`src/app.ts` (eventos e ações), `src/api.ts` (Supabase), `supabase/schema.sql` (tabelas, RLS, gatilhos).

## Ideias para próximas versões

Histórico de alterações por tarefa · comentários em tempo real (Realtime) · dependências entre tarefas (setas no Gantt) ·
visão Kanban e calendário · arrastar barras do Gantt para mudar datas · anexos de arquivos ·
tarefas recorrentes e modelos · avisos de prazo por e-mail · importação de CSV.
