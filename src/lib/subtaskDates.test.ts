import { describe, expect, it } from "vitest";
import type { Subtask } from "../types";
import { resolveSubtaskDates, wouldCreateCycle } from "./subtaskDates";

function sub(id: string, patch: Partial<Subtask> = {}): Subtask {
  return {
    id,
    task_id: "t",
    title: id,
    done: false,
    start_date: null,
    end_date: null,
    assignee_id: null,
    position: 0,
    ...patch,
  };
}

describe("resolveSubtaskDates", () => {
  it("keeps the own dates when not linked", () => {
    const a = sub("a", { start_date: "2026-09-01", end_date: "2026-09-05" });
    expect(resolveSubtaskDates(a, [a])).toEqual({ start: "2026-09-01", end: "2026-09-05" });
  });

  it("starts the day after the predecessor ends", () => {
    const a = sub("a", { start_date: "2026-09-01", end_date: "2026-09-05" });
    const b = sub("b", { start_after_id: "a", start_date: "2026-08-01", end_date: "2026-09-12" });
    expect(resolveSubtaskDates(b, [a, b])).toEqual({ start: "2026-09-06", end: "2026-09-12" });
  });

  it("follows a chain and moves when the predecessor moves", () => {
    const a = sub("a", { end_date: "2026-09-05" });
    const b = sub("b", { start_after_id: "a", end_date: "2026-09-10" });
    const c = sub("c", { start_after_id: "b", end_date: "2026-09-20" });
    expect(resolveSubtaskDates(c, [a, b, c]).start).toBe("2026-09-11");
    const moved = sub("a", { end_date: "2026-09-08" });
    expect(resolveSubtaskDates(c, [moved, b, c]).start).toBe("2026-09-11"); // b termina igual
    expect(resolveSubtaskDates(b, [moved, b, c]).start).toBe("2026-09-09");
  });

  it("uses the predecessor's start when it has no end, and an unset link when it has no dates", () => {
    const a = sub("a", { start_date: "2026-09-01" });
    const b = sub("b", { start_after_id: "a", end_date: "2026-09-10" });
    expect(resolveSubtaskDates(b, [a, b]).start).toBe("2026-09-02");
    const empty = sub("e");
    const c = sub("c", { start_after_id: "e", start_date: "2026-09-03" });
    expect(resolveSubtaskDates(c, [empty, c]).start).toBe("2026-09-03");
  });

  it("never ends before it starts", () => {
    const a = sub("a", { end_date: "2026-09-10" });
    const b = sub("b", { start_after_id: "a", end_date: "2026-09-05" });
    expect(resolveSubtaskDates(b, [a, b])).toEqual({ start: "2026-09-11", end: "2026-09-11" });
  });

  it("survives a cycle", () => {
    const a = sub("a", { start_after_id: "b", end_date: "2026-09-05" });
    const b = sub("b", { start_after_id: "a", end_date: "2026-09-10" });
    expect(() => resolveSubtaskDates(a, [a, b])).not.toThrow();
  });
});

describe("wouldCreateCycle", () => {
  const a = sub("a");
  const b = sub("b", { start_after_id: "a" });
  const c = sub("c", { start_after_id: "b" });

  it("detects direct and indirect cycles", () => {
    expect(wouldCreateCycle([a, b, c], "a", "b")).toBe(true);
    expect(wouldCreateCycle([a, b, c], "a", "c")).toBe(true);
    expect(wouldCreateCycle([a, b, c], "a", "a")).toBe(true);
  });

  it("allows valid links", () => {
    expect(wouldCreateCycle([a, b, c], "c", "a")).toBe(false);
    expect(wouldCreateCycle([a, b, c], "b", "c")).toBe(true);
    expect(wouldCreateCycle([a, sub("d")], "d", "a")).toBe(false);
  });
});
