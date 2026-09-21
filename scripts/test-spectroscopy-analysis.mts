import assert from "node:assert/strict";
import { quality, alignment, couplings } from "../lib/nmr/analysis.ts";
import { parseSpectrum } from "../lib/nmr/spectrum.ts";
import { parseBasis, fitBasis } from "../lib/nmr/basis.ts";
import {
  fft,
  readMRS,
  mrsSpectrum,
  defaultProcessing,
} from "../lib/nmr/mrs.ts";
import { parse2D } from "../lib/nmr/two-d.ts";
const x = Array.from({ length: 2001 }, (_, i) => i / 200),
  gauss = (v: number, c = 5) => Math.exp(-(((v - c) / 0.2) ** 2) / 2);
const s = parseSpectrum(
  "ppm,intensity\n" +
    x.map((v, i) => `${v},${gauss(v) + 0.001 * Math.sin(i * 2.13)}`).join("\n"),
  "synthetic",
)[0];
s.nucleus = "1H";
s.frequency = 400;
const q = quality(s, [4, 6], [0, 1]);
assert(q.snr! > 1000);
assert(Math.abs(q.fwhmPPM! - 0.47096) < 0.003);
assert(Math.abs(q.fwhmHz! - 188.38) < 2);
assert.throws(() => quality(s, [0, 2], [1, 3]));
assert.equal(couplings([1, 1.01], 400)[0].hz.toFixed(3), "4.000");
const shifted = { ...s, x: s.x.map((v) => v + 0.03) };
const align = alignment(shifted, s, [4, 6], 0.1);
assert(Math.abs(align.shift + 0.03) < 0.002);
assert(align.correlation > 0.99);
const re = Float64Array.from({ length: 64 }, (_, i) =>
    Math.cos((2 * Math.PI * 5 * i) / 64),
  ),
  im = Float64Array.from({ length: 64 }, (_, i) =>
    Math.sin((2 * Math.PI * 5 * i) / 64),
  );
fft(re, im);
assert(Math.abs(re[5] - 64) < 1e-8);
assert(Math.abs(re[59]) < 1e-8);
const bx = x.filter((v) => v >= 3 && v <= 7),
  b = parseBasis({
    format: "nmrview-basis-1",
    name: "Synthetic test only",
    source: "Analytical Gaussian fixture",
    nucleus: "1H",
    frequencyMHz: 400,
    sequence: "TEST",
    echoTimeSeconds: 0.03,
    x: bx,
    components: [
      { name: "A", y: bx.map((v) => gauss(v, 4)) },
      { name: "B", y: bx.map((v) => gauss(v, 6)) },
    ],
  });
const obs = {
  ...s,
  x: bx,
  y: bx.map((v) => 3 * gauss(v, 4) + 2 * gauss(v, 6) + 0.1 + 0.02 * v),
};
const fit = fitBasis(obs, b, [3, 7]);
assert(Math.abs(fit.components[0].amplitude - 3) < 1e-5);
assert(Math.abs(fit.components[1].amplitude - 2) < 1e-5);
assert(fit.rmse < 1e-6);
assert.throws(() => fitBasis({ ...obs, nucleus: "13C" }, b, [3, 7]));
assert.throws(() =>
  fitBasis(
    obs,
    {
      ...b,
      components: [
        b.components[0],
        { ...b.components[0], name: "Duplicate shape" },
      ],
    },
    [3, 7],
  ),
);
const grid = parse2D(
  "f2_ppm,f1_ppm,intensity\n1,2,3\n2,2,4\n1,3,5\n2,3,6",
  "test",
  "synthetic",
);
assert.deepEqual(grid.z, [
  [3, 4],
  [5, 6],
]);
assert.throws(() =>
  parse2D("f2_ppm,f1_ppm,intensity\n1,2,3\n1,2,4", "bad", "synthetic"),
);
// Independent binary fixture, with a complex tone at +16 Hz (decreasing ppm).
const n = 256,
  ext = JSON.stringify({
    SpectrometerFrequency: [100],
    ResonantNucleus: ["1H"],
  }),
  esize = Math.ceil((8 + ext.length) / 16) * 16,
  offset = 352 + esize,
  buf = new ArrayBuffer(offset + n * 8),
  v = new DataView(buf);
v.setInt32(0, 348, true);
[4, 1, 1, 1, n, 1, 1, 1].forEach((d, i) => v.setInt16(40 + 2 * i, d, true));
v.setInt16(70, 32, true);
v.setInt16(72, 64, true);
[1, 10, 10, 10, 1 / 256, 1, 1, 1].forEach((d, i) =>
  v.setFloat32(76 + 4 * i, d, true),
);
v.setFloat32(108, offset, true);
v.setUint8(123, 10);
v.setInt16(254, 1, true);
[1, 0, 0, 10, 0, 1, 0, 20, 0, 0, 1, 30].forEach((a, i) =>
  v.setFloat32(280 + 4 * i, a, true),
);
new Uint8Array(buf).set(new TextEncoder().encode("mrs_v0_2"), 328);
new Uint8Array(buf).set([110, 43, 49, 0], 344);
v.setUint8(348, 1);
v.setInt32(352, esize, true);
v.setInt32(356, 44, true);
new Uint8Array(buf).set(new TextEncoder().encode(ext), 360);
for (let i = 0; i < n; i++) {
  v.setFloat32(offset + i * 8, Math.cos((2 * Math.PI * 16 * i) / 256), true);
  v.setFloat32(
    offset + i * 8 + 4,
    Math.sin((2 * Math.PI * 16 * i) / 256),
    true,
  );
}
const d = await readMRS(new Blob([buf]), "fixture", "synthetic");
const out = mrsSpectrum(d, [0, 0, 0, 0, 0, 0], defaultProcessing);
const k = out.y.indexOf(Math.max(...out.y));
assert(Math.abs(out.x[k] - (4.65 - 0.16)) < 1e-8);
assert(d.info.localized);
assert.throws(() => mrsSpectrum(d, [1, 0, 0, 0, 0, 0], defaultProcessing));
v.setUint8(123, 0);
await assert.rejects(readMRS(new Blob([buf]), "fixture", "synthetic"), /units/);
const legacy = await readMRS(new Blob([buf]), "fixture", "synthetic", true);
assert(legacy.info.metadata.NMRViewUnitOverride);
console.log(
  "Spectroscopy QA: quality, alignment, peak spacing, FFT sign, basis coefficients/degeneracy, 2D grids, NIfTI-MRS axis/units and voxel bounds passed.",
);
const { correctedY, extent, validateSession } =
  await import("../lib/nmr/spectrum.ts");
