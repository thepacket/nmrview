export type ScanGeometry = {
  dimensions: number[];
  spacing: number[];
  origin: number[];
  directions: number[][];
  coverage: number[];
  units: string;
  issues: string[];
};
/** RAS-ordered voxel grid: origin and the next voxel centre on each axis. */
export function scanGeometry(
  dimensions: number[],
  points: number[][],
  spatialUnits: number,
): ScanGeometry {
  const factor = ({ 1: 1000, 2: 1, 3: 0.001 } as Record<number, number>)[
    spatialUnits & 7
  ];
  const units = factor ? "mm" : "unspecified units";
  const issues: string[] = [];
  if (!factor)
    issues.push(
      "Spatial units are not declared; physical measurements cannot be verified.",
    );
  if (
    dimensions.length !== 3 ||
    dimensions.some((n) => !Number.isInteger(n) || n < 1)
  )
    issues.push("Invalid image dimensions.");
  const valid =
    points.length === 4 &&
    points.every((p) => p.length === 3 && p.every(Number.isFinite));
  if (!valid)
    return {
      dimensions,
      spacing: [],
      origin: [],
      directions: [],
      coverage: [],
      units,
      issues: [...issues, "Missing or invalid spatial transform."],
    };
  const origin = points[0].map((v) => v * (factor || 1));
  const vectors = points
    .slice(1)
    .map((p) => p.map((v, i) => v * (factor || 1) - origin[i]));
  const spacing = vectors.map((v) => Math.hypot(...v));
  const directions = vectors.map((v, i) => v.map((n) => n / spacing[i]));
  const [a, b, c] = vectors;
  const determinant =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (
    spacing.some((n) => !Number.isFinite(n) || n <= 0) ||
    Math.abs(determinant) < 1e-8
  )
    issues.push("Degenerate spatial transform.");
  return {
    dimensions,
    spacing,
    origin,
    directions,
    coverage: spacing.map((v, i) => v * dimensions[i]),
    units,
    issues,
  };
}
export function compareGeometry(
  reference: ScanGeometry,
  other: ScanGeometry,
): string[] {
  if (reference.issues.length || other.issues.length)
    return ["Geometry cannot be reliably compared."];
  const differences: string[] = [];
  const differs = (a: number[], b: number[], tolerance: number) =>
    a.some((v, i) => Math.abs(v - b[i]) > tolerance);
  if (differs(reference.dimensions, other.dimensions, 0))
    differences.push("Different voxel counts");
  if (differs(reference.spacing, other.spacing, 0.01))
    differences.push("Different voxel spacing");
  if (differs(reference.coverage, other.coverage, 0.1))
    differences.push("Different field of view");
  if (differs(reference.origin, other.origin, 0.1))
    differences.push("Different grid origin");
  if (
    reference.directions.some((axis, i) =>
      differs(axis, other.directions[i], 0.001),
    )
  )
    differences.push("Different grid orientation");
  return differences;
}
