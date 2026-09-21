import { readHeader } from "nifti-reader-js";
import { COLORS, type Spectrum } from "./spectrum.ts";
export type MRSInfo = {
  name: string;
  source: string;
  dims: number[];
  dwell: number;
  frequency: number;
  nucleus: string;
  affine: number[][];
  localized: boolean;
  metadata: Record<string, unknown>;
};
export type MRSData = { info: MRSInfo; raw: Float64Array };
export type Processing = {
  phase0: number;
  phase1: number;
  broadening: number;
  reference: number;
  shift: number;
};
export const defaultProcessing: Processing = {
  phase0: 0,
  phase1: 0,
  broadening: 0,
  reference: 4.65,
  shift: 0,
};
export async function readMRS(
  blob: Blob,
  name: string,
  source: string,
  assumeUnits = false,
): Promise<MRSData> {
  if (blob.size > 64 * 1024 * 1024)
    throw new Error("MRS download exceeds 64 MB.");
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] === 31 && bytes[1] === 139) {
    const reader = blob
      .stream()
      .pipeThrough(new DecompressionStream("gzip"))
      .getReader();
    let total = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 128 * 1024 * 1024)
          throw new Error("Expanded MRS exceeds 128 MB.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    bytes = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      bytes.set(c, pos);
      pos += c.length;
    }
  }
  if (bytes.byteLength > 128 * 1024 * 1024)
    throw new Error("Expanded MRS exceeds 128 MB.");
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const h = readHeader(buf);
  if (
    !/^mrs_v\d+_\d+/.test(h.intent_name) ||
    ![32, 1792].includes(h.datatypeCode)
  )
    throw new Error(
      "Expected complex NIfTI-MRS data, not an anatomical NIfTI image.",
    );
  const ex = h.extensions.find((e) => e.ecode === 44);
  if (!ex || ex.edata.byteLength > 1024 * 1024)
    throw new Error("Missing or oversized NIfTI-MRS metadata extension.");
  const metadata = JSON.parse(
    new TextDecoder().decode(ex.edata).replace(/\0+$/, ""),
  );
  if (
    Array.isArray(metadata.kSpace) &&
    metadata.kSpace.some((v: unknown) => v === true)
  )
    throw new Error(
      "Spatial k-space MRS must be reconstructed before viewing.",
    );
  const frequency = metadata.SpectrometerFrequency?.[0],
    nucleus = metadata.ResonantNucleus?.[0];
  if (
    !Number.isFinite(frequency) ||
    frequency <= 0 ||
    typeof nucleus !== "string"
  )
    throw new Error("Missing spectrometer frequency or resonant nucleus.");
  const timeScale: Record<number, number> = { 8: 1, 16: 0.001, 24: 0.000001 };
  const dwell =
    h.pixDims[4] *
    (timeScale[h.xyzt_units & 56] ||
      (assumeUnits && (h.xyzt_units & 56) === 0 ? 1 : NaN));
  if (!Number.isFinite(dwell) || dwell <= 0)
    throw new Error("MRS dwell time and time units must be valid.");
  const dims = Array.from({ length: 7 }, (_, i) =>
    i < h.dims[0] ? h.dims[i + 1] : 1,
  );
  if (
    h.dims[0] < 4 ||
    dims.some((v) => !Number.isSafeInteger(v) || v < 1) ||
    dims[3] < 16 ||
    dims[3] > 65536
  )
    throw new Error(
      "Invalid MRS dimensions (16–65,536 FID samples supported).",
    );
  const count = dims.reduce((a, b) => a * b, 1),
    size = h.datatypeCode === 32 ? 4 : 8;
  if (
    count > 8_000_000 ||
    !Number.isSafeInteger(h.vox_offset) ||
    h.vox_offset < 352 ||
    h.vox_offset + count * size * 2 > buf.byteLength
  )
    throw new Error(
      "Truncated or oversized MRS data (8 million complex samples maximum).",
    );
  const view = new DataView(buf),
    raw = new Float64Array(count * 2);
  const slope = h.scl_slope || 1,
    intercept = h.scl_slope ? h.scl_inter : 0;
  if (intercept !== 0)
    throw new Error(
      "Complex MRS with nonzero scaling intercept is not supported.",
    );
  for (let i = 0; i < raw.length; i++) {
    raw[i] =
      (size === 4
        ? view.getFloat32(h.vox_offset + i * size, h.littleEndian)
        : view.getFloat64(h.vox_offset + i * size, h.littleEndian)) * slope;
    if (!Number.isFinite(raw[i]))
      throw new Error("MRS contains nonfinite data.");
  }
  const spaceScale: Record<number, number> = { 1: 1000, 2: 1, 3: 0.001 },
    scale =
      spaceScale[h.xyzt_units & 7] ||
      (assumeUnits && (h.xyzt_units & 7) === 0 ? 1 : NaN);
  if (assumeUnits && (!(h.xyzt_units & 56) || !(h.xyzt_units & 7)))
    metadata.NMRViewUnitOverride =
      "Operator explicitly assumed seconds and millimetres for missing units";
  // Prefer sform like the MRI renderer; nifti-reader-js 0.8 does not populate
  // NIfTI-2 qform-only affines, so resolve that explicitly.
  const nifti1 = view.getInt32(0, h.littleEndian) === 348;
  const rawAffine =
    h.sform_code > 0
      ? Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 4 }, (_, c) =>
            r === 3
              ? Number(c === 3)
              : nifti1
                ? view.getFloat32(280 + 4 * (r * 4 + c), h.littleEndian)
                : view.getFloat64(400 + 8 * (r * 4 + c), h.littleEndian),
          ),
        )
      : h.getQformMat();
  const affine = rawAffine.map((r, i) =>
    r.map((v) => (i < 3 ? v * (scale || 1) : v)),
  );
  const a = affine;
  const det =
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const localized =
    !!scale &&
    Math.abs(det) > 1e-12 &&
    (h.qform_code > 0 || h.sform_code > 0) &&
    affine.flat().every(Number.isFinite) &&
    h.pixDims.slice(1, 4).every((v) => v * scale > 0 && v * scale < 10000);
  return {
    info: {
      name,
      source,
      dims,
      dwell,
      frequency,
      nucleus,
      affine,
      localized,
      metadata,
    },
    raw,
  };
}
// Radix-2 forward DFT, negative exponential, matching the NIfTI-MRS convention.
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  if (n !== im.length || n < 2 || n & (n - 1))
    throw new Error("FFT length must be a power of two.");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < len / 2; j++) {
        const c = Math.cos(a * j),
          s = Math.sin(a * j),
          k = i + j,
          m = k + len / 2,
          tr = re[m] * c - im[m] * s,
          ti = re[m] * s + im[m] * c;
        re[m] = re[k] - tr;
        im[m] = im[k] - ti;
        re[k] += tr;
        im[k] += ti;
      }
    }
  }
}
export function mrsSpectrum(
  d: MRSData,
  selection: number[],
  p: Processing,
): Spectrum {
  const { info, raw } = d,
    dim = info.dims;
  if (
    selection.length !== 6 ||
    selection.some(
      (v, i) => !Number.isInteger(v) || v < 0 || v >= dim[i < 3 ? i : i + 1],
    )
  )
    throw new Error("MRS voxel or acquisition index out of range.");
  if (
    Object.values(p).some((v) => !Number.isFinite(v)) ||
    p.broadening < 0 ||
    p.broadening > 100 ||
    Math.abs(p.phase0) > 360 ||
    Math.abs(p.phase1) > 720 ||
    Math.abs(p.reference) > 1000 ||
    Math.abs(p.shift) > 100
  )
    throw new Error("Invalid processing settings.");
  let n = 1;
  while (n < dim[3]) n *= 2;
  const re = new Float64Array(n),
    im = new Float64Array(n),
    spatial = dim[0] * dim[1] * dim[2];
  const v = selection[0] + dim[0] * (selection[1] + dim[1] * selection[2]);
  const frame = selection[3] + dim[4] * (selection[4] + dim[5] * selection[5]);
  for (let t = 0; t < dim[3]; t++) {
    const i = 2 * (v + spatial * (t + dim[3] * frame)),
      weight = Math.exp(-Math.PI * p.broadening * t * info.dwell);
    re[t] = raw[i] * weight;
    im[t] = raw[i + 1] * weight;
  }
  // The first point is half-weighted to remove the constant half-FID baseline.
  re[0] *= 0.5;
  im[0] *= 0.5;
  fft(re, im);
  const x: number[] = [],
    y: number[] = [];
  // Ascending ppm = descending DFT frequency for positive-gyromagnetic nuclei.
  if (!["1H", "13C", "19F", "23NA", "23Na", "31P"].includes(info.nucleus))
    throw new Error(
      "This MRS axis currently supports 1H, 13C, 19F, 23Na and 31P only.",
    );
  for (let j = n - 1; j >= 0; j--) {
    const k = (j + n / 2) % n,
      hz = (j - n / 2) / (n * info.dwell),
      phase = ((p.phase0 + p.phase1 * (j / n - 0.5)) * Math.PI) / 180;
    x.push(p.reference - hz / info.frequency + p.shift);
    y.push((re[k] * Math.cos(phase) - im[k] * Math.sin(phase)) / dim[3]);
  }
  if (y.some((v) => !Number.isFinite(v)))
    throw new Error("Numerical overflow during spectral processing.");
  return {
    id: "mrs-selection",
    name: `${info.name} · voxel ${selection
      .slice(0, 3)
      .map((v) => v + 1)
      .join(",")} · acquisition ${selection
      .slice(3)
      .map((v) => v + 1)
      .join(",")}`,
    x,
    y,
    nucleus: info.nucleus,
    frequency: info.frequency,
    solvent: "Tissue MRS",
    source: info.source,
    color: COLORS[0],
    visible: true,
    opacity: 1,
    gain: 1,
    shift: 0,
    baseline: [0, 0],
  };
}
export function voxelMM(info: MRSInfo, v: number[]) {
  return info.affine
    .slice(0, 3)
    .map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + r[3]);
}