const complex = parseSpectrum(
  "ppm,real,imaginary\n3,0,3\n2,0,2\n1,0,1",
  "complex",
)[0];
complex.phase = [90, 0];
assert(Math.abs(correctedY(complex, 0) + 1) < 1e-12);
assert(Math.abs(extent(complex).min + 3) < 1e-12);
complex.phase = [-90, 0];
assert(Math.abs(extent(complex).max - 3) < 1e-12);
const restored = validateSession({
  format: "nmrview-spectra-1",
  spectra: [complex],
  peaks: [],
  integrals: [],
});
assert.deepEqual(restored.spectra[0].imaginary, [1, 2, 3]);
assert.deepEqual(restored.spectra[0].phase, [-90, 0]);
// NIfTI-2 qform-only geometry (the library's raw affine is all zero in this case).
const e2 = Math.ceil((ext.length + 8) / 16) * 16,
  o2 = 544 + e2,
  b2 = new ArrayBuffer(o2 + n * 8),
  v2 = new DataView(b2);
v2.setInt32(0, 540, true);
new Uint8Array(b2).set([110, 43, 50, 0, 13, 10, 26, 10], 4);
v2.setInt16(12, 32, true);
v2.setInt16(14, 64, true);
[4, 1, 1, 1, n, 1, 1, 1].forEach((d, i) =>
  v2.setBigInt64(16 + 8 * i, BigInt(d), true),
);
[1, 10, 20, 30, 1 / 256, 1, 1, 1].forEach((d, i) =>
  v2.setFloat64(104 + 8 * i, d, true),
);
v2.setBigInt64(168, BigInt(o2), true);
v2.setInt32(344, 1, true);
v2.setFloat64(376, 11, true);
v2.setFloat64(384, 22, true);
v2.setFloat64(392, 33, true);
v2.setInt32(500, 10, true);
new Uint8Array(b2).set(new TextEncoder().encode("mrs_v0_2"), 508);
v2.setUint8(540, 1);
v2.setInt32(544, e2, true);
v2.setInt32(548, 44, true);
new Uint8Array(b2).set(new TextEncoder().encode(ext), 552);
const m2 = await readMRS(new Blob([b2]), "qform2", "synthetic");
assert(m2.info.localized);
assert.deepEqual(m2.info.affine, [
  [10, 0, 0, 11],
  [0, 20, 0, 22],
  [0, 0, 30, 33],
  [0, 0, 0, 1],
]);
console.log("Complex phase/session and NIfTI-2 qform geometry passed.");
const { fitMRSMap } = await import("../lib/nmr/mrs-map.ts");
const processed = mrsSpectrum(d, [0, 0, 0, 0, 0, 0], defaultProcessing);
const mb = parseBasis({
  format: "nmrview-basis-1",
  name: "Synthetic FFT tone",
  source: "Analytical fixture",
  nucleus: "1H",
  frequencyMHz: 100,
  echoTimeSeconds: 0,
  sequence: "TEST",
  x: processed.x,
  components: [{ name: "Tone", y: processed.y }],
});
const mr = fitMRSMap(
  d,
  mb,
  [0, 0, 0, 0, 0, 0],
  defaultProcessing,
  [processed.x[0], processed.x.at(-1)!],
  "Tone",
  "",
);
assert(mr.valid[0]);
assert(Math.abs(mr.values[0] - 1) < 1e-5);
const invalidRatio = fitMRSMap(
  d,
  mb,
  [0, 0, 0, 0, 0, 0],
  defaultProcessing,
  [processed.x[0], processed.x.at(-1)!],
  "Tone",
  "Missing",
);
assert.equal(invalidRatio.valid[0], false);
assert.equal(invalidRatio.values[0], 0);
const { acquisitionMetadata } = await import("../lib/nmr/mrs.ts");
const variable = {
  ...d.info,
  dims: [1, 1, 1, 256, 2, 1, 1],
  metadata: {
    ...d.info.metadata,
    dim_5_header: { EchoTime: { start: 0.02, increment: 0.01 } },
  },
};
assert.equal(acquisitionMetadata(variable, [0, 0, 0, 1, 0, 0]).EchoTime, 0.03);
console.log(
  "Map fitting, denominator masking and acquisition-specific metadata passed.",
);
const small=fitBasis({...obs,y:obs.y.map(v=>v*1e-12)},b,[3,7]);assert(Math.abs(small.components[0].amplitude/3e-12-1)<1e-5);console.log('Basis fitting is invariant to small signal scaling.');
