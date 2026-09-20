"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChartNoAxesCombined,
  Layers,
  SlidersHorizontal,
  Plus,
  Eye,
  EyeOff,
  X,
  RotateCcw,
  Download,
  Save,
  FolderOpen,
  Search,
  Hand,
  Crosshair,
  Braces,
  MapPin,
  BookOpen,
  Undo2,
  ScanLine,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CaseNotes } from "./case-documentation";
import type { CaseDocumentation } from "@/lib/study-collection";
import { RepositoryBrowser } from "./repositories";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Range, Choice, downloadBlob } from "./controls";
import {
  type Spectrum,
  type Peak,
  type Integral,
  COLORS,
  correctedY,
  extent,
  integrate,
  pickPeaks,
  nearestPeak,
  baselineEstimate,
  plotPoints,
} from "@/lib/nmr/spectrum";
import {
  importSpectraFiles,
  importSpectraSession,
} from "@/lib/nmr/import-client";
const SAMPLE_SOURCE = "Damien Jeannerat (2021) · Zenodo 4616665 · CC BY 4.0";
const TOOLS = [
  { id: "zoom", label: "Zoom region", Icon: Search },
  { id: "pan", label: "Pan spectrum", Icon: Hand },
  { id: "peak", label: "Pick peak", Icon: Crosshair },
  { id: "integral", label: "Integrate region", Icon: Braces },
  { id: "reference", label: "Reference peak", Icon: MapPin },
];
const cleanName = (name: string) =>
  name.replace(/\.(jdx|dx|jcamp|csv|tsv|txt)$/i, "");
