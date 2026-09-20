type Converter = {
  worker: Worker | null;
  init: () => Promise<unknown>;
  input: (files: File[]) => { run: () => Promise<File[]> };
};
type ConverterClass = new () => Converter;
let pending: Promise<ConverterClass> | undefined;
export function loadDicomConverter(): Promise<ConverterClass> {
  const target = window as Window & { NMRViewDcm2niix?: ConverterClass };
  if (target.NMRViewDcm2niix) return Promise.resolve(target.NMRViewDcm2niix);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/vendor/dcm2niix/bridge.js";
    script.onload = () => {
      if (target.NMRViewDcm2niix) resolve(target.NMRViewDcm2niix);
      else {
        pending = undefined;
        reject(new Error("DICOM converter failed to initialize."));
      }
    };
    script.onerror = () => {
      script.remove();
      pending = undefined;
      reject(new Error("Could not load the local DICOM converter."));
    };
    document.head.appendChild(script);
  });
  return pending;
}
