"use client";
import { useEffect, useRef, useState } from "react";
import Worker from "@/lib/nmr/two-d.worker?worker";
import type { Spectrum2D } from "@/lib/nmr/two-d";
import { downloadPublic } from "@/lib/repositories";
import { downloadBlob } from "./controls";
import { registerScanSource } from "@/lib/assistant/scan";
export function TwoDSpectra({ active }: { active: boolean }) {
  const [url, setUrl] = useState(""),
    [data, setData] = useState<Spectrum2D | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [threshold, setThreshold] = useState(5),
    [zoom, setZoom] = useState(1),
    [center, setCenter] = useState([0.5, 0.5]),
    [peaks, setPeaks] = useState<{ x: number; y: number; intensity: number }[]>(
      [],
    );
  const ref = useRef<HTMLCanvasElement>(null),
    worker = useRef<Worker | null>(null),
    abort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function load() {
    const a = new AbortController();
    abort.current = a;
    setBusy(true);
    setError("");
    timer.current = setTimeout(() => {
      a.abort();
      worker.current?.terminate();
      setBusy(false);
      setError("2D import timed out.");
    }, 60000);
    try {
      const blob = await downloadPublic(url, 32 * 1024 * 1024, a.signal);
      const w = new Worker();
      worker.current = w;
      w.onmessage = ({ data: r }) => {
        if (timer.current) clearTimeout(timer.current);
        w.terminate();
        setBusy(false);
        if (r.error) setError(r.error);
        else {
          setData(r.result);
          setPeaks([]);
          setZoom(1);
          setCenter([0.5, 0.5]);
        }
      };
      w.onerror = () => {
        if (timer.current) clearTimeout(timer.current);
        w.terminate();
        setError("2D parser failed.");
        setBusy(false);
      };
      w.postMessage({
        file: blob,
        name: new URL(url).pathname.split("/").pop(),
        source: url,
      });
    } catch (e) {
      if (timer.current) clearTimeout(timer.current);
      setError((e as Error).message);
      setBusy(false);
    }
  }
  useEffect(() => {
    const c = ref.current;
    if (!c || !data) return;
    const g = c.getContext("2d")!,
      w = c.width,
      h = c.height;
    g.fillStyle = "#090e13";
    g.fillRect(0, 0, w, h);
    const ny = data.y.length,
      nx = data.x.length,
      max = Math.max(
        ...data.z.map((r) => r.reduce((a, v) => Math.max(a, Math.abs(v)), 0)),
      );
    const image = g.createImageData(nx, ny);
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const v = data.z[y][x],
          a = Math.abs(v) / Math.max(max, 1e-12),
          i = 4 * ((ny - 1 - y) * nx + nx - 1 - x);
        if (a >= threshold / 100) {
          image.data[i] = v < 0 ? 220 : 70;
          image.data[i + 1] = v < 0 ? 110 : 220;
          image.data[i + 2] = v < 0 ? 160 : 205;
          image.data[i + 3] = Math.max(60, Math.round(255 * Math.sqrt(a)));
        }
      }
    const temp = document.createElement("canvas");
    temp.width = nx;
    temp.height = ny;
    temp.getContext("2d")!.putImageData(image, 0, 0);
    g.imageSmoothingEnabled = false;
    const sw = nx / zoom,
      sh = ny / zoom;
    g.drawImage(
      temp,
      center[0] * nx - sw / 2,
      center[1] * ny - sh / 2,
      sw,
      sh,
      60,
      20,
      w - 90,
      h - 80,
    );
    g.fillStyle = "#ccd5de";
    g.font = "14px sans-serif";
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const fx = 1 - (center[0] + (t - 0.5) / zoom),
        fy = 1 - (center[1] + (t - 0.5) / zoom);
      g.fillText(
        (data.x[0] + fx * (data.x.at(-1)! - data.x[0])).toFixed(2),
        60 + t * (w - 90) - 16,
        h - 38,
      );
      g.fillText(
        (data.y[0] + fy * (data.y.at(-1)! - data.y[0])).toFixed(2),
        3,
        25 + t * (h - 80),
      );
    }
    g.fillText("F2 / ppm", w / 2, h - 12);
    g.fillText("F1 / ppm", 2, 14);
  }, [data, threshold, zoom, center]);
  useEffect(
    () =>
      registerScanSource("nmr-2d", {
        label: "Laboratory 2D NMR",
        available: () =>
          active && !!data && !!ref.current?.getBoundingClientRect().width,
        capture: () => ({
          image: ref.current!.toDataURL("image/jpeg", 0.92),
          label: "2D NMR spectrum",
          capturedAt: new Date().toISOString(),
          metadata: JSON.stringify({
            name: data?.name,
            source: data?.source,
            thresholdPercent: threshold,
            peaks,
          }),
        }),
      }),
    [active, data, threshold, peaks],
  );
  return (
    <section className="mrs-workspace" aria-label="2D laboratory NMR">
      <div className="mrs-image-area">
        <h2>2D NMR</h2>
        <p className="hint">
          Positive signals: teal · Negative signals: pink · Click a cell to
          record its coordinates. Zoom around the center; pan with the position
          controls.
        </p>
        {data ? (
          <canvas
            width={1000}
            height={650}
            ref={ref}
            style={{ width: "100%", height: "auto" }}
            aria-label="2D NMR intensity map"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect(),
                u = ((e.clientX - r.left) / r.width) * 1000,
                v = ((e.clientY - r.top) / r.height) * 650;
              if (u < 60 || u > 970 || v < 20 || v > 590) return;
              const ix = Math.round(
                  (1 - (center[0] + ((u - 60) / 910 - 0.5) / zoom)) *
                    (data.x.length - 1),
                ),
                iy = Math.round(
                  (1 - (center[1] + ((v - 20) / 570 - 0.5) / zoom)) *
                    (data.y.length - 1),
                );
              if (
                ix >= 0 &&
                iy >= 0 &&
                ix < data.x.length &&
                iy < data.y.length
              )
                setPeaks((p) =>
                  [
                    ...p,
                    { x: data.x[ix], y: data.y[iy], intensity: data.z[iy][ix] },
                  ].slice(-100),
                );
            }}
          />
        ) : (
          <div className="mrs-empty">
            Load processed 2D JCAMP-DX with both axes in ppm, or a rectangular
            CSV grid with header f2_ppm,f1_ppm,intensity.
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Loading 2D spectrum…</p>}
      </div>
      <aside className="mrs-controls">
        <section>
          <label>
            Public spectrum URL
            <input
              className="field"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <button
            className="btn primary"
            disabled={!url || busy}
            onClick={load}
          >
            Load 2D spectrum
          </button>
          <button
            className="btn"
            disabled={!busy}
            onClick={() => {
              abort.current?.abort();
              worker.current?.terminate();
              if (timer.current) clearTimeout(timer.current);
              setBusy(false);
            }}
          >
            Cancel
          </button>
          <p className="hint">
            Zenodo / OpenNeuro S3. Maximum 32 MB, one million cells. No
            smoothing or automatic assignments.
          </p>
        </section>
        <section>
          <label>
            Display threshold (% of absolute maximum)
            <input
              className="field"
              type="number"
              min="0"
              max="100"
              value={threshold}
              onChange={(e) =>
                setThreshold(Math.max(0, Math.min(100, Number(e.target.value))))
              }
            />
          </label>
          <label>
            Zoom
            <input
              className="field"
              type="range"
              min="1"
              max="12"
              step=".1"
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoom(z);
                setCenter(
                  center.map((v) =>
                    Math.max(0.5 / z, Math.min(1 - 0.5 / z, v)),
                  ),
                );
              }}
            />
          </label>
          {["Horizontal center", "Vertical center"].map((v, i) => (
            <label key={v}>
              {v}
              <input
                className="field"
                type="range"
                min={0.5 / zoom}
                max={1 - 0.5 / zoom}
                step=".001"
                value={center[i]}
                onChange={(e) =>
                  setCenter(
                    center.map((v, j) =>
                      j === i ? Number(e.target.value) : v,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            className="btn"
            onClick={() => {
              setZoom(1);
              setCenter([0.5, 0.5]);
            }}
          >
            Fit
          </button>
        </section>
        <section>
          <h3>Picked coordinates</h3>
          {peaks.map((p, i) => (
            <p key={i} className="mono">
              F2 {p.x.toFixed(4)} · F1 {p.y.toFixed(4)} ·{" "}
              {p.intensity.toPrecision(4)}
            </p>
          ))}
          <button className="btn" onClick={() => setPeaks([])}>
            Clear picks
          </button>
          <button
            className="btn"
            disabled={!data}
            onClick={() =>
              downloadBlob(
                JSON.stringify(
                  { source: data?.source, name: data?.name, threshold, peaks },
                  null,
                  2,
                ),
                "nmrview-2d-review.json",
              )
            }
          >
            Export picks
          </button>
          <button
            className="btn"
            disabled={!data}
            onClick={() => {
              const a = document.createElement("a");
              a.href = ref.current!.toDataURL("image/png");
              a.download = "nmrview-2d.png";
              a.click();
            }}
          >
            Export plot
          </button>
        </section>
      </aside>
    </section>
  );
}
