# Gestão de projetos: escopo, cronograma, orçamento e controle

Cada tarefa do sistema é tratada como um **projeto**. Este documento explica os campos e
como cada indicador é calculado. O cálculo fica em `src/lib/control.ts` e os testes em
`src/lib/control.test.ts`.

## 1. Escopo

| Campo | Uso |
| --- | --- |
| Descrição | Contexto geral |
| Escopo e entregáveis | Objetivo, o que será entregue e o que **fica de fora** |
| Critérios de aceite | Como saber que o projeto terminou bem |
| Links | Documentos, planilhas, pastas |

Toda alteração no escopo é registrada automaticamente no diário de bordo.

## 2. Cronograma

- **Período planejado:** início e fim do projeto.
- **Etapas:** são as subtarefas, com datas próprias ou herdadas. Uma etapa pode começar no dia
  seguinte ao fim de outra e acompanhar as mudanças dela.
- **Linha de base:** são as datas originais. O banco grava a linha de base na primeira vez em que as datas
  são definidas, pelo gatilho `tasks_set_baseline`. Depois disso, mudar o prazo **não** altera a
  linha de base. Só o administrador pode redefini-la, e de forma explícita.
- **Desvio:** `prazo final atual − prazo final da linha de base`, em dias.

## 3. Orçamento

| Indicador | Fórmula |
| --- | --- |
| Previsto (BAC) | valor informado no projeto |
| Realizado (AC) | soma das despesas lançadas |
| Saldo | previsto − realizado |
| % consumido | realizado ÷ previsto |
| Valor agregado (EV) | previsto × avanço físico |

## 4. Indicadores de controle

| Indicador | Fórmula | Leitura |
| --- | --- | --- |
| Avanço físico | etapas concluídas ÷ etapas | 0 a 100% |
| Prazo decorrido | dias passados ÷ duração planejada | 0 a 100% |
| **SPI** (desempenho de prazo) | avanço físico ÷ prazo decorrido | 1 = no planejado; < 1 = atrasado |
| **CPI** (desempenho de custo) | valor agregado ÷ realizado | 1 = no planejado; < 1 = gastando mais do que entrega |

O SPI e o CPI só são calculados quando o projeto tem **etapas**. Sem elas, o avanço físico só
pode valer 0% ou 100%, e os índices não teriam significado.

## 5. Saúde do projeto

| Saúde | Quando |
| --- | --- |
| 🔴 **Crítico** | prazo final vencido · orçamento estourado (> 100%) · SPI < 0,70 (depois de 20% do prazo) |
| 🟡 **Atenção** | SPI < 0,90 · orçamento ≥ 90% · CPI < 0,90 · projeto bloqueado · prazo adiado em relação à linha de base |
| 🟢 **No rumo** | nenhum dos alertas acima |
| ⚪ **Concluído** | todas as etapas concluídas, ou o status "concluída" |

O ritmo só é avaliado depois de 20% do prazo, porque no início o índice oscila demais.
A página do projeto mostra **os motivos** de cada alerta. O painel e o Gantt usam a mesma
saúde, que também pode ser usada como filtro.

## 6. Diário de bordo

O diário é a **memória** do projeto. Os registros só podem ser acrescentados (`task_journal`).

- **Registros manuais:** anotação, avanço, decisão, risco, problema e marco. Podem ser feitos
  por administradores e por usuários ligados ao projeto.
- **Registros automáticos:** gerados por gatilhos no Postgres para criação, status, datas,
  responsável, orçamento, escopo, linha de base, etapas adicionadas, concluídas, reabertas ou
  removidas, despesas lançadas ou removidas, e conclusão ou reabertura do projeto.
- **Imutável:** não existe `update`. Só o administrador apaga registros manuais. Os automáticos
  não podem ser apagados.

A linha do tempo agrupa os registros por dia e permite filtrar por tipo.