export function acquisitionMetadata(info: MRSInfo, selection: number[]) {
  const result = { ...info.metadata };
  const seen = new Map<string, unknown>();
  for (let dim = 5; dim <= 7; dim++) {
    const header = info.metadata[`dim_${dim}_header`];
    if (!header) continue;
    if (typeof header !== "object" || Array.isArray(header))
      throw new Error("Invalid higher-dimension metadata.");
    for (const [key, values] of Object.entries(header)) {
      // Only fields required by this fitter; other per-frame metadata remain available in the original header.
      if (
        ![
          "EchoTime",
          "SequenceName",
          "SpectrometerFrequency",
          "ResonantNucleus",
        ].includes(key)
      )
        continue;
      const index = selection[dim - 2];
      let value: unknown;
      if (Array.isArray(values) && values.length === info.dims[dim - 1])
        value = values[index];
      else if (
        values &&
        typeof values === "object" &&
        Number.isFinite((values as { start?: number }).start) &&
        Number.isFinite((values as { increment?: number }).increment)
      )
        value =
          (values as { start: number }).start +
          index * (values as { increment: number }).increment;
      else throw new Error(`Cannot resolve acquisition-specific ${key}.`);
      if (
        seen.has(key) &&
        JSON.stringify(seen.get(key)) !== JSON.stringify(value)
      )
        throw new Error(`Ambiguous acquisition-specific ${key}.`);
      seen.set(key, value);
      result[key] = value;
    }
  }
  return result;
}
