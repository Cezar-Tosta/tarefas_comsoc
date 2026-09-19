import { describe, expect, it } from "vitest";
import {
  addDays,
  diffDays,
  formatBR,
  formatDateTimeBR,
  isValidISO,
  monthLabel,
  todayISO,
  weekStart,
} from "./dates";

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("computes day differences (b - a)", () => {
    expect(diffDays("2026-01-01", "2026-01-11")).toBe(10);
    expect(diffDays("2026-01-11", "2026-01-01")).toBe(-10);
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("validates ISO dates strictly", () => {
    expect(isValidISO("2026-02-28")).toBe(true);
    expect(isValidISO("2026-02-30")).toBe(false);
    expect(isValidISO("28/02/2026")).toBe(false);
    expect(isValidISO("")).toBe(false);
  });

  it("formats dates as dd/mm/aaaa", () => {
    expect(formatBR("2026-09-05")).toBe("05/09/2026");
    expect(formatBR(null)).toBe("—");
  });

  it("labels months in Portuguese", () => {
    expect(monthLabel("2026-09-19")).toBe("set/2026");
    expect(monthLabel("2027-01-01")).toBe("jan/2027");
  });

  it("finds the Monday of a week", () => {
    expect(weekStart("2026-09-19")).toBe("2026-09-14"); // sábado
    expect(weekStart("2026-09-14")).toBe("2026-09-14"); // segunda
    expect(weekStart("2026-09-20")).toBe("2026-09-14"); // domingo
  });

  it("uses the local calendar day for today", () => {
    expect(todayISO(new Date(2026, 8, 19, 23, 59))).toBe("2026-09-19");
  });

  it("formats a timestamp in local time", () => {
    const stamp = new Date(2026, 8, 19, 14, 5).toISOString();
    expect(formatDateTimeBR(stamp)).toBe("19/09/2026 14:05");
    expect(formatDateTimeBR("lixo")).toBe("—");
  });

  it("throws on invalid input to arithmetic", () => {
    expect(() => addDays("nope", 1)).toThrow();
  });
});
