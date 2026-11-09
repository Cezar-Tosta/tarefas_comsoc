# Changelog

## 0.3.0 — Painel e Atividades separados

- A aba **Tarefas** virou **Atividades**: uma lista do que precisa ser feito, agrupada por
  prazo, com conclusão em um clique e o filtro "Minhas / Todas". Ela não repete mais os cards
  de projeto do Painel.
- O **Painel** passou a ter a lista de **Arquivados** e o selo de comentários novos.
- O aviso de comentários novos aparece no topo do Painel e das Atividades.
- Troca de senha em "Minha conta" (clique no seu nome no topo).
- Cadastros pendentes ganharam contador na aba Usuários, aviso em todas as abas e
  aprovação em um clique. A lista de usuários se atualiza sozinha.

## 0.2.0 — Gestão de projetos

- Cada tarefa vira um projeto, com escopo e entregáveis, critérios de aceite, orçamento e
  linha de base.
- Página do projeto com Escopo, Indicadores de controle (avanço físico, prazo decorrido,
  SPI, CPI, desvio da linha de base), Cronograma (mini-cronograma das etapas), Orçamento
  (despesas, saldo, valor agregado) e Diário de bordo.
- Diário de bordo imutável, com registros manuais (anotação, avanço, decisão, risco,
  problema, marco) e registros automáticos gerados por gatilhos no banco.
- Saúde do projeto (no rumo, atenção, crítico, concluído) com os motivos, também
  disponível como filtro.
- Nova aba **Painel** com indicadores do portfólio, visualização em cards ou lista,
  ordenação e filtros.
- Gantt: o projeto abre ao clicar no nome e cada linha mostra a saúde.
- Responsividade: menu rolável no celular e ajustes para notebooks e telas largas.
- Migração `supabase/008_project_management.sql`.
- Documentação reescrita (README, `docs/`).

## 0.1.0

- Tarefas e subtarefas, Gantt, filtros, relatórios por pessoa, comentários, links,
  arquivados, perfis com RLS e publicação no GitHub Pages.
