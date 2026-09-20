import { compareGeometry, type ScanGeometry } from "@/lib/scan-geometry";
export function GeometryComparison({
  scans,
}: {
  scans: { label: string; geometry?: ScanGeometry }[];
}) {
  const reference = scans[0]?.geometry;
  const format = (values: number[] | undefined) =>
    values?.length
      ? values
          .map((v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : "Invalid"))
          .join(" × ")
      : "Unavailable";
  return (
    <section className="acquisition-comparison" aria-label="Scan geometry">
      <p>
        Image-header geometry in RAS axis order. Matching grids do not prove
        anatomical alignment. Relative slice linking follows proportions of each
        volume, not the same anatomical location.
      </p>
      <table>
        <thead>
          <tr>
            <th>Geometry</th>
            {scans.map((scan, i) => (
              <th key={i}>{scan.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Voxel counts</th>
            {scans.map((s, i) => (
              <td key={i}>{format(s.geometry?.dimensions)}</td>
            ))}
          </tr>
          <tr>
            <th>Voxel spacing</th>
            {scans.map((s, i) => (
              <td key={i}>
                {format(s.geometry?.spacing)} {s.geometry?.units}
              </td>
            ))}
          </tr>
          <tr>
            <th>Field of view along grid axes</th>
            {scans.map((s, i) => (
              <td key={i}>
                {format(s.geometry?.coverage)} {s.geometry?.units}
              </td>
            ))}
          </tr>
          <tr>
            <th>First voxel centre (R, A, S)</th>
            {scans.map((s, i) => (
              <td key={i}>
                {format(s.geometry?.origin)} {s.geometry?.units}
              </td>
            ))}
          </tr>
          <tr>
            <th>Compared with first scan</th>
            {scans.map((s, i) => (
              <td key={i}>
                {!s.geometry
                  ? "Not loaded"
                  : s.geometry.issues.length
                    ? s.geometry.issues.join(" ")
                    : !reference
                      ? "Reference not loaded"
                      : i === 0
                        ? "Reference grid"
                        : compareGeometry(reference, s.geometry).join("; ") ||
                          "Same grid within tolerance; alignment unverified"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <small>
        Tolerances: spacing 0.01 mm; origin and field of view 0.1 mm; direction
        components 0.001. Field of view includes full voxel widths.
      </small>
    </section>
  );
}
