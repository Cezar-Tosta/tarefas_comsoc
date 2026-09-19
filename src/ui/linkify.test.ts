import { describe, expect, it } from "vitest";
import { linkify } from "./linkify";

describe("linkify", () => {
  it("turns http(s) URLs into safe anchors", () => {
    const out = linkify("veja https://exemplo.com/x agora").value;
    expect(out).toBe(
      'veja <a href="https://exemplo.com/x" target="_blank" rel="noopener noreferrer">https://exemplo.com/x</a> agora',
    );
  });

  it("keeps trailing punctuation outside the link", () => {
    const out = linkify("Acesse https://exemplo.com/x, ok?").value;
    expect(out).toContain('href="https://exemplo.com/x"');
    expect(out).toContain("</a>, ok?");
  });

  it("escapes everything else, including HTML and javascript: URLs", () => {
    expect(linkify('<img src=x onerror="alert(1)">').value).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(linkify("javascript:alert(1)").value).toBe("javascript:alert(1)");
    expect(linkify('https://a.com/"onmouseover="x').value).not.toContain('onmouseover="x"');
  });

  it("returns plain escaped text when there is no URL", () => {
    expect(linkify("a & b").value).toBe("a &amp; b");
  });
});
