import ImportWorker from "./import.worker?worker";
import type { Spectrum, validateSession } from "./spectrum";

type Input = { file: Blob; name: string; source?: string };
// A short-lived worker isolates parsing/JSON validation and releases parser
// scratch memory after import. Files are read inside the worker, not by React.
function runImport<T>(kind: "spectra" | "session", files: Input[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new ImportWorker();
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Spectrum import timed out. Try a smaller file."));
    }, 120000);
    worker.onmessage = ({ data }) => {
      cleanup();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Spectrum import worker failed. Please reload and try again.",
        ),
      );
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("Could not read the imported spectrum."));
    };
    worker.postMessage({ kind, files });
  });
}
export function importSpectraFiles(files: Input[]) {
  return runImport<Spectrum[]>("spectra", files);
}
export function importSpectraSession(file: File) {
  return runImport<ReturnType<typeof validateSession>>("session", [
    { file, name: file.name },
  ]);
}
