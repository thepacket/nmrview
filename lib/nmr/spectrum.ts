import { convert } from "jcampconverter";
export type Spectrum = {
  id: string;
  name: string;
  x: number[];
  y: number[];
  nucleus: string;
  frequency: number | null;
  solvent: string;
  source: string;
  color: string;
  visible: boolean;
  opacity: number;
  gain: number;
  shift: number;
  baseline: [number, number];
};
export type Integral = {
  id: string;
  spectrumId: string;
  from: number;
  to: number;
  area: number;
};
export type Peak = { id: string; spectrumId: string; x: number; y: number };
export const COLORS = [
  "#75dec9",
  "#e9b374",
  "#a799ed",
  "#71b8ec",
  "#ed96b3",
  "#c5d984",
];
export function validateXY(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 2)
    throw new Error("A spectrum needs at least two paired data points.");
  if (x.length > 2000000)
    throw new Error("A spectrum cannot exceed 2 million data points.");
  if (x.some((v) => !Number.isFinite(v)) || y.some((v) => !Number.isFinite(v)))
    throw new Error("Spectrum contains invalid numeric values.");
  const pairs = x.map((v, i) => [v, y[i]]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < pairs.length; i++)
    if (pairs[i][0] === pairs[i - 1][0])
      throw new Error("Chemical shift values must be unique.");
  return { x: pairs.map((p) => p[0]), y: pairs.map((p) => p[1]) };
}
export function parseSpectrum(
  text: string,
  name: string,
  source = "Local file",
): Spectrum[] {
  const results: {
    x: number[];
    y: number[];
    name: string;
    nucleus: string;
    frequency: number | null;
    solvent: string;
  }[] = [];
  if (/^\s*##/m.test(text)) {
    const result = convert(text, { keepRecordsRegExp: /.*/, noContour: true });
    for (const entry of result.flatten || []) {
      const b = entry as typeof entry & { info?: Record<string, unknown> };
      if (b.twoD || Number(b.info?.NUMDIM) > 1)
        throw new Error(
          "This workspace supports processed 1D spectra. 2D JCAMP is not supported.",
        );
      if (!/NMR SPECTRUM/i.test(b.dataType || "") && b.dataType) continue;
      for (const s of b.spectra || []) {
        if (!s.data?.x?.length || !s.data?.y?.length || s.isPeaktable) continue;
        const units = String(s.xUnits || "").toUpperCase();
        let x = Array.from(s.data.x) as number[];
        const frequency = Number(s.observeFrequency) || null;
        if (units === "HZ" && frequency) x = x.map((v) => v / frequency);
        else if (units !== "PPM")
          throw new Error(
            `Cannot interpret ${units || "missing"} X units as chemical shift. Supply ppm or Hz with observe frequency.`,
          );
        results.push({
          ...validateXY(x, Array.from(s.data.y) as number[]),
          name: results.length ? `${name} · ${results.length + 1}` : name,
          nucleus: String(b.info?.[".OBSERVENUCLEUS"] || "Unknown").replaceAll(
            "^",
            "",
          ),
          frequency,
          solvent: String(b.info?.[".SOLVENTNAME"] || "Not recorded"),
        });
      }
    }
    if (!results.length)
      throw new Error(
        "No processed 1D NMR spectrum found. Raw FIDs must be processed and exported as JCAMP-DX first.",
      );
  } else {
    const x: number[] = [],
      y: number[] = [];
    let header = false;
    for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const cells = line.split(/[,;\t ]+/);
      if (cells.length !== 2)
        throw new Error(
          "CSV must have exactly two columns: ppm and intensity.",
        );
      const a = Number(cells[0]),
        b = Number(cells[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        if (!x.length && !header) {
          header = true;
          continue;
        }
        throw new Error("CSV contains a non-numeric data row.");
      }
      x.push(a);
      y.push(b);
    }
    results.push({
      ...validateXY(x, y),
      name,
      nucleus: "Unknown",
      frequency: null,
      solvent: "Not recorded",
    });
  }
  return results.map((r, i) => ({
    ...r,
    id: crypto.randomUUID(),
    source,
    color: COLORS[i % COLORS.length],
    visible: true,
    opacity: 1,
    gain: 1,
    shift: 0,
    baseline: [0, 0],
  }));
}
export function correctedY(s: Spectrum, i: number) {
  return s.y[i] - (s.baseline[0] * s.x[i] + s.baseline[1]);
}
export function extent(s: Spectrum) {
  let max = 0,
    min = 0;
  for (let i = 0; i < s.y.length; i++) {
    const y = correctedY(s, i);
    max = Math.max(max, y);
    min = Math.min(min, y);
  }
  return { max: Math.max(max, 1e-12), min };
}
export function lowerBound(x: number[], v: number) {
  let lo = 0,
    hi = x.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (x[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export function integrate(s: Spectrum, from: number, to: number) {
  const lo = Math.max(s.x[0], Math.min(from, to) - s.shift),
    hi = Math.min(s.x.at(-1)!, Math.max(from, to) - s.shift);
  if (hi <= lo) throw new Error("Select an interval inside the spectrum.");
  let sum = 0;
  for (
    let i = Math.max(1, lowerBound(s.x, lo));
    i < s.x.length && s.x[i - 1] < hi;
    i++
  ) {
    const a = Math.max(lo, s.x[i - 1]),
      b = Math.min(hi, s.x[i]);
    if (b <= a) continue;
    const y0 = correctedY(s, i - 1),
      y1 = correctedY(s, i);
    const ya = y0 + ((y1 - y0) * (a - s.x[i - 1])) / (s.x[i] - s.x[i - 1]);
    const yb = y0 + ((y1 - y0) * (b - s.x[i - 1])) / (s.x[i] - s.x[i - 1]);
    sum += ((ya + yb) / 2) * (b - a);
  }
  return sum;
}
export function pickPeaks(s: Spectrum, threshold: number, minDistance = 0.015) {
  const max = extent(s).max;
  const candidates: { x: number; y: number }[] = [];
  for (let i = 1; i < s.x.length - 1; i++) {
    const y = correctedY(s, i);
    if (
      y >= max * threshold &&
      y > correctedY(s, i - 1) &&
      y >= correctedY(s, i + 1)
    )
      candidates.push({ x: s.x[i] + s.shift, y });
  }
  candidates.sort((a, b) => b.y - a.y);
  const accepted: typeof candidates = [];
  for (const p of candidates) {
    if (accepted.every((q) => Math.abs(q.x - p.x) >= minDistance))
      accepted.push(p);
    if (accepted.length >= 250) break;
  }
  return accepted.sort((a, b) => b.x - a.x);
}
export function nearestPeak(s: Spectrum, x: number) {
  let best = Math.max(
      0,
      Math.min(s.x.length - 1, lowerBound(s.x, x - s.shift)),
    ),
    score = -Infinity;
  const start = Math.max(0, lowerBound(s.x, x - s.shift - 0.025)),
    end = Math.min(s.x.length, lowerBound(s.x, x - s.shift + 0.025) + 1);
  for (let i = start; i < end; i++) {
    const y = correctedY(s, i);
    if (y > score) {
      score = y;
      best = i;
    }
  }
  return { x: s.x[best] + s.shift, y: correctedY(s, best) };
}
export function baselineEstimate(s: Spectrum): [number, number] {
  const k = Math.max(2, Math.min(100, Math.floor(s.x.length * 0.02)));
  const median = (a: number[]) =>
    a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
  const first = median(s.y.slice(0, k)),
    last = median(s.y.slice(-k));
  const slope = (last - first) / (s.x.at(-1)! - s.x[0]);
  return [slope, first - slope * s.x[0]];
}
// Retain each screen bucket's extrema instead of dropping narrow resonances.
export function plotPoints(
  s: Spectrum,
  lo: number,
  hi: number,
  buckets: number,
) {
  const a = Math.max(0, lowerBound(s.x, lo - s.shift) - 1),
    b = Math.min(s.x.length, lowerBound(s.x, hi - s.shift) + 1),
    step = Math.max(1, Math.ceil((b - a) / Math.max(1, buckets)));
  const out: number[] = [];
  for (let i = a; i < b; i += step) {
    let min = i,
      max = i;
    for (let j = i + 1; j < Math.min(b, i + step); j++) {
      if (correctedY(s, j) < correctedY(s, min)) min = j;
      if (correctedY(s, j) > correctedY(s, max)) max = j;
    }
    for (const index of [
      ...new Set([i, min, max, Math.min(b - 1, i + step - 1)]),
    ].sort((x, y) => x - y))
      out.push(index);
  }
  return out;
}
export function validateSession(value: unknown): {
  spectra: Spectrum[];
  peaks: Peak[];
  integrals: Integral[];
} {
  if (!value || typeof value !== "object")
    throw new Error("Invalid spectroscopy session.");
  const v = value as {
    format?: string;
    spectra?: Spectrum[];
    peaks?: Peak[];
    integrals?: Integral[];
  };
  if (
    v.format !== "nmrview-spectra-1" ||
    !Array.isArray(v.spectra) ||
    v.spectra.length > 24
  )
    throw new Error("Unsupported spectroscopy session.");
  let count = 0;
  const spectra = v.spectra.map((s, i) => {
    if (
      !s ||
      !Array.isArray(s.x) ||
      !Array.isArray(s.y) ||
      typeof s.id !== "string" ||
      typeof s.name !== "string"
    )
      throw new Error("Invalid spectrum in session.");
    count += s.x.length;
    if (count > 5000000) throw new Error("Session exceeds 5 million points.");
    const xy = validateXY(s.x, s.y);
    if (
      !Number.isFinite(s.shift) ||
      !Number.isFinite(s.gain) ||
      s.gain < 0.01 ||
      s.gain > 100 ||
      !Number.isFinite(s.opacity) ||
      s.opacity < 0 ||
      s.opacity > 1 ||
      !Array.isArray(s.baseline) ||
      s.baseline.length !== 2 ||
      !s.baseline.every(Number.isFinite)
    )
      throw new Error("Invalid display parameters in session.");
    return {
      ...s,
      ...xy,
      color: /^#[0-9a-f]{6}$/i.test(s.color)
        ? s.color
        : COLORS[i % COLORS.length],
      nucleus: String(s.nucleus || "Unknown"),
      frequency:
        typeof s.frequency === "number" && Number.isFinite(s.frequency)
          ? s.frequency
          : null,
      source: String(s.source || "Saved session"),
      solvent: String(s.solvent || "Not recorded"),
      visible: !!s.visible,
    };
  });
  const ids = new Set(spectra.map((s) => s.id));
  if (ids.size !== spectra.length)
    throw new Error("Duplicate spectrum identifiers.");
  const peaks = (v.peaks || [])
    .filter(
      (p) =>
        p &&
        ids.has(p.spectrumId) &&
        typeof p.id === "string" &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y),
    )
    .slice(0, 1000);
  const integrals = (v.integrals || [])
    .filter(
      (p) =>
        p &&
        ids.has(p.spectrumId) &&
        typeof p.id === "string" &&
        Number.isFinite(p.from) &&
        Number.isFinite(p.to) &&
        Number.isFinite(p.area),
    )
    .slice(0, 1000);
  return { spectra, peaks, integrals };
}
