import { describe, expect, it } from "vitest";
import { hostLabel, normalizeUrl } from "./links";

describe("normalizeUrl", () => {
  it("accepts http and https URLs", () => {
    expect(normalizeUrl("https://exemplo.com/a?b=1")).toBe("https://exemplo.com/a?b=1");
    expect(normalizeUrl("http://exemplo.com")).toBe("http://exemplo.com/");
  });

  it("adds https:// when the scheme is missing", () => {
    expect(normalizeUrl("  exemplo.com/pagina ")).toBe("https://exemplo.com/pagina");
    expect(normalizeUrl("www.exemplo.com")).toBe("https://www.exemplo.com/");
  });

  it("rejects dangerous or malformed input", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(normalizeUrl("ftp://exemplo.com")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("isto nao e um link")).toBeNull();
  });
});

describe("hostLabel", () => {
  it("shows the host without www", () => {
    expect(hostLabel("https://www.exemplo.com/a/b")).toBe("exemplo.com");
    expect(hostLabel("nao-e-url")).toBe("nao-e-url");
  });
});
