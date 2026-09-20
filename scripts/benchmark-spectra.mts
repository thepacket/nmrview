import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  correctedY,
  extent,
  lowerBound,
  plotPoints,
  type Spectrum,
} from "../lib/nmr/spectrum.ts";

// Previous full-scan implementation is the correctness oracle and baseline.
function scan(s: Spectrum, lo: number, hi: number, buckets: number) {
  const a = Math.max(0, lowerBound(s.x, lo - s.shift) - 1);
  const b = Math.min(s.x.length, lowerBound(s.x, hi - s.shift) + 1);
  const step = Math.max(1, Math.ceil((b - a) / Math.max(1, buckets)));
  const out: number[] = [];
  for (let i = a; i < b; i += step) {
    let min = i,
      max = i;
    for (let j = i + 1; j < Math.min(b, i + step); j++) {
      if (correctedY(s, j) < correctedY(s, min)) min = j;
      if (correctedY(s, j) > correctedY(s, max)) max = j;
    }
    out.push(
      ...[...new Set([i, min, max, Math.min(b - 1, i + step - 1)])].sort(
        (a, b) => a - b,
      ),
    );
  }
  return out;
}
const count = 2_000_000;
const s: Spectrum = {
  id: "bench",
  name: "Synthetic benchmark",
  x: Array.from({ length: count }, (_, i) => i / 100000),
  y: Array.from(
    { length: count },
    (_, i) => Math.sin(i * 0.001) + (i % 7919 === 0 ? 50 : 0),
  ),
  nucleus: "1H",
  frequency: 600,
  solvent: "",
  source: "Synthetic performance fixture",
  color: "#75dec9",
  visible: true,
  opacity: 1,
  gain: 1,
  shift: 0,
  baseline: [0, 0],
};
let seed = 17;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (const baseline of [
  [0, 0],
  [0.31, -0.5],
  [-0.2, 2],
] as [number, number][]) {
  const changed = { ...s, baseline, shift: 1.25 };
  for (let j = 0; j < 20; j++) {
    const lo = random() * 20,
      hi = lo + random() * (21.25 - lo);
    const buckets = 1 + Math.floor(random() * 1400);
    assert.deepEqual(
      plotPoints(changed, lo, hi, buckets),
      scan(changed, lo, hi, buckets),
    );
  }
}
// Include flat signals (ties), incomplete blocks, tiny ranges and display-only edits.
const flat = { ...s, x: s.x.slice(0, 137), y: Array(137).fill(2) };
for (const buckets of [1, 2, 16, 1000])
  assert.deepEqual(plotPoints(flat, 0, 1, buckets), scan(flat, 0, 1, buckets));
assert.deepEqual(extent({ ...flat, baseline: [0, 3] }), {
  min: -1,
  max: 1e-12,
});
assert.deepEqual(extent({ ...flat, opacity: 0.5 }), { min: 0, max: 2 });
const cold = performance.now();
extent(s);
const buildMs = performance.now() - cold;
function measure(fn: typeof scan) {
  const times: number[] = [];
  for (let i = 0; i < 45; i++) {
    const start = performance.now();
    fn(s, i * 0.01, 19 + i * 0.01, 1200);
    if (i >= 5) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}
const oldMs = measure(scan),
  indexedMs = measure(plotPoints);
console.log(
  JSON.stringify(
    {
      points: count,
      buckets: 1200,
      indexBuildMs: +buildMs.toFixed(2),
      fullScanMedianMs: +oldMs.toFixed(2),
      indexedMedianMs: +indexedMs.toFixed(2),
      speedup: +(oldMs / indexedMs).toFixed(1),
    },
    null,
    2,
  ),
);
console.log(
  "PASS: indexed output exactly matches full scan across zoom, shift, baseline, ties and block boundaries.",
);
