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
  // Acquisition axes are normally monotonic. Avoid millions of temporary
  // pair objects and an unnecessary sort for the common ascending/descending case.
  let ascending = true,
    descending = true;
  for (let i = 1; i < x.length; i++) {
    ascending &&= x[i] > x[i - 1];
    descending &&= x[i] < x[i - 1];
  }
  if (ascending) return { x, y };
  if (descending) return { x: x.slice().reverse(), y: y.slice().reverse() };
  const order = Array.from({ length: x.length }, (_, i) => i).sort(
    (a, b) => x[a] - x[b],
  );
  for (let i = 1; i < order.length; i++)
    if (x[order[i]] === x[order[i - 1]])
      throw new Error("Chemical shift values must be unique.");
  return { x: order.map((i) => x[i]), y: order.map((i) => y[i]) };
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
// Input arrays are immutable. Weak keys let closed spectra and their indices
// be collected. Only the current baseline's index is retained per data array.
const indexCache = new WeakMap<
  number[],
  {
    x: number[];
    slope: number;
    intercept: number;
    min: Int32Array;
    max: Int32Array;
    leaves: number;
    extent: { min: number; max: number };
  }
>();
const BLOCK = 64;
function signalIndex(s: Spectrum) {
  const cached = indexCache.get(s.y);
  if (
    cached &&
    cached.x === s.x &&
    cached.slope === s.baseline[0] &&
    cached.intercept === s.baseline[1]
  )
    return cached;
  let leaves = 1;
  while (leaves < Math.ceil(s.y.length / BLOCK)) leaves *= 2;
  const min = new Int32Array(2 * leaves).fill(-1);
  const max = new Int32Array(2 * leaves).fill(-1);
  function choose(a: number, b: number, low: boolean) {
    if (a < 0) return b;
    if (b < 0) return a;
    const ya = correctedY(s, a),
      yb = correctedY(s, b);
    return (low ? ya <= yb : ya >= yb) ? a : b;
  }
  for (let i = 0; i < s.y.length; i++) {
    const node = leaves + Math.floor(i / BLOCK);
    min[node] = choose(min[node], i, true);
    max[node] = choose(max[node], i, false);
  }
  for (let node = leaves - 1; node > 0; node--) {
    min[node] = choose(min[2 * node], min[2 * node + 1], true);
    max[node] = choose(max[2 * node], max[2 * node + 1], false);
  }
  const index = {
    x: s.x,
    slope: s.baseline[0],
    intercept: s.baseline[1],
    min,
    max,
    leaves,
    extent: {
      min: Math.min(0, correctedY(s, min[1])),
      max: Math.max(1e-12, correctedY(s, max[1])),
    },
  };
  indexCache.set(s.y, index);
  return index;
}
export function extent(s: Spectrum) {
  return signalIndex(s).extent;
}
function rangeExtrema(s: Spectrum, start: number, end: number) {
  const index = signalIndex(s);
  let min = start,
    max = start;
  let minY = correctedY(s, start),
    maxY = minY;
  function include(i: number, low: boolean) {
    if (i < 0) return;
    const y = correctedY(s, i);
    if (low && (y < minY || (y === minY && i < min))) {
      min = i;
      minY = y;
    }
    if (!low && (y > maxY || (y === maxY && i < max))) {
      max = i;
      maxY = y;
    }
  }
  // Scan only incomplete edge blocks; use the tree for complete blocks.
  while (start < end && start % BLOCK) {
    include(start, true);
    include(start++, false);
  }
  while (end > start && end % BLOCK) {
    --end;
    include(end, true);
    include(end, false);
  }
  let l = index.leaves + start / BLOCK,
    r = index.leaves + end / BLOCK;
  while (l < r) {
    if (l & 1) {
      include(index.min[l], true);
      include(index.max[l++], false);
    }
    if (r & 1) {
      --r;
      include(index.min[r], true);
      include(index.max[r], false);
    }
    l = Math.floor(l / 2);
    r = Math.floor(r / 2);
  }
  return [min, max];
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
    const [min, max] = rangeExtrema(s, i, Math.min(b, i + step));
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
