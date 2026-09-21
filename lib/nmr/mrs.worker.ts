import { fitMRSMap } from "./mrs-map";
import { parseBasis, fitBasis } from "./basis";
import { readMRS, mrsSpectrum, type MRSData } from "./mrs";
let data: MRSData | null = null;
self.onmessage = async ({ data: m }) => {
  try {
    if (m.kind === "load") {
      data = await readMRS(m.file, m.name, m.source, m.assumeUnits);
      self.postMessage({ id: m.id, result: data.info });
    } else if (m.kind === "spectrum" && data)
      self.postMessage({
        id: m.id,
        result: mrsSpectrum(data, m.selection, m.processing),
      });
    else if (m.kind === "fit" && data)
      self.postMessage({
        id: m.id,
        result: fitBasis(
          mrsSpectrum(data, m.selection, m.processing),
          parseBasis(m.basis),
          m.range,
        ),
      });
    else if (m.kind === "map" && data) {
      self.postMessage({
        id: m.id,
        result: fitMRSMap(
          data,
          parseBasis(m.basis),
          m.selection,
          m.processing,
          m.range,
          m.component,
          m.denominator,
        ),
      });
    } else throw new Error("Load an MRS acquisition first.");
  } catch (e) {
    self.postMessage({ id: m.id, error: (e as Error).message });
  }
};
