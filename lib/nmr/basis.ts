import { z } from "zod";
import { correctedY, type Spectrum } from "./spectrum.ts";
const finite = z.number().finite();
export const basisSchema = z.object({
  format: z.literal("nmrview-basis-1"),
  name: z.string().min(1).max(200),
  source: z.string().min(1).max(2000),
  nucleus: z.string().min(1).max(24),
  frequencyMHz: finite.positive(),
  echoTimeSeconds: finite.nonnegative(),
  sequence: z.string().min(1).max(100),
  x: z.array(finite).min(16).max(8192),
  components: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        y: z.array(finite).min(16).max(8192),
      }),
    )
    .min(1)
    .max(20),
});
export type Basis = z.infer<typeof basisSchema>;
export function parseBasis(value: unknown) {
  const b = basisSchema.parse(value);
  if (
    b.x.some((v, i) => i > 0 && v <= b.x[i - 1]) ||
    b.components.some((c) => c.y.length !== b.x.length) ||
    new Set(b.components.map((c) => c.name)).size !== b.components.length
  )
    throw new Error(
      "Basis needs increasing ppm, equal array lengths and unique component names.",
    );
  return b;
}
export function fitBasis(s: Spectrum, b: Basis, range: [number, number]) {
  if (
    s.nucleus !== b.nucleus ||
    !s.frequency ||
    Math.abs(s.frequency / b.frequencyMHz - 1) > 0.001
  )
    throw new Error("Basis nucleus or spectrometer frequency does not match.");
  if (
    !range.every(Number.isFinite) ||
    range[0] >= range[1] ||
    range[0] < b.x[0] ||
    range[1] > b.x.at(-1)!
  )
    throw new Error("Fit region must lie inside the basis ppm range.");
  const ids: number[] = [];
  for (let i = 0; i < s.x.length; i++)
    if (s.x[i] + s.shift >= range[0] && s.x[i] + s.shift <= range[1])
      ids.push(i);
  if (ids.length < Math.max(32, b.components.length * 8) || ids.length > 8192)
    throw new Error(
      "Fit requires 32–8192 samples and at least eight per component.",
    );
  const x = ids.map((i) => s.x[i] + s.shift),
    y = ids.map((i) => correctedY(s, i));
  const cols = b.components.map((c) =>
    x.map((v) => {
      let l = 0,
        r = b.x.length - 1;
      while (r - l > 1) {
        const m = (l + r) >> 1;
        if (b.x[m] < v) l = m;
        else r = m;
      }
      const t = (v - b.x[l]) / (b.x[r] - b.x[l]);
      return c.y[l] * (1 - t) + c.y[r] * t;
    }),
  );
  cols.push(
    x.map(() => 1),
    x.map((v) => (2 * (v - range[0])) / (range[1] - range[0]) - 1),
  );
  const n = x.length,
    m = cols.length,
    scales = cols.map((c) => Math.sqrt(c.reduce((a, v) => a + v * v, 0)));
  if (scales.some((v) => !Number.isFinite(v) || v < 1e-15))
    throw new Error("A basis component is zero in this region.");
  const a = cols.map((c, j) => c.map((v) => v / scales[j]));
  const gram = a.map((c) =>
    a.map((d) => c.reduce((sum, v, i) => sum + v * d[i], 0)),
  );
  // Invert Gram matrix with pivoting; refuse near-collinear bases rather than invent uncertainty.
  const inv = gram.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let j = 0; j < m; j++) {
    let p = j;
    for (let k = j + 1; k < m; k++)
      if (Math.abs(inv[k][j]) > Math.abs(inv[p][j])) p = k;
    if (Math.abs(inv[p][j]) < 1e-8)
      throw new Error("Basis components are too similar for a stable fit.");
    [inv[p], inv[j]] = [inv[j], inv[p]];
    const v = inv[j][j];
    for (let k = 0; k < 2 * m; k++) inv[j][k] /= v;
    for (let i = 0; i < m; i++)
      if (i !== j) {
        const f = inv[i][j];
        for (let k = 0; k < 2 * m; k++) inv[i][k] -= f * inv[j][k];
      }
  }
  const yScale = y.reduce((a,v)=>Math.max(a,Math.abs(v)),0)||1;
  const coef = Array(m).fill(0),
    residual = y.map(v=>v/yScale);
  let converged = false;
  for (let iter = 0; iter < 3000; iter++) {
    let delta = 0;
    for (let j = 0; j < m; j++) {
      const d = a[j].reduce((sum, v, i) => sum + v * residual[i], 0);
      const next = j < m - 2 ? Math.max(0, coef[j] + d) : coef[j] + d;
      const change = next - coef[j];
      coef[j] = next;
      delta = Math.max(delta, Math.abs(change));
      for (let i = 0; i < n; i++) residual[i] -= a[j][i] * change;
    }
    if (delta < 1e-8 * (1 + Math.max(...coef.map(Math.abs)))) {
      converged = true;
      break;
    }
  }
  if (!converged) throw new Error("Basis fit did not converge.");
  for(let j=0;j<m;j++)coef[j]*=yScale;
  for(let i=0;i<n;i++)residual[i]*=yScale;
  const rss = residual.reduce((s, v) => s + v * v, 0),
    variance = rss / (n - m);
  const components = b.components.map((c, j) => ({
    name: c.name,
    amplitude: coef[j] / scales[j],
    standardError:
      coef[j] > 0
        ? Math.sqrt(Math.max(0, variance * inv[j][m + j])) / scales[j]
        : null,
    y: cols[j].map((v) => (v * coef[j]) / scales[j]),
  }));
  if(!Number.isFinite(rss)||components.some(c=>!Number.isFinite(c.amplitude)||c.y.some(v=>!Number.isFinite(v))))throw new Error("Numerical overflow during fitting; rescale source data and basis.");
  return {
    x,
    observed: y,
    fitted: y.map((v, i) => v - residual[i]),
    residual,
    baseline: x.map(
      (_, i) => a[m - 2][i] * coef[m - 2] + a[m - 1][i] * coef[m - 1],
    ),
    components,
    rmse: Math.sqrt(rss / n),
    method:
      "Nonnegative linear basis amplitudes with unconstrained linear baseline. Fixed basis shapes, no nonlinear frequency/linewidth optimization. Standard errors are conditional OLS approximations, not CRLB or clinical confidence intervals. Amplitudes are arbitrary basis units, not concentrations.",
  };
}
