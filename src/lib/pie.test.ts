import { describe, expect, it } from "vitest";
import { percentOf, pieShapes } from "./pie";

describe("pieShapes", () => {
  it("returns no shapes for empty slices", () => {
    expect(pieShapes([0, 0], 10).map((s) => s.kind)).toEqual(["none", "none"]);
  });

  it("draws a full circle when one slice holds everything", () => {
    expect(pieShapes([0, 4, 0], 10).map((s) => s.kind)).toEqual(["none", "circle", "none"]);
  });

  it("splits into arcs and flags the large arc", () => {
    const [big, small] = pieShapes([3, 1], 10);
    expect(big?.kind).toBe("path");
    expect(big?.d).toContain(" 0 1 1 "); // 270°: arco grande
    expect(small?.d).toContain(" 0 0 1 "); // 90°
  });
});

describe("percentOf", () => {
  it("rounds and guards against a zero total", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBe(0);
  });
});
