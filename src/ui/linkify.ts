import { esc, Safe } from "./html";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}]+$/;

/** Escapa o texto e transforma URLs http(s) em links seguros (abrem em nova aba). */
export function linkify(text: string): Safe {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    let url = match[0];
    const tail = TRAILING.exec(url)?.[0] ?? "";
    url = url.slice(0, url.length - tail.length);
    out += esc(text.slice(last, start));
    out += `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
    out += esc(tail);
    last = start + match[0].length;
  }
  out += esc(text.slice(last));
  return new Safe(out);
}
