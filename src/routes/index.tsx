import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { DxfCanvas } from "@/components/DxfCanvas";
import { parseDxf, totalLength, type DxfDoc } from "@/lib/dxf";
import { defaultParams, estimate, generateGcode, type CutParams } from "@/lib/gcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SerraCAM — CAM de DXF para serra ponte CNC" },
      {
        name: "description",
        content:
          "Abra o desenho DXF da peça, defina material, disco e passadas e gere o programa de corte pronto para a serra ponte CNC.",
      },
      { property: "og:title", content: "SerraCAM — CAM de DXF para serra ponte CNC" },
      {
        property: "og:description",
        content:
          "Do DXF ao programa de corte: visualize a peça, calcule passadas e tempo e baixe o código da serra ponte.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Tab = "desenho" | "ajustes" | "programa";

const fields: { key: keyof CutParams; label: string; unit: string; step?: number }[] = [
  { key: "thickness", label: "Espessura da chapa", unit: "mm" },
  { key: "passDepth", label: "Profundidade por passada", unit: "mm", step: 0.5 },
  { key: "overCut", label: "Folga abaixo da chapa", unit: "mm", step: 0.5 },
  { key: "feed", label: "Avanço de corte", unit: "mm/min", step: 50 },
  { key: "plungeFeed", label: "Avanço de descida", unit: "mm/min", step: 25 },
  { key: "safeZ", label: "Altura de segurança", unit: "mm" },
  { key: "spindle", label: "Rotação do disco", unit: "RPM", step: 100 },
  { key: "bladeDiameter", label: "Diâmetro do disco", unit: "mm", step: 10 },
];

function Index() {
  const [doc, setDoc] = useState<DxfDoc | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [erro, setErro] = useState<string>("");
  const [params, setParams] = useState<CutParams>(defaultParams);
  const [tab, setTab] = useState<Tab>("desenho");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const peca = fileName.replace(/\.dxf$/i, "").toUpperCase() || "PECA";

  const stats = useMemo(() => {
    if (!doc) return null;
    const { minX, minY, maxX, maxY } = doc.bounds;
    return {
      largura: maxX - minX,
      altura: maxY - minY,
      perimetro: totalLength(doc.entities),
      ...estimate(doc.entities, params),
    };
  }, [doc, params]);

  const gcode = useMemo(
    () => (doc ? generateGcode(doc.entities, params, peca) : ""),
    [doc, params, peca],
  );

  async function carregar(file: File) {
    setErro("");
    try {
      const text = await file.text();
      const parsed = parseDxf(text);
      if (parsed.entities.length === 0) {
        setErro("Não encontrei linhas ou arcos nesse arquivo. Salve o desenho como DXF (ASCII).");
        return;
      }
      setDoc(parsed);
      setFileName(file.name);
      setTab("desenho");
    } catch {
      setErro("Não consegui ler esse arquivo. Tente salvar novamente como DXF.");
    }
  }

  function baixar() {
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${peca}.nc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/60 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold md:text-xl">
              Serra<span className="text-primary">CAM</span>
            </h1>
            <p className="label-tech">DXF → programa de corte · serra ponte</p>
          </div>
          <Button size="sm" onClick={() => inputRef.current?.click()}>
            Abrir DXF
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".dxf,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void carregar(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 md:px-8 md:py-8">
        {erro && (
          <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/15 px-3 py-2 text-sm text-destructive-foreground">
            {erro}
          </p>
        )}

        {!doc && (
          <section className="panel flex flex-col items-center gap-4 px-6 py-14 text-center">
            <h2 className="text-xl font-bold">Comece pelo desenho da peça</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Escolha o arquivo DXF da bancada, do tampo ou da soleira. Você vê a peça na tela,
              ajusta material e disco, e o programa de corte sai pronto para levar até a máquina.
            </p>
            <Button onClick={() => inputRef.current?.click()}>Escolher arquivo DXF</Button>
          </section>
        )}

        {doc && (
          <>
            <nav className="mb-4 flex gap-2 md:hidden">
              {(["desenho", "ajustes", "programa"] as Tab[]).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tab === t ? "default" : "secondary"}
                  className="flex-1 capitalize"
                  onClick={() => setTab(t)}
                >
                  {t}
                </Button>
              ))}
            </nav>

            <div className="grid gap-4 md:grid-cols-[1fr_320px]">
              <section
                className={`${tab === "desenho" ? "block" : "hidden"} md:block space-y-4`}
              >
                <div className="panel p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="label-tech">{fileName}</span>
                    <span className="label-tech">
                      {doc.entities.length} elementos · {doc.layers.length} camadas
                    </span>
                  </div>
                  <div className="h-[46vh] md:h-[58vh]">
                    <DxfCanvas doc={doc} />
                  </div>
                </div>

                {stats && (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Stat label="Largura" value={`${stats.largura.toFixed(1)} mm`} />
                    <Stat label="Altura" value={`${stats.altura.toFixed(1)} mm`} />
                    <Stat label="Corte total" value={`${(stats.perimetro / 1000).toFixed(2)} m`} />
                    <Stat
                      label="Tempo estimado"
                      value={`${Math.max(1, Math.round(stats.minutes))} min`}
                    />
                  </div>
                )}
              </section>

              <aside className={`${tab === "ajustes" ? "block" : "hidden"} md:block`}>
                <div className="panel space-y-3 p-4">
                  <h2 className="text-sm font-bold">Ajustes de corte</h2>
                  {fields.map((f) => (
                    <label key={f.key} className="block">
                      <span className="label-tech">
                        {f.label} ({f.unit})
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step={f.step ?? 1}
                        value={params[f.key]}
                        onChange={(e) =>
                          setParams((p) => ({ ...p, [f.key]: Number(e.target.value) }))
                        }
                        className="mt-1 font-mono"
                      />
                    </label>
                  ))}
                  {stats && (
                    <p className="rounded-md bg-muted px-3 py-2 text-sm">
                      <span className="font-mono text-primary">{stats.passes}</span> passadas para
                      cortar {params.thickness} mm.
                    </p>
                  )}
                </div>
              </aside>

              <section
                className={`${tab === "programa" ? "block" : "hidden"} md:col-span-2 md:block`}
              >
                <div className="panel p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold">Programa de corte</h2>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void navigator.clipboard?.writeText(gcode)}
                      >
                        Copiar
                      </Button>
                      <Button size="sm" onClick={baixar}>
                        Baixar .nc
                      </Button>
                    </div>
                  </div>
                  <pre className="max-h-[45vh] overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
                    {gcode}
                  </pre>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Confira o programa em vazio na máquina antes do primeiro corte. Medidas em
                    milímetros, zero da peça no canto do desenho.
                  </p>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-3 py-2">
      <div className="label-tech">{label}</div>
      <div className="font-mono text-base font-bold text-primary">{value}</div>
    </div>
  );
}
