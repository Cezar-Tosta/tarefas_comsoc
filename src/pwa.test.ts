import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

/** Largura e altura lidas do cabeçalho IHDR de um PNG. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
  name: string;
  short_name: string;
  display: string;
  icons: Icon[];
};

describe("manifest do aplicativo", () => {
  it("tem nome, modo standalone e ícones any + maskable", () => {
    expect(manifest.name).toBe("Tarefas COMSOC");
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    const purposes = manifest.icons.map((icon) => icon.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
  });

  it("cada ícone existe e tem o tamanho declarado", () => {
    for (const icon of manifest.icons) {
      const path = `public/${icon.src}`;
      expect(existsSync(path), path).toBe(true);
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(path), path).toEqual({ width: w, height: h });
    }
  });
});

describe("index.html", () => {
  const page = readFileSync("index.html", "utf8");

  it("liga favicon, ícone do iPhone e manifesto a arquivos que existem", () => {
    for (const file of [
      "favicon.ico",
      "favicon-32.png",
      "apple-touch-icon.png",
      "manifest.webmanifest",
    ]) {
      expect(page, file).toContain(`/${file}`);
      expect(existsSync(`public/${file}`), file).toBe(true);
    }
    expect(pngSize("public/apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
  });

  it("define a cor do tema", () => {
    expect(page).toContain('name="theme-color"');
  });
});
