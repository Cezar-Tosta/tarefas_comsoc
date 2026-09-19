// Template tag que escapa tudo por padrão. Só `raw()` e resultados de outro `html` passam sem escape.

export class Safe {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
}

export function raw(value: string): Safe {
  return new Safe(value);
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false || value === true) {
    return "";
  }
  if (value instanceof Safe) {
    return value.value;
  }
  if (Array.isArray(value)) {
    let out = "";
    for (const item of value) {
      out += render(item);
    }
    return out;
  }
  return esc(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = "";
  for (const [index, chunk] of strings.entries()) {
    out += chunk;
    if (index < values.length) {
      out += render(values[index]);
    }
  }
  return new Safe(out);
}

export function mount(el: Element, content: Safe): void {
  el.innerHTML = content.value;
}
