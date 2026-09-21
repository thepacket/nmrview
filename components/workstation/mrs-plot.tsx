"use client";
import { useEffect, useRef, useState } from "react";
import { type Spectrum, correctedY, plotPoints } from "@/lib/nmr/spectrum";
import { canvasSpectrumSnapshot } from "@/lib/nmr/snapshot";
import { registerScanSource } from "@/lib/assistant/scan";
export function MRSPlot({
  spectra,
  range,
  onRange,
  metadata,
  active,
}: {
  spectra: Spectrum[];
  range: [number, number];
  onRange: (r: [number, number]) => void;
  metadata: object;
  active: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    [size, setSize] = useState([900, 400]),
    drag = useRef<number | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const o = new ResizeObserver(([e]) =>
      setSize([
        Math.max(1, e.contentRect.width),
        Math.max(1, e.contentRect.height),
      ]),
    );
    o.observe(c);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const [w, h] = size,
      dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.fillStyle = "#090e13";
    g.fillRect(0, 0, w, h);
    g.font = "13px sans-serif";
    g.strokeStyle = "#536575";
    g.fillStyle = "#c0ccd4";
    const xp = (x: number) =>
      48 + ((range[1] - x) / (range[1] - range[0])) * (w - 68);
    g.beginPath();
    g.moveTo(48, 24);
    g.lineTo(48, h - 36);
    g.lineTo(w - 20, h - 36);
    g.stroke();
    let max = 1e-12,
      min = 0;
    const traces = spectra
      .filter((s) => s.visible)
      .map((s) => ({
        s,
        ids: plotPoints(s, range[0], range[1], Math.ceil(w)),
      }));
    for (const { s, ids } of traces)
      for (const i of ids) {
        max = Math.max(max, correctedY(s, i));
        min = Math.min(min, correctedY(s, i));
      }
    for (let i = 0; i <= 6; i++) {
      const v = range[0] + (i * (range[1] - range[0])) / 6;
      g.fillText(v.toFixed(2), xp(v) - 14, h - 16);
    }
    g.fillText("ppm → increasing left", 48, 16);
    for (const { s, ids } of traces) {
      g.strokeStyle = s.color;
      g.globalAlpha = s.opacity;
      g.beginPath();
      ids.forEach((i, j) => {
        const x = xp(s.x[i] + s.shift),
          y = 30 + ((max - correctedY(s, i)) / (max - min)) * (h - 74);
        if (j) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
    }
    g.globalAlpha = 1;
  }, [spectra, range, size]);
  useEffect(
    () =>
      registerScanSource("mrs-spectrum", {
        label: "Tissue MRS spectrum",
        available: () =>
          active &&
          !!spectra.length &&
          !!ref.current?.getBoundingClientRect().width,
        capture: () => {
          const c = ref.current;
          if (!c) throw new Error("Spectrum unavailable.");
          return canvasSpectrumSnapshot(
            c,
            "Tissue MRS spectrum (shared amplitude scale)",
            metadata,
          );
        },
      }),
    [spectra, metadata, active],
  );
  const ppm = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return (
      range[1] -
      ((clientX - r.left - 48) / (r.width - 68)) * (range[1] - range[0])
    );
  };
  return (
    <canvas
      ref={ref}
      className="mrs-spectrum-plot"
      aria-label="MRS spectrum; drag to zoom, double click to fit"
      onPointerDown={(e) => {
        drag.current = ppm(e.clientX);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (drag.current !== null) {
          const v = ppm(e.clientX);
          if (Math.abs(v - drag.current) > 0.01)
            onRange([Math.min(v, drag.current), Math.max(v, drag.current)]);
          drag.current = null;
        }
      }}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => {
        if (spectra[0]) onRange([spectra[0].x[0], spectra[0].x.at(-1)!]);
      }}
    />
  );
}
