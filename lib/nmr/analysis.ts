import { correctedY, type Spectrum } from "./spectrum.ts";
export type Interval = [number, number];
function indices(s: Spectrum, range: Interval) {
  if (!range.every(Number.isFinite) || range[0] >= range[1])
    throw new Error("Specify an increasing ppm interval.");
  const ids: number[] = [];
  for (let i = 0; i < s.x.length; i++)
    if (s.x[i] + s.shift >= range[0] && s.x[i] + s.shift <= range[1])
      ids.push(i);
  if (ids.length < 3)
    throw new Error("The interval must contain at least three samples.");
  return ids;
}
export function quality(s: Spectrum, signal: Interval, noise: Interval) {
  const a = indices(s, signal),
    b = indices(s, noise);
  if (signal[0] <= noise[1] && noise[0] <= signal[1])
    throw new Error("Signal and noise intervals must not overlap.");
  // Least-squares detrending avoids counting a constant/linear baseline as noise.
  const xm = b.reduce((v, i) => v + s.x[i], 0) / b.length,
    ym = b.reduce((v, i) => v + correctedY(s, i), 0) / b.length;
  let xy = 0,
    xx = 0;
  for (const i of b) {
    xy += (s.x[i] - xm) * (correctedY(s, i) - ym);
    xx += (s.x[i] - xm) ** 2;
  }
  const slope = xy / xx;
  const sigma = Math.sqrt(
    b.reduce(
      (v, i) => v + (correctedY(s, i) - ym - slope * (s.x[i] - xm)) ** 2,
      0,
    ) /
      (b.length - 2),
  );
  const net = (i: number) => correctedY(s, i) - ym - slope * (s.x[i] - xm);
  const peak = a.reduce((best, i) => (net(i) > net(best) ? i : best), a[0]);
  const amplitude = net(peak),
    half = amplitude / 2;
  let l = peak,
    r = peak;
  while (l > a[0] && net(l) > half) l--;
  while (r < a.at(-1)! && net(r) > half) r++;
  const crossing = (i: number, j: number) =>
    s.x[i] + ((half - net(i)) * (s.x[j] - s.x[i])) / (net(j) - net(i));
  const width =
    amplitude > 0 && l < peak && r > peak && net(l) <= half && net(r) <= half
      ? crossing(r - 1, r) - crossing(l, l + 1)
      : null;
  return {
    signal,
    noise,
    noiseSamples: b.length,
    signalSamples: a.length,
    noiseSD: sigma,
    peakPPM: s.x[peak] + s.shift,
    amplitude,
    snr: sigma > 0 && amplitude > 0 ? amplitude / sigma : null,
    fwhmPPM: width,
    fwhmHz:
      width !== null && s.frequency && s.frequency > 0
        ? width * s.frequency
        : null,
    method:
      "Positive peak above a baseline extrapolated from least-squares detrended noise; SNR = peak / noise sample SD (n−2); FWHM uses interpolated half-height crossings. Overlap and non-noise signal can bias results.",
  };
}
export function couplings(ppm: number[], frequency: number | null) {
  if (!frequency || !Number.isFinite(frequency) || frequency <= 0) return [];
  const p = [...ppm].sort((a, b) => a - b);
  return p
    .slice(1)
    .map((v, i) => ({ from: p[i], to: v, hz: (v - p[i]) * frequency }));
}
export function alignment(
  s: Spectrum,
  reference: Spectrum,
  range: Interval,
  maxShift: number,
) {
  if (s.nucleus === "Unknown" || s.nucleus !== reference.nucleus)
    throw new Error("Alignment requires matching, known nuclei.");
  if (!Number.isFinite(maxShift) || maxShift <= 0 || maxShift > 1)
    throw new Error("Maximum alignment shift must be between 0 and 1 ppm.");
  const candidates = indices(s, range);
  const ids = candidates.filter(
    (_, i) => i % Math.max(1, Math.ceil(candidates.length / 2048)) === 0,
  );
  function sample(x: number) {
    const target = x - reference.shift;
    let l = 0,
      r = reference.x.length - 1;
    if (target < reference.x[l] || target > reference.x[r]) return null;
    while (r - l > 1) {
      const m = (l + r) >> 1;
      if (reference.x[m] < target) l = m;
      else r = m;
    }
    const t = (target - reference.x[l]) / (reference.x[r] - reference.x[l]);
    return correctedY(reference, l) * (1 - t) + correctedY(reference, r) * t;
  }
  // Use the same points at every lag so edge overlap cannot improve a score.
  const valid = ids.filter(
    (i) =>
      sample(s.x[i] + s.shift - maxShift) !== null &&
      sample(s.x[i] + s.shift + maxShift) !== null,
  );
  if (valid.length < 16)
    throw new Error(
      "Alignment needs at least 16 overlapping samples with room for the requested shift.",
    );
  let best = -Infinity,
    delta = 0;
  for (let k = -100; k <= 100; k++) {
    const d = (k * maxShift) / 100;
    let ax = 0,
      ay = 0,
      xx = 0,
      yy = 0,
      xy = 0;
    for (const i of valid) {
      const a = correctedY(s, i),
        b = sample(s.x[i] + s.shift + d)!;
      ax += a;
      ay += b;
      xx += a * a;
      yy += b * b;
      xy += a * b;
    }
    const n = valid.length,
      den = Math.sqrt(
        Math.max(0, xx - (ax * ax) / n) * Math.max(0, yy - (ay * ay) / n),
      );
    const score = den > 0 ? (xy - (ax * ay) / n) / den : -Infinity;
    if (score > best) {
      best = score;
      delta = d;
    }
  }
  if (!Number.isFinite(best))
    throw new Error("The alignment region has no usable variation.");
  return {
    shift: delta,
    correlation: best,
    atBoundary: Math.abs(delta) >= maxShift * 0.99,
  };
}

export function waterRegionRatio(
  s: Spectrum,
  water: Interval,
  signal: Interval,
) {
  const signalIds = indices(s, signal),
    waterIds = indices(s, water);
  if (water[0] <= signal[1] && signal[0] <= water[1])
    throw new Error("Water and signal intervals must not overlap.");
  const peak = (ids: number[]) =>
    ids.reduce((max, i) => Math.max(max, Math.abs(correctedY(s, i))), 0);
  const reference = peak(signalIds);
  return {
    water,
    signal,
    waterPeak: peak(waterIds),
    signalPeak: reference,
    ratio: reference > 0 ? peak(waterIds) / reference : null,
    method:
      "Absolute peak intensity ratio on corrected data; user-defined water window. This is not a fitted water concentration or an automatic quality verdict.",
  };
}
