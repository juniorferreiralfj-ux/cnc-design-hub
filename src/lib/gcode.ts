import { arcPoint, entityLength, type Entity } from "./dxf";

export type CutParams = {
  thickness: number; // espessura do material (mm)
  passDepth: number; // profundidade por passada (mm)
  feed: number; // avanço de corte (mm/min)
  plungeFeed: number; // avanço de descida (mm/min)
  safeZ: number; // altura de segurança (mm)
  spindle: number; // rotação do disco (RPM)
  overCut: number; // folga abaixo da placa (mm)
  bladeDiameter: number; // diâmetro do disco (mm)
};

export const defaultParams: CutParams = {
  thickness: 20,
  passDepth: 7,
  feed: 1500,
  plungeFeed: 300,
  safeZ: 30,
  spindle: 3000,
  overCut: 2,
  bladeDiameter: 350,
};

const f = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3);

function entityPasses(e: Entity, z: number, p: CutParams, out: string[]) {
  const g1 = (x: number, y: number) => out.push(`G1 X${f(x)} Y${f(y)} F${p.feed}`);

  if (e.type === "line") {
    out.push(`G0 X${f(e.x1)} Y${f(e.y1)}`);
    out.push(`G1 Z${f(z)} F${p.plungeFeed}`);
    g1(e.x2, e.y2);
  } else if (e.type === "circle") {
    out.push(`G0 X${f(e.cx + e.r)} Y${f(e.cy)}`);
    out.push(`G1 Z${f(z)} F${p.plungeFeed}`);
    out.push(`G2 X${f(e.cx - e.r)} Y${f(e.cy)} I${f(-e.r)} J0 F${p.feed}`);
    out.push(`G2 X${f(e.cx + e.r)} Y${f(e.cy)} I${f(e.r)} J0`);
  } else if (e.type === "arc") {
    const s = arcPoint(e.cx, e.cy, e.r, e.start);
    const en = arcPoint(e.cx, e.cy, e.r, e.end);
    out.push(`G0 X${f(s.x)} Y${f(s.y)}`);
    out.push(`G1 Z${f(z)} F${p.plungeFeed}`);
    out.push(
      `G3 X${f(en.x)} Y${f(en.y)} I${f(e.cx - s.x)} J${f(e.cy - s.y)} F${p.feed}`,
    );
  } else {
    const pts = e.closed ? [...e.pts, e.pts[0]] : e.pts;
    out.push(`G0 X${f(pts[0].x)} Y${f(pts[0].y)}`);
    out.push(`G1 Z${f(z)} F${p.plungeFeed}`);
    for (let i = 1; i < pts.length; i++) g1(pts[i].x, pts[i].y);
  }
  out.push(`G0 Z${f(p.safeZ)}`);
}

export function generateGcode(entities: Entity[], p: CutParams, name = "PECA"): string {
  const depth = p.thickness + p.overCut;
  const passes = Math.max(1, Math.ceil(depth / Math.max(0.5, p.passDepth)));
  const out: string[] = [];

  out.push(`(${name} - programa gerado para serra ponte CNC)`);
  out.push(`(Material ${f(p.thickness)}mm | disco ${f(p.bladeDiameter)}mm | ${passes} passadas)`);
  out.push("G21 G90 G17 G40");
  out.push(`M3 S${p.spindle}`);
  out.push("M8 (agua ligada)");
  out.push(`G0 Z${f(p.safeZ)}`);

  for (let i = 0; i < passes; i++) {
    const z = -Math.min(depth, (i + 1) * p.passDepth);
    out.push(`(passada ${i + 1} de ${passes} - Z${f(z)})`);
    for (const e of entities) entityPasses(e, z, p, out);
  }

  out.push("M9 (agua desligada)");
  out.push("M5");
  out.push(`G0 Z${f(p.safeZ)}`);
  out.push("G0 X0 Y0");
  out.push("M30");
  return out.join("\n");
}

export function estimate(entities: Entity[], p: CutParams) {
  const depth = p.thickness + p.overCut;
  const passes = Math.max(1, Math.ceil(depth / Math.max(0.5, p.passDepth)));
  const cutLen = entities.reduce((s, e) => s + entityLength(e), 0) * passes;
  const cutMin = cutLen / Math.max(1, p.feed);
  const plungeMin = (entities.length * passes * (p.safeZ + depth)) / Math.max(1, p.plungeFeed);
  return { passes, cutLen, minutes: cutMin + plungeMin };
}