export default function SpectraWorkspace({
  panel,
  onClosePanel,
  active,
  importTick,
}: {
  panel: string;
  onClosePanel: () => void;
  active: boolean;
  importTick: number;
}) {
  const [documentation, setDocumentation] = useState<CaseDocumentation | null>(
    null,
  );
  const [notesOpen, setNotesOpen] = useState(false);
  const [spectra, setSpectra] = useState<Spectrum[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [importOpen, setImportOpen] = useState(false),
    [layout, setLayout] = useState("stacked"),
    [tool, setTool] = useState("zoom"),
    [domain, setDomain] = useState<[number, number]>([-0.5, 10]),
    [normalized, setNormalized] = useState(true),
    [grid, setGrid] = useState(true),
    [threshold, setThreshold] = useState(8),
    [peaks, setPeaks] = useState<Peak[]>([]),
    [integrals, setIntegrals] = useState<Integral[]>([]),
    [selection, setSelection] = useState<[number, number] | null>(null),
    [hover, setHover] = useState<number | null>(null),
    [refPeak, setRefPeak] = useState<number | null>(null),
    [refTarget, setRefTarget] = useState(0),
    [referenceIntegral, setReferenceIntegral] = useState(""),
    [integralUnits, setIntegralUnits] = useState(1),
    [lesson, setLesson] = useState(true),
    [size, setSize] = useState({ w: 900, h: 600 });
  const holder = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    sessionInput = useRef<HTMLInputElement>(null),
    initialized = useRef(false),
    busyRef = useRef(false),
    previousImport = useRef(importTick),
    drag = useRef<{ x: number; domain: [number, number]; tool: string } | null>(
      null,
    ),
    pointers = useRef(new Map<number, number>()),
    pinch = useRef<{ distance: number; domain: [number, number] } | null>(null);
  const current = spectra.find((s) => s.id === selected),
    visible = spectra.filter((s) => s.visible),
    stats = useMemo(
      () => new Map(spectra.map((s) => [s.id, extent(s)])),
      [spectra],
    );
  const w = size.w,
    h =
      layout === "stacked"
        ? Math.max(size.h, visible.length * 140 + 96)
        : size.h,
    left = 56,
    right = 24,
    top = 44,
    bottom = 52,
    pw = Math.max(1, w - left - right),
    ph = Math.max(1, h - top - bottom),
    span = domain[1] - domain[0],
    xp = (v: number) => left + ((domain[1] - v) / span) * pw;
  const globalMax = Math.max(
      1e-12,
      ...visible.map((s) => stats.get(s.id)!.max),
    ),
    globalMin = Math.min(0, ...visible.map((s) => stats.get(s.id)!.min));
  const reference = integrals.find((i) => i.id === referenceIntegral);
  function clampDomain(d: [number, number]): [number, number] {
    const lo = Math.min(...spectra.map((s) => s.x[0] + s.shift)),
      hi = Math.max(...spectra.map((s) => s.x.at(-1)! + s.shift));
    if (!Number.isFinite(lo)) return d;
    const width = Math.max(0.001, Math.min(hi - lo, d[1] - d[0]));
    const a = Math.max(lo, Math.min(hi - width, d[0]));
    return [a, a + width];
  }
  function reset() {
    if (spectra.length)
      setDomain([
        Math.min(...spectra.map((s) => s.x[0] + s.shift)),
        Math.max(...spectra.map((s) => s.x.at(-1)! + s.shift)),
      ]);
    setSelection(null);
  }
  async function execute(message: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(message);
    setError("");
    try {
      await action();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      toast.error(m);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  async function loadSamples() {
    await execute("Reading experimental spectra…", async () => {
      const items = await Promise.all(
        [
          ["Menthol.jdx", "Menthol"],
          ["geraniol_Fig.5.jdx", "Geraniol"],
        ].map(async ([file, name]) => {
          const r = await fetch("/data/" + file);
          if (!r.ok)
            throw new Error(
              "Sample spectrum could not be loaded. You can import a local JCAMP file.",
            );
          return { file: await r.blob(), name, source: SAMPLE_SOURCE };
        }),
      );
      const all = (await importSpectraFiles(items)).map((s, i) => ({
        ...s,
        color: COLORS[i % COLORS.length],
      }));
      setSpectra(all);
      setSelected(all[0].id);
      setPeaks([]);
      setIntegrals([]);
      setReferenceIntegral("");
      setDomain([-0.2, 8]);
    });
  }
  useEffect(() => {
    setRefPeak(null);
  }, [selected]);
  useEffect(() => {
    if (active && !initialized.current) {
      initialized.current = true;
      loadSamples();
    }
  }, [active]);
  useEffect(() => {
    if (importTick !== previousImport.current) {
      previousImport.current = importTick;
      if (active && importTick) setImportOpen(true);
    }
  }, [importTick, active]);
  useEffect(() => {
    if (!holder.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active) return;
    function keys(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement)?.closest(
          "input,textarea,[role=dialog],[role=combobox]",
        ) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (e.key === "Escape") {
        drag.current = null;
        setSelection(null);
        setTool("zoom");
      }
      if (e.key === "r") reset();
      const map: Record<string, string> = {
        z: "zoom",
        p: "pan",
        k: "peak",
        i: "integral",
        f: "reference",
      };
      if (map[e.key]) setTool(map[e.key]);
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [active, spectra]);
  function update(id: string, patch: Partial<Spectrum>) {
    setSpectra((s) => s.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    if (patch.shift !== undefined || patch.baseline) {
      setPeaks((p) => p.filter((v) => v.spectrumId !== id));
      setIntegrals((p) => p.filter((v) => v.spectrumId !== id));
      setReferenceIntegral("");
    }
  }
  async function importSpectra(
    list: File[],
    source = "Local file",
    replace = false,
  ) {
    if (!list.length) return;
    setImportOpen(false);
    await execute("Parsing local spectra…", async () => {
      if (list.reduce((s, f) => s + f.size, 0) > 60 * 1024 * 1024)
        throw new Error("Import up to 60 MB of spectra at a time.");
      const parsed = await importSpectraFiles(
        list.map((file) => ({ file, name: cleanName(file.name), source })),
      );
      const existing =
        replace || spectra.every((s) => s.source === SAMPLE_SOURCE)
          ? []
          : spectra;
      if (existing.length + parsed.length > 24)
        throw new Error("A session supports up to 24 spectra.");
      if (
        [...existing, ...parsed].reduce((n, s) => n + s.x.length, 0) > 5000000
      )
        throw new Error("A session supports up to 5 million points.");
      const merged = [
        ...existing,
        ...parsed.map((s, i) => ({
          ...s,
          color: COLORS[(existing.length + i) % COLORS.length],
        })),
      ];
      setSpectra(merged);
      setSelected(parsed[0].id);
      if (!existing.length) {
        setPeaks([]);
        setIntegrals([]);
      }
      setDomain([
        Math.min(...merged.map((s) => s.x[0] + s.shift)),
        Math.max(...merged.map((s) => s.x.at(-1)! + s.shift)),
      ]);
      toast.success(
        `${parsed.length} spectrum${parsed.length > 1 ? "s" : ""} imported`,
      );
    });
  }
  function plotY(s: Spectrum, index: number, row: number) {
    return plotYValue(s, correctedY(s, index) * s.gain, row);
  }
  const floor = normalized
    ? Math.min(
        0,
        ...visible.map((v) => stats.get(v.id)!.min / stats.get(v.id)!.max),
      )
    : globalMin / globalMax;
  function plotYValue(s: Spectrum, raw: number, row: number) {
    const scale = normalized ? stats.get(s.id)!.max : globalMax;
    const y = raw / scale;
    const rowH = ph / (layout === "stacked" ? Math.max(1, visible.length) : 1);
    const rowTop = layout === "stacked" ? row * rowH : 0;
    const range = 1.15 - Math.min(-0.12, floor);
    return top + rowTop + 26 + ((rowH - 34) * (1.15 - y)) / range;
  }
  const peakLabels = useMemo(() => {
    const accepted: Peak[] = [];
    for (const p of [...peaks].sort((a, b) => b.y - a.y)) {
      if (p.x < domain[0] || p.x > domain[1]) continue;
      if (
        accepted.every(
          (q) =>
            (layout === "stacked" && q.spectrumId !== p.spectrumId) ||
            Math.abs(xp(q.x) - xp(p.x)) > 48,
        )
      )
        accepted.push(p);
    }
    return new Set(accepted.map((p) => p.id));
  }, [peaks, domain, layout, pw]);
  const paths = useMemo(
    () =>
      visible.map((s, row) => ({
        s,
        path: plotPoints(s, domain[0], domain[1], Math.ceil(pw))
          .map(
            (i, j) =>
              `${j ? "L" : "M"}${xp(s.x[i] + s.shift).toFixed(2)},${plotY(s, i, row).toFixed(2)}`,
          )
          .join(" "),
      })),
    [spectra, domain, layout, size, normalized, globalMax],
  );
  function ppm(clientX: number) {
    const r = svg.current!.getBoundingClientRect();
    return (
      domain[1] - ((((clientX - r.left) / r.width) * w - left) / pw) * span
    );
  }
  function addPeak(x: number) {
    if (!current) return;
    const p = nearestPeak(current, x);
    setPeaks((a) =>
      a.some((v) => v.spectrumId === current.id && Math.abs(v.x - p.x) < 0.001)
        ? a
        : [...a, { ...p, id: crypto.randomUUID(), spectrumId: current.id }],
    );
  }
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (!spectra.length || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2) {
      const a = [...pointers.current.values()];
      pinch.current = { distance: Math.abs(a[1] - a[0]), domain: [...domain] };
      drag.current = null;
      setSelection(null);
      return;
    }
    const x = ppm(e.clientX);
    drag.current = { x, domain: [...domain], tool };
    if (tool === "zoom" || tool === "integral") setSelection([x, x]);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const x = ppm(e.clientX);
    setHover(x);
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, e.clientX);
    if (pinch.current && pointers.current.size === 2) {
      const a = [...pointers.current.values()],
        distance = Math.abs(a[1] - a[0]);
      if (distance > 5) {
        const d = pinch.current.domain,
          c = (d[0] + d[1]) / 2,
          newSpan = ((d[1] - d[0]) * pinch.current.distance) / distance;
        setDomain(clampDomain([c - newSpan / 2, c + newSpan / 2]));
      }
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.tool === "pan") {
      const rect = svg.current!.getBoundingClientRect();
      const cursorFrac =
        (((e.clientX - rect.left) / rect.width) * w - left) / pw;
      const initialPPM = d.domain[1] - cursorFrac * (d.domain[1] - d.domain[0]);
      const delta = d.x - initialPPM;
      setDomain(clampDomain([d.domain[0] + delta, d.domain[1] + delta]));
    } else setSelection([d.x, x]);
  }
  function up(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      drag.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    setSelection(null);
    if (!d) return;
    const x = ppm(e.clientX);
    if (d.tool === "zoom" && Math.abs(x - d.x) > span * 0.005)
      setDomain(clampDomain([Math.min(x, d.x), Math.max(x, d.x)]));
    if (d.tool === "integral" && current && Math.abs(x - d.x) > span * 0.002) {
      try {
        const area = integrate(current, x, d.x);
        setIntegrals((a) => [
          ...a,
          {
            id: crypto.randomUUID(),
            spectrumId: current.id,
            from: Math.min(x, d.x),
            to: Math.max(x, d.x),
            area,
          },
        ]);
        toast.success("Integral added to selected spectrum");
      } catch (e) {
        toast.error(String(e));
      }
    }
    if (d.tool === "peak") addPeak(x);
    if (d.tool === "reference" && current) {
      const p = nearestPeak(current, x);
      setRefPeak(p.x);
      toast.info(
        `Reference selected at ${p.x.toFixed(4)} ppm. Set the target in controls.`,
      );
    }
  }
  function exportSVG() {
    if (!svg.current) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    downloadBlob(
      new XMLSerializer().serializeToString(clone),
      "nmrview-spectrum.svg",
      "image/svg+xml",
    );
  }
  function exportCSV() {
    if (!current) return;
    const csv = [
      "ppm,intensity",
      ...current.x.map(
        (x, i) => `${x + current.shift},${correctedY(current, i)}`,
      ),
    ].join("\n");
    downloadBlob(csv, "nmrview-spectrum.csv", "text/csv");
  }
  async function openSession(f: File) {
    await execute("Restoring spectroscopy session…", async () => {
      if (f.size > 120 * 1024 * 1024)
        throw new Error("Session is larger than 120 MB.");
      const s = await importSpectraSession(f);
      setSpectra(s.spectra);
      setSelected(s.spectra[0]?.id || "");
      setPeaks(s.peaks);
      setIntegrals(s.integrals);
      setReferenceIntegral("");
      if (s.spectra.length)
        setDomain([
          Math.min(...s.spectra.map((x) => x.x[0] + x.shift)),
          Math.max(...s.spectra.map((x) => x.x.at(-1)! + x.shift)),
        ]);
    });
  }
  return (
    <section className="workspace" aria-label="NMR workspace">
      {documentation && (
        <button
          className="btn spectrum-case-notes"
          onClick={() => setNotesOpen(true)}
        >
          Study documentation
        </button>
      )}
      <input
        ref={fileInput}
        hidden
        type="file"
        multiple
        accept=".dx,.jdx,.jcamp,.csv,.tsv,.txt"
        onChange={(e) => {
          importSpectra(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <input
        ref={sessionInput}
        hidden
        type="file"
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openSession(f);
          e.target.value = "";
        }}
      />
      <aside
        className={`panel left-panel ${panel === "layers" ? "mobile-open" : ""}`}
      >
        <div className="panel-head">
          <span>
            <Layers />
            Spectra & layers
          </span>
          <button
            className="btn icon ghost mobile-toggle close-layers"
            aria-label="Close layers"
            onClick={onClosePanel}
          >
            <X />
          </button>
          <span className="badge">
            {String(spectra.length).padStart(2, "0")}
          </span>
        </div>
        <div className="panel-section">
          <p className="eyebrow">Spectral comparison</p>
          <h2 className="study-title">
            {spectra.every((s) => s.source === SAMPLE_SOURCE)
              ? "Small molecule NMR"
              : "Local spectra"}
          </h2>
          <p className="meta">{spectra.length} spectra · Processed 1D</p>
          <span className="badge">CHEMICAL SHIFT / PPM</span>
        </div>
        <div className="panel-section">
          <div className="control-label">
            <span className="eyebrow">Spectrum layers</span>
            <button
              className="btn small ghost"
              aria-label="Add spectrum"
              onClick={() => setImportOpen(true)}
            >
              <Plus />
            </button>
          </div>
          {spectra.map((s, i) => (
            <div
              key={s.id}
              className={`layer ${selected === s.id ? "selected" : ""}`}
            >
              <div className="layer-title">
                <button
                  className="layer-select"
                  onClick={() => setSelected(s.id)}
                >
                  <span className="color-dot" style={{ background: s.color }} />
                  {s.name}
                </button>
                <button
                  className="btn small icon ghost"
                  aria-label={`${s.visible ? "Hide" : "Show"} ${s.name}`}
                  onClick={() => update(s.id, { visible: !s.visible })}
                >
                  {s.visible ? <Eye /> : <EyeOff />}
                </button>
              </div>
              <div className="layer-detail">
                {s.nucleus} ·{" "}
                {s.frequency
                  ? s.frequency.toFixed(1) + " MHz"
                  : "Frequency not recorded"}
              </div>
              <Range
                label="Opacity"
                value={s.opacity * 100}
                unit="%"
                onChange={(v) => update(s.id, { opacity: v / 100 })}
              />
              <div className="layer-actions">
                <button
                  className="btn small ghost"
                  aria-label={`Move ${s.name} up`}
                  disabled={!i}
                  onClick={() =>
                    setSpectra((a) => {
                      const b = [...a];
                      [b[i - 1], b[i]] = [b[i], b[i - 1]];
                      return b;
                    })
                  }
                >
                  <ChevronUp />
                </button>
                <button
                  className="btn small ghost"
                  aria-label={`Move ${s.name} down`}
                  disabled={i === spectra.length - 1}
                  onClick={() =>
                    setSpectra((a) => {
                      const b = [...a];
                      [b[i + 1], b[i]] = [b[i], b[i + 1]];
                      return b;
                    })
                  }
                >
                  <ChevronDown />
                </button>
                <button
                  className="btn small ghost"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => {
                    setSpectra((a) => a.filter((v) => v.id !== s.id));
                    setPeaks((a) => a.filter((v) => v.spectrumId !== s.id));
                    setIntegrals((a) => a.filter((v) => v.spectrumId !== s.id));
                    if (selected === s.id)
                      setSelected(spectra.find((v) => v.id !== s.id)?.id || "");
                  }}
                >
                  <X />
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button className="btn wide" onClick={() => setImportOpen(true)}>
            <Plus />
            Add spectra
          </button>
          <p className="hint">
            Select a layer to pick peaks, integrate regions, or change its
            reference.
          </p>
        </div>
        <div className="panel-section">
          <p className="eyebrow">Session</p>
          <div className="full-row">
            <button
              className="btn"
              disabled={!spectra.length}
              onClick={() =>
                downloadBlob(
                  JSON.stringify({
                    format: "nmrview-spectra-1",
                    spectra,
                    peaks,
                    integrals,
                  }),
                  "nmrview-spectra.json",
                )
              }
            >
              <Save />
              Save
            </button>
            <button
              className="btn"
              onClick={() => sessionInput.current?.click()}
            >
              <FolderOpen />
              Open
            </button>
          </div>
          <button
            className="btn ghost wide"
            style={{ marginTop: 8 }}
            onClick={loadSamples}
            disabled={!!busy}
          >
            <BookOpen />
            Load free examples
          </button>
        </div>
        <div className="panel-section">
          <div className="switch-row" style={{ marginTop: 0 }}>
            <span>Learning notes</span>
            <Switch
              aria-label="Spectroscopy learning notes"
              checked={lesson}
              onCheckedChange={setLesson}
            />
          </div>
          {lesson && (
            <div className="learn-card" style={{ marginTop: 14 }}>
              <strong>Read from right to left</strong>
              <p>
                Chemical shift increases to the left. Integrals measure signed
                area under the selected trace. Solvent peaks and overlapping
                signals can affect interpretation.
              </p>
            </div>
          )}
        </div>
      </aside>
      <div className="main-view">
        <div className="view-heading">
          <h1>
            1D NMR{" "}
            <span className="meta">
              /{" "}
              {layout === "stacked"
                ? "Stacked comparison"
                : "Superimposed spectra"}
            </span>
          </h1>
          <span className="badge">
            {normalized ? "NORMALIZED" : "SHARED SCALE"}
          </span>
        </div>
        <div className="toolbar">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`btn icon ${tool === t.id ? "active" : ""}`}
              aria-label={t.label}
              title={t.label}
              aria-pressed={tool === t.id}
              disabled={!current}
              onClick={() => setTool(t.id)}
            >
              <t.Icon />
            </button>
          ))}
          <span className="separator" />
          <Choice
            label="Spectra layout"
            value={layout}
            options={[
              ["stacked", "Stacked traces"],
              ["overlay", "Overlay traces"],
            ]}
            onChange={setLayout}
          />
          <span className="spacer" />
          <button
            className="btn icon"
            title="Fit full spectrum (R)"
            aria-label="Fit full spectrum"
            onClick={reset}
          >
            <RotateCcw />
          </button>
          <button
            className="btn icon"
            title="Export SVG image"
            aria-label="Export spectrum image"
            disabled={!spectra.length}
            onClick={exportSVG}
          >
            <Download />
          </button>
        </div>
        <div
          className="canvas-wrap spectrum-wrap"
          ref={holder}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            importSpectra(Array.from(e.dataTransfer.files));
          }}
        >
          <svg
            ref={svg}
            className="spectrum-svg"
            viewBox={`0 0 ${w} ${h}`}
            role="img"
            aria-label="Interactive NMR spectra. Chemical shift increases to the left."
            tabIndex={0}
            style={{ cursor: tool === "pan" ? "grab" : "crosshair", height: h }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={(e) => {
              pointers.current.delete(e.pointerId);
              drag.current = null;
              pinch.current = null;
              setSelection(null);
            }}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={reset}
            onWheel={(e) => {
              const anchor = ppm(e.clientX),
                factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
              setDomain(
                clampDomain([
                  anchor + (domain[0] - anchor) * factor,
                  anchor + (domain[1] - anchor) * factor,
                ]),
              );
            }}
          >
            <rect width={w} height={h} fill="#080d12" />
            <defs>
              <clipPath id="spectra-clip">
                <rect x={left} y={top} width={pw} height={ph} />
              </clipPath>
            </defs>
            {Array.from({ length: 9 }, (_, i) => {
              const value = domain[1] - (span * i) / 8,
                x = left + (pw * i) / 8;
              return (
                <g key={i}>
                  {grid && (
                    <line
                      x1={x}
                      x2={x}
                      y1={top}
                      y2={h - bottom}
                      stroke="#1e2b34"
                      strokeDasharray="3 5"
                    />
                  )}
                  <line
                    x1={x}
                    x2={x}
                    y1={h - bottom}
                    y2={h - bottom + 5}
                    stroke="#4b606e"
                  />
                  <text
                    x={x}
                    y={h - bottom + 23}
                    textAnchor="middle"
                    fill="#9aadb9"
                    fontFamily="monospace"
                    fontSize="12"
                  >
                    {value.toFixed(span < 2 ? 2 : 1)}
                  </text>
                </g>
              );
            })}
            <line
              x1={left}
              x2={w - right}
              y1={h - bottom}
              y2={h - bottom}
              stroke="#4b606e"
            />
            <text
              x={w / 2}
              y={h - 10}
              textAnchor="middle"
              fill="#94a9b7"
              fontSize="12"
              fontFamily="sans-serif"
            >
              Chemical shift δ (ppm)
            </text>
            <text
              transform={`translate(16 ${h / 2}) rotate(-90)`}
              textAnchor="middle"
              fill="#7893a4"
              fontSize="12"
              fontFamily="sans-serif"
            >
              {normalized ? "Relative intensity" : "Intensity (a.u.)"}
            </text>
            {visible.map((s, i) => {
              const rowH = ph / (layout === "stacked" ? visible.length : 1),
                y = top + (layout === "stacked" ? rowH * i : 0);
              return (
                <g key={s.id}>
                  <text
                    x={left + 6}
                    y={layout === "stacked" ? y + 14 : top + 14 + i * 19}
                    fill={s.color}
                    fontFamily="sans-serif"
                    fontSize="12"
                  >
                    {s.name} · {s.nucleus}
                    {s.gain !== 1 ? ` · ×${s.gain.toFixed(1)}` : ""}
                  </text>
                  {layout === "stacked" && (
                    <line
                      x1={left}
                      x2={w - right}
                      y1={plotYValue(s, 0, i)}
                      y2={plotYValue(s, 0, i)}
                      stroke="#24323b"
                    />
                  )}
                </g>
              );
            })}
            <g clipPath="url(#spectra-clip)">
              {integrals
                .filter((i) => visible.some((s) => s.id === i.spectrumId))
                .map((i) => (
                  <rect
                    key={i.id}
                    x={xp(i.to)}
                    y={
                      layout === "stacked"
                        ? top +
                          (visible.findIndex((s) => s.id === i.spectrumId) *
                            ph) /
                            visible.length
                        : top
                    }
                    width={Math.max(0, xp(i.from) - xp(i.to))}
                    height={layout === "stacked" ? ph / visible.length : ph}
                    fill={
                      spectra.find((s) => s.id === i.spectrumId)?.color ||
                      "#75dec9"
                    }
                    opacity=".07"
                  />
                ))}
              {paths.map(({ s, path }) => (
                <path
                  key={s.id}
                  d={path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={selected === s.id ? 1.5 : 1.1}
                  opacity={s.opacity}
                  strokeLinejoin="round"
                />
              ))}
              {peaks
                .filter(
                  (p) =>
                    visible.some((s) => s.id === p.spectrumId) &&
                    p.x >= domain[0] &&
                    p.x <= domain[1],
                )
                .slice(0, 80)
                .map((p) => {
                  const s = visible.find((s) => s.id === p.spectrumId)!;
                  const row = visible.indexOf(s),
                    rowH = ph / (layout === "stacked" ? visible.length : 1),
                    y = top + (layout === "stacked" ? row * rowH : 0) + 28;
                  return (
                    <g key={p.id}>
                      <line
                        x1={xp(p.x)}
                        x2={xp(p.x)}
                        y1={y + 6}
                        y2={y + 18}
                        stroke={s.color}
                      />
                      {peakLabels.has(p.id) && (
                        <text
                          x={xp(p.x)}
                          y={y}
                          fill={s.color}
                          fontSize="12"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {p.x.toFixed(3)}
                        </text>
                      )}
                    </g>
                  );
                })}
              {selection && (
                <rect
                  x={Math.min(xp(selection[0]), xp(selection[1]))}
                  y={top}
                  width={Math.abs(xp(selection[0]) - xp(selection[1]))}
                  height={ph}
                  fill="#7fdac3"
                  opacity=".14"
                />
              )}
              {hover !== null && (
                <line
                  x1={xp(hover)}
                  x2={xp(hover)}
                  y1={top}
                  y2={h - bottom}
                  stroke="#a0b9c5"
                  strokeDasharray="3 5"
                  opacity=".4"
                />
              )}
            </g>
          </svg>
          {busy && (
            <div className="loading" role="status">
              <ChartNoAxesCombined />
              <span>{busy}</span>
            </div>
          )}
          {error && !busy && (
            <div className="viewer-error" role="alert">
              {error}
              <button className="btn small" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {!spectra.length && !busy && (
            <div className="loading">
              <ChartNoAxesCombined />
              <span>Import spectra to start a comparison</span>
              <button
                className="btn primary"
                onClick={() => setImportOpen(true)}
              >
                Import spectra
              </button>
            </div>
          )}
        </div>
        <div className="view-bottom">
          <span className="mono">
            {TOOLS.find((t) => t.id === tool)?.label}
          </span>
          <span className="meta desktop-status">
            {tool === "integral"
              ? "Drag across a signal region"
              : tool === "zoom"
                ? "Drag to zoom · Double-click to fit"
                : tool === "pan"
                  ? "Drag to shift the visible range"
                  : "Click a signal on the selected spectrum"}
          </span>
          <span className="spacer" />
          <span className="mono">
            {hover === null ? "δ / ppm" : hover.toFixed(4) + " ppm"}
          </span>
        </div>
      </div>
      <aside
        className={`panel right-panel ${panel === "controls" ? "mobile-open" : ""}`}
      >
        <div className="panel-head">
          <span>
            <SlidersHorizontal />
            Spectrum controls
          </span>
          <button
            className="btn icon ghost mobile-toggle"
            aria-label="Close controls"
            onClick={onClosePanel}
          >
            <X />
          </button>
        </div>
        <div className="panel-section">
          <p className="eyebrow">Selected spectrum</p>
          <h2 className="study-title">
            {current?.name || "No spectrum selected"}
          </h2>
          <div className="switch-row">
            <span>Normalize each trace</span>
            <Switch
              aria-label="Normalize each trace"
              checked={normalized}
              onCheckedChange={setNormalized}
            />
          </div>
          <div className="switch-row">
            <span>Grid lines</span>
            <Switch
              aria-label="Spectrum grid lines"
              checked={grid}
              onCheckedChange={setGrid}
            />
          </div>
          {current && (
            <>
              <Range
                label="Vertical gain"
                min={0.1}
                max={10}
                step={0.1}
                value={current.gain}
                digits={1}
                unit="×"
                onChange={(v) => update(selected, { gain: v })}
              />
              <div className="control">
                <label>
                  Trace color
                  <input
                    aria-label="Trace color"
                    type="color"
                    value={current.color}
                    onChange={(e) =>
                      update(selected, { color: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="pair">
                <label className="meta">
                  From (ppm)
                  <input
                    className="field"
                    aria-label="Range from ppm"
                    type="number"
                    step=".1"
                    value={Number(domain[1].toFixed(3))}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n > domain[0]) setDomain(clampDomain([domain[0], n]));
                    }}
                  />
                </label>
                <label className="meta">
                  To (ppm)
                  <input
                    className="field"
                    aria-label="Range to ppm"
                    type="number"
                    step=".1"
                    value={Number(domain[0].toFixed(3))}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n < domain[1]) setDomain(clampDomain([n, domain[1]]));
                    }}
                  />
                </label>
              </div>
            </>
          )}
        </div>
        <div className="panel-section">
          <p className="eyebrow">Peak analysis</p>
          <Range
            label="Peak threshold"
            value={threshold}
            min={1}
            max={80}
            unit="%"
            onChange={setThreshold}
          />
          <div className="full-row">
            <button
              className="btn small"
              disabled={!current}
              onClick={() => {
                if (current) {
                  const found = pickPeaks(current, threshold / 100);
                  setPeaks((p) => [
                    ...p.filter((v) => v.spectrumId !== selected),
                    ...found.map((p) => ({
                      ...p,
                      id: crypto.randomUUID(),
                      spectrumId: selected,
                    })),
                  ]);
                  toast.success(`${found.length} peaks detected`);
                }
              }}
            >
              <Crosshair />
              Find peaks
            </button>
            <button
              className="btn small"
              onClick={() =>
                setPeaks((p) => p.filter((v) => v.spectrumId !== selected))
              }
            >
              Clear
            </button>
          </div>
          <div className="analysis-list">
            {peaks
              .filter((p) => p.spectrumId === selected)
              .map((p) => (
                <div className="annotation" key={p.id}>
                  <span className="mono">{p.x.toFixed(4)} ppm</span>
                  <button
                    className="btn small ghost"
                    aria-label={`Remove peak ${p.x.toFixed(4)}`}
                    onClick={() =>
                      setPeaks((a) => a.filter((v) => v.id !== p.id))
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
          </div>
          <p className="hint">
            Local maxima above the threshold; minimum separation 0.015 ppm.
            Review overlapping peaks manually.
          </p>
        </div>
        <div className="panel-section">
          <p className="eyebrow">Integrals</p>
          <button
            className={`btn wide ${tool === "integral" ? "active" : ""}`}
            disabled={!current}
            onClick={() => setTool("integral")}
          >
            <Braces />
            Select region on spectrum
          </button>
          {integrals
            .filter((i) => i.spectrumId === selected)
            .map((i) => (
              <div className="integral-row" key={i.id}>
                <div>
                  <span className="mono">
                    {i.to.toFixed(3)} → {i.from.toFixed(3)} ppm
                  </span>
                  <strong>
                    {reference &&
                    reference.spectrumId === i.spectrumId &&
                    reference.area !== 0
                      ? ((i.area / reference.area) * integralUnits).toFixed(3) +
                        " relative"
                      : i.area.toPrecision(5) + " a.u.·ppm"}
                  </strong>
                </div>
                <button
                  className="btn ghost icon small"
                  aria-label="Remove integral"
                  onClick={() =>
                    setIntegrals((a) => a.filter((v) => v.id !== i.id))
                  }
                >
                  <X />
                </button>
                <button
                  className={`btn small ${referenceIntegral === i.id ? "active" : ""}`}
                  disabled={i.area === 0}
                  onClick={() => setReferenceIntegral(i.id)}
                >
                  Set reference
                </button>
              </div>
            ))}
          {reference && (
            <label className="control meta">
              Reference proton count
              <input
                className="field"
                type="number"
                min=".01"
                step=".1"
                value={integralUnits}
                onChange={(e) => {
                  if (Number(e.target.value) > 0)
                    setIntegralUnits(Number(e.target.value));
                }}
              />
            </label>
          )}
          <p className="hint">
            Signed trapezoidal area, before display gain or normalization. Set
            one integral as a reference to obtain relative ratios.
          </p>
        </div>
        <div className="panel-section">
          <p className="eyebrow">Reference & baseline</p>
          <button
            className={`btn wide ${tool === "reference" ? "active" : ""}`}
            disabled={!current}
            onClick={() => setTool("reference")}
          >
            <MapPin />
            Choose reference peak
          </button>
          {refPeak !== null && (
            <>
              <p className="hint">Selected: {refPeak.toFixed(4)} ppm</p>
              <div className="pair" style={{ marginTop: 8 }}>
                <input
                  aria-label="Reference target ppm"
                  className="field"
                  type="number"
                  step=".001"
                  value={refTarget}
                  onChange={(e) => setRefTarget(Number(e.target.value))}
                />
                <button
                  className="btn"
                  onClick={() => {
                    if (current && Number.isFinite(refTarget)) {
                      update(selected, {
                        shift: current.shift + refTarget - refPeak,
                      });
                      setRefPeak(null);
                      toast.success(
                        "Reference adjusted; previous analyses cleared.",
                      );
                    }
                  }}
                >
                  Apply ppm
                </button>
              </div>
            </>
          )}
          {current && (
            <p className="hint">
              Reference offset: {current.shift.toFixed(4)} ppm
            </p>
          )}
          <div className="full-row" style={{ marginTop: 12 }}>
            <button
              className="btn small"
              disabled={!current}
              onClick={() => {
                if (current) {
                  update(selected, { baseline: baselineEstimate(current) });
                  toast.info(
                    "Linear baseline estimated from both edges. Verify the corrected spectrum.",
                  );
                }
              }}
            >
              Linear baseline
            </button>
            <button
              className="btn small"
              disabled={!current}
              onClick={() => {
                update(selected, { baseline: [0, 0], shift: 0, gain: 1 });
                setRefPeak(null);
              }}
            >
              <Undo2 />
              Reset
            </button>
          </div>
          <p className="hint">
            Correction assumes both spectrum edges are signal-free. Original
            data remain intact in the session.
          </p>
        </div>
        {current && (
          <div className="panel-section">
            <p className="eyebrow">Spectrum metadata</p>
            <dl className="info-grid">
              <dt>Nucleus</dt>
              <dd>{current.nucleus}</dd>
              <dt>Frequency</dt>
              <dd>{current.frequency?.toFixed(3) || "—"} MHz</dd>
              <dt>Solvent</dt>
              <dd>{current.solvent}</dd>
              <dt>Points</dt>
              <dd>{current.x.length.toLocaleString()}</dd>
              <dt>Data range</dt>
              <dd>
                {current.x.at(-1)?.toFixed(2)} to {current.x[0].toFixed(2)}
              </dd>
            </dl>
            <p className="hint">{current.source}</p>
            <div className="full-row" style={{ marginTop: 14 }}>
              <button className="btn small" onClick={exportCSV}>
                <Download />
                CSV
              </button>
              <button
                className="btn small"
                onClick={() =>
                  downloadBlob(
                    JSON.stringify(
                      {
                        spectrum: current.name,
                        source: current.source,
                        shift: current.shift,
                        baseline: current.baseline,
                        peaks: peaks.filter((p) => p.spectrumId === selected),
                        integrals: integrals.filter(
                          (p) => p.spectrumId === selected,
                        ),
                      },
                      null,
                      2,
                    ),
                    "nmrview-analysis.json",
                  )
                }
              >
                <Download />
                Analysis
              </button>
            </div>
          </div>
        )}
      </aside>
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogTitle>Study documentation</DialogTitle>
          <DialogDescription>
            Source notes supplied with these spectra.
          </DialogDescription>
          <div className="dialog-body">
            {documentation && <CaseNotes doc={documentation} />}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogTitle>Import NMR spectra</DialogTitle>
          <DialogDescription>
            Add processed spectra for comparison and analysis.
          </DialogDescription>
          <div className="dialog-body">
            <RepositoryBrowser
              mode="nmr"
              onLoad={importSpectra}
              onDocumentation={setDocumentation}
            />
            <div className="data-choice">
              <h3>JCAMP-DX or CSV</h3>
              <p>
                1D .jdx, .dx, .jcamp, or two-column CSV: chemical shift (ppm),
                intensity. Multiple files can be selected.
              </p>
              <button
                className="btn primary"
                onClick={() => fileInput.current?.click()}
              >
                <Plus />
                Choose spectra
              </button>
            </div>
            <p>
              Raw FID and Bruker acquisition folders need processing in your
              acquisition software first. Export the processed spectrum as
              JCAMP-DX. 2D spectroscopy is not supported in this version.
            </p>
            <p>
              The first import replaces the free examples. Later imports add
              comparison layers.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
