# Changelog

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
