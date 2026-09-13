import { useEffect, useRef } from "react";
import { arcPoint, type DxfDoc } from "@/lib/dxf";

export function DxfCanvas({ doc }: { doc: DxfDoc | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const style = getComputedStyle(canvas);
      const grid = style.getPropertyValue("--canvas-grid").trim() || "#2a2f36";
      const stroke = style.getPropertyValue("--canvas-stroke").trim() || "#f0b429";

      // grade
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (!doc || doc.entities.length === 0) return;

      const { minX, minY, maxX, maxY } = doc.bounds;
      const pad = 24;
      const sw = Math.max(1e-6, maxX - minX);
      const sh = Math.max(1e-6, maxY - minY);
      const scale = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
      const ox = (w - sw * scale) / 2;
      const oy = (h - sh * scale) / 2;
      const px = (x: number) => ox + (x - minX) * scale;
      const py = (y: number) => h - (oy + (y - minY) * scale);

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";

      for (const e of doc.entities) {
        ctx.beginPath();
        if (e.type === "line") {
          ctx.moveTo(px(e.x1), py(e.y1));
          ctx.lineTo(px(e.x2), py(e.y2));
        } else if (e.type === "circle") {
          ctx.arc(px(e.cx), py(e.cy), e.r * scale, 0, Math.PI * 2);
        } else if (e.type === "arc") {
          const steps = 48;
          let sweep = e.end - e.start;
          while (sweep < 0) sweep += 360;
          for (let i = 0; i <= steps; i++) {
            const p = arcPoint(e.cx, e.cy, e.r, e.start + (sweep * i) / steps);
            if (i === 0) ctx.moveTo(px(p.x), py(p.y));
            else ctx.lineTo(px(p.x), py(p.y));
          }
        } else {
          e.pts.forEach((p, i) => {
            if (i === 0) ctx.moveTo(px(p.x), py(p.y));
            else ctx.lineTo(px(p.x), py(p.y));
          });
          if (e.closed) ctx.closePath();
        }
        ctx.stroke();
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [doc]);

  return <canvas ref={ref} className="canvas-surface h-full w-full rounded-lg" />;
}
