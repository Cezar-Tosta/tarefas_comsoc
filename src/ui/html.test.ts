import { describe, expect, it } from "vitest";
import { esc, html, raw } from "./html";

const li = (n: number) => html`<li>${n}</li>`;

describe("html", () => {
  it("escapes interpolated values", () => {
    const out = html`<p>${'<img src=x onerror="alert(1)">'}</p>`;
    expect(out.value).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
  });

  it("does not re-escape nested html and joins arrays", () => {
    const list = [1, 2].map(li);
    expect(html`<ul>${list}</ul>`.value).toBe("<ul><li>1</li><li>2</li></ul>");
  });

  it("drops null, undefined and false but keeps 0", () => {
    expect(html`${null}${undefined}${false}${0}`.value).toBe("0");
  });

  it("supports raw passthrough and esc()", () => {
    expect(html`${raw("<b>x</b>")}`.value).toBe("<b>x</b>");
    expect(esc(`a&b'"<>`)).toBe("a&amp;b&#39;&quot;&lt;&gt;");
  });
});
