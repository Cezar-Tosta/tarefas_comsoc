export interface PieShape {
  /** "circle" quando uma única fatia ocupa tudo; "path" para uma fatia comum; "none" se vazia. */
  kind: "none" | "circle" | "path";
  d: string;
}

/** Geometria (SVG, centro em 0,0) das fatias de um gráfico de pizza, na ordem dos valores. */
export function pieShapes(values: number[], radius: number): PieShape[] {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  const shapes: PieShape[] = [];
  let angle = -Math.PI / 2; // começa no topo
  for (const value of values) {
    if (value <= 0 || total <= 0) {
      shapes.push({ kind: "none", d: "" });
      continue;
    }
    if (value === total) {
      shapes.push({ kind: "circle", d: "" });
      continue;
    }
    const sweep = (value / total) * Math.PI * 2;
    const end = angle + sweep;
    const x1 = radius * Math.cos(angle);
    const y1 = radius * Math.sin(angle);
    const x2 = radius * Math.cos(end);
    const y2 = radius * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    shapes.push({
      kind: "path",
      d: `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
    });
    angle = end;
  }
  return shapes;
}

export function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}
