import { fitBasis, type Basis } from "./basis.ts";
import { mrsSpectrum, type MRSData, type Processing } from "./mrs.ts";
export function fitMRSMap(
  data: MRSData,
  basis: Basis,
  selection: number[],
  processing: Processing,
  range: [number, number],
  component: string,
  denominator: string,
) {
  const b = basis,
    [nx, ny] = data.info.dims;
  if (nx * ny > 256)
    throw new Error("Map fitting is limited to 256 voxels per slice.");
  const values: number[] = [],
    errors: number[] = [],
    valid: boolean[] = [];
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      try {
        const f = fitBasis(
          mrsSpectrum(data, [x, y, ...selection.slice(2)], processing),
          b,
          range,
        );
        const c = f.components.find((v) => v.name === component);
        const den = denominator
          ? f.components.find((v) => v.name === denominator)
          : null;
        if (
          !c ||
          c.amplitude <= 0 ||
          c.standardError === null ||
          c.amplitude < 3 * c.standardError ||
          (denominator &&
            (!den ||
              den.standardError === null ||
              den.amplitude <= 3 * den.standardError))
        )
          throw new Error("Below three standard errors");
        values.push(den ? c.amplitude / den.amplitude : c.amplitude);
        errors.push(f.rmse);
        valid.push(true);
      } catch {
        values.push(0);
        errors.push(0);
        valid.push(false);
      }
    }

  return {
    values,
    errors,
    valid,
    nx,
    ny,
    component,
    denominator,
    z: selection[2],
  };
}
