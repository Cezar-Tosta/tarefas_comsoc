// Datas são strings "AAAA-MM-DD". A aritmética usa UTC para não sofrer com horário de verão.

const MS_DAY = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function parse(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) {
    throw new Error(`Data inválida: "${iso}"`);
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidISO(value: string): boolean {
  if (!ISO.test(value)) {
    return false;
  }
  return format(parse(value)) === value;
}

export function addDays(iso: string, days: number): string {
  return format(parse(iso) + days * MS_DAY);
}

/** Dias entre `a` e `b` (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / MS_DAY);
}

export function todayISO(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatBR(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Data e hora locais de um timestamp ISO (ex.: do banco): "19/09/2026 14:05". */
export function formatDateTimeBR(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function monthShort(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
}

export function monthLabel(iso: string): string {
  return `${monthShort(iso)}/${iso.slice(0, 4)}`;
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Segunda-feira da semana que contém `iso`. */
export function weekStart(iso: string): string {
  const dow = new Date(parse(iso)).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}

export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return format(Date.UTC(y, m, 0));
}
