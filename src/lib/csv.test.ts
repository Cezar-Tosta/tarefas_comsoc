import { describe, expect, it } from "vitest";
import type { Profile, Task } from "../types";
import { csvCell, tasksToCsv } from "./csv";

describe("csvCell", () => {
  it("quotes fields containing separators, quotes or newlines", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell("linha1\nlinha2")).toBe('"linha1\nlinha2"');
    expect(csvCell("simples")).toBe("simples");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=SOMA(A1)")).toBe("'=SOMA(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});

describe("tasksToCsv", () => {
  const people: Profile[] = [{ id: "u1", email: "ana@x", name: "Ana", role: "user" }];
  const tasks: Task[] = [
    {
      id: "t1",
      title: "Relatório",
      description: "",
      status: "doing",
      priority: "high",
      start_date: "2026-09-01",
      end_date: "2026-09-10",
      assignee_id: "u1",
      links: [],
      comment_count: 0,
      subtasks: [
        {
          id: "s1",
          task_id: "t1",
          title: "Coletar dados",
          done: true,
          start_date: null,
          end_date: null,
          assignee_id: null,
          position: 0,
        },
        {
          id: "s2",
          task_id: "t1",
          title: "Escrever",
          done: false,
          start_date: null,
          end_date: null,
          assignee_id: null,
          position: 1,
        },
      ],
    },
  ];

  it("emits a header, one row per task and one per subtask", () => {
    const lines = tasksToCsv(tasks, people).split("\r\n");
    expect(lines[0]).toBe(
      "Tipo;Título;Tarefa;Status;Prioridade;Responsável;Início;Fim;Progresso (%)",
    );
    expect(lines[1]).toBe("Tarefa;Relatório;;Em andamento;Alta;Ana;01/09/2026;10/09/2026;50");
    expect(lines[2]).toBe("Subtarefa;Coletar dados;Relatório;Concluída;;;—;—;100");
    expect(lines[3]).toBe("Subtarefa;Escrever;Relatório;A fazer;;;—;—;0");
  });
});
