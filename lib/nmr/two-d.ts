import { convert } from "jcampconverter";
export type Spectrum2D = {
  name: string;
  source: string;
  x: number[];
  y: number[];
  z: number[][];
};
export function parse2D(
  text: string,
  name: string,
  source: string,
): Spectrum2D {
  let x: number[] = [],
    y: number[] = [],
    z: number[][] = [];
  if (/^\s*##/m.test(text)) {
    const r = convert(text, {
      noContour: true,
      keepSpectra: true,
      keepRecordsRegExp: /.*/,
    });
    const e = r.flatten.find((v) => v.twoD) as
      | ((typeof r.flatten)[number] & {
          minMax?: {
            z: number[][];
            minX: number;
            maxX: number;
            minY: number;
            maxY: number;
          };
        })
      | undefined;
    if (!e?.minMax?.z) throw new Error("No processed 2D JCAMP matrix found.");
    const independent =
      e.ntuples?.vartype
        ?.map((v, i) => (/INDEPENDENT/i.test(v) ? i : -1))
        .filter((i) => i >= 0) ?? [];
    if (
      independent.length !== 2 ||
      independent.some((i) => e.ntuples.units?.[i]?.toUpperCase() !== "PPM")
    )
      throw new Error(
        "Both 2D JCAMP axes must explicitly use ppm. Export ppm axes from your acquisition software.",
      );
    const m = e.minMax;
    z = m.z;
    x = Array.from(
      { length: z[0].length },
      (_, i) => m.minX + (i * (m.maxX - m.minX)) / (z[0].length - 1),
    );
    y = Array.from(
      { length: z.length },
      (_, i) => m.minY + (i * (m.maxY - m.minY)) / (z.length - 1),
    );
  } else {
    const rows = text.trim().split(/\r?\n/);
    if (!/^f2_ppm[,\t;]f1_ppm[,\t;]intensity$/i.test(rows[0].trim()))
      throw new Error("2D CSV header must be f2_ppm,f1_ppm,intensity.");
    const values = rows
      .slice(1)
      .filter((v) => v.trim())
      .map((v) =>
        v
          .trim()
          .split(/[,\t;]/)
          .map(Number),
      );
    if (
      values.length > 1_000_000 ||
      values.some((v) => v.length !== 3 || v.some((n) => !Number.isFinite(n)))
    )
      throw new Error(
        "Invalid 2D matrix values or more than one million cells.",
      );
    x = [...new Set(values.map((v) => v[0]))].sort((a, b) => a - b);
    y = [...new Set(values.map((v) => v[1]))].sort((a, b) => a - b);
    if (x.length * y.length !== values.length)
      throw new Error("2D CSV must contain a complete rectangular grid.");
    const xi = new Map(x.map((v, i) => [v, i])),
      yi = new Map(y.map((v, i) => [v, i]));
    z = y.map(() => Array(x.length).fill(NaN));
    for (const [a, b, c] of values) {
      const i = yi.get(b)!,
        j = xi.get(a)!;
      if (Number.isFinite(z[i][j]))
        throw new Error("Duplicate 2D coordinates.");
      z[i][j] = c;
    }
  }
  if (
    x.length < 2 ||
    y.length < 2 ||
    x.length * y.length > 1_000_000 ||
    x.at(-1)! <= x[0] ||
    y.at(-1)! <= y[0] ||
    z.some((r) => r.length !== x.length || r.some((v) => !Number.isFinite(v)))
  )
    throw new Error("Invalid or oversized 2D spectrum.");
  // Canvas cell placement requires uniform spacing; reject, never warp nonuniform grids.
  for (const a of [x, y]) {
    const d = (a.at(-1)! - a[0]) / (a.length - 1);
    if (a.some((v, i) => Math.abs(v - a[0] - i * d) > Math.abs(d) * 1e-4))
      throw new Error("2D axes must be uniformly spaced.");
  }
  return { name, source, x, y, z };
}
