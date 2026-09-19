/** Só aceita http(s). Sem esquema, assume https://. Devolve null se não for um link válido. */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) {
    return null;
  }
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (!url.hostname.includes(".")) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Texto curto para um link sem título: o domínio, sem "www.". */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
