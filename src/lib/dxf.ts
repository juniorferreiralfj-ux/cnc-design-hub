// Leitor simples de DXF (ASCII) — extrai as entidades geométricas usadas no corte.

export type Entity =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; layer: string }
  | {
      type: "arc";
      cx: number;
      cy: number;
      r: number;
      start: number;
      end: number;
      layer: string;
    }
  | { type: "circle"; cx: number; cy: number; r: number; layer: string }
  | { type: "polyline"; pts: { x: number; y: number }[]; closed: boolean; layer: string };

export type DxfDoc = {
  entities: Entity[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: string[];
};

type Pair = { code: number; value: string };

function tokenize(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: lines[i + 1] ?? "" });
  }
  return pairs;
}

const num = (v: string | undefined, d = 0) => {
  const n = parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) ? n : d;
};

export function parseDxf(text: string): DxfDoc {
  const pairs = tokenize(text);
  const entities: Entity[] = [];

  // Isola a seção ENTITIES quando existir
  let start = 0;
  let end = pairs.length;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 2 && pairs[i].value.trim() === "ENTITIES") start = i + 1;
    if (start && pairs[i].code === 0 && pairs[i].value.trim() === "ENDSEC" && i > start) {
      end = i;
      break;
    }
  }

  // Agrupa por entidade (code 0)
  const groups: Pair[][] = [];
  let current: Pair[] | null = null;
  for (let i = start; i < end; i++) {
    const p = pairs[i];
    if (p.code === 0) {
      if (current) groups.push(current);
      current = [p];
    } else if (current) {
      current.push(p);
    }
  }
  if (current) groups.push(current);

  const get = (g: Pair[], code: number) => g.find((p) => p.code === code)?.value;
  const all = (g: Pair[], code: number) => g.filter((p) => p.code === code).map((p) => p.value);

  let pendingPolyline: { closed: boolean; layer: string; pts: { x: number; y: number }[] } | null =
    null;

  for (const g of groups) {
    const type = g[0].value.trim().toUpperCase();
    const layer = (get(g, 8) ?? "0").trim();

    switch (type) {
      case "LINE":
        entities.push({
          type: "line",
          x1: num(get(g, 10)),
          y1: num(get(g, 20)),
          x2: num(get(g, 11)),
          y2: num(get(g, 21)),
          layer,
        });
        break;
      case "CIRCLE":
        entities.push({
          type: "circle",
          cx: num(get(g, 10)),
          cy: num(get(g, 20)),
          r: num(get(g, 40)),
          layer,
        });
        break;
      case "ARC":
        entities.push({
          type: "arc",
          cx: num(get(g, 10)),
          cy: num(get(g, 20)),
          r: num(get(g, 40)),
          start: num(get(g, 50)),
          end: num(get(g, 51)),
          layer,
        });
        break;
      case "LWPOLYLINE": {
        const xs = all(g, 10).map((v) => num(v));
        const ys = all(g, 20).map((v) => num(v));
        const pts = xs.map((x, i) => ({ x, y: ys[i] ?? 0 }));
        const flag = num(get(g, 70));
        if (pts.length > 1) {
          entities.push({ type: "polyline", pts, closed: (flag & 1) === 1, layer });
        }
        break;
      }
      case "POLYLINE":
        pendingPolyline = { closed: (num(get(g, 70)) & 1) === 1, layer, pts: [] };
        break;
      case "VERTEX":
        if (pendingPolyline) {
          pendingPolyline.pts.push({ x: num(get(g, 10)), y: num(get(g, 20)) });
        }
        break;
      case "SEQEND":
        if (pendingPolyline && pendingPolyline.pts.length > 1) {
          entities.push({ type: "polyline", ...pendingPolyline });
        }
        pendingPolyline = null;
        break;
      default:
        break;
    }
  }

  return { entities, bounds: getBounds(entities), layers: [...new Set(entities.map((e) => e.layer))] };
}

export function getBounds(entities: Entity[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const put = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const e of entities) {
    if (e.type === "line") {
      put(e.x1, e.y1);
      put(e.x2, e.y2);
    } else if (e.type === "circle" || e.type === "arc") {
      put(e.cx - e.r, e.cy - e.r);
      put(e.cx + e.r, e.cy + e.r);
    } else {
      for (const p of e.pts) put(p.x, p.y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

const d2r = (d: number) => (d * Math.PI) / 180;

export function entityLength(e: Entity): number {
  if (e.type === "line") return Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
  if (e.type === "circle") return 2 * Math.PI * e.r;
  if (e.type === "arc") {
    let sweep = e.end - e.start;
    while (sweep < 0) sweep += 360;
    return d2r(sweep) * e.r;
  }
  let len = 0;
  for (let i = 1; i < e.pts.length; i++) {
    len += Math.hypot(e.pts[i].x - e.pts[i - 1].x, e.pts[i].y - e.pts[i - 1].y);
  }
  if (e.closed && e.pts.length > 2) {
    const a = e.pts[e.pts.length - 1];
    const b = e.pts[0];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

export function totalLength(entities: Entity[]) {
  return entities.reduce((s, e) => s + entityLength(e), 0);
}

export function arcPoint(cx: number, cy: number, r: number, deg: number) {
  return { x: cx + r * Math.cos(d2r(deg)), y: cy + r * Math.sin(d2r(deg)) };
}
