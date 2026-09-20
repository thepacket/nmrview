import { downloadPublic, type RepositoryFile } from "./repositories";
import { prepareComparisonFile } from "./comparison-download";
import { comparisonScanCache } from "./scan-cache";
const blobIds = new WeakMap<Blob, number>();
let nextBlobId = 0;
export function loadComparisonScan(
  file: RepositoryFile,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  if (
    file.size > 128 * 1024 * 1024 ||
    (file.blob?.size || 0) > 128 * 1024 * 1024
  )
    return Promise.reject(
      new Error(
        "This scan exceeds the 128 MB comparison download limit. Choose a smaller scan or use the main viewer.",
      ),
    );
  if (!file.blob && !file.url)
    return Promise.reject(new Error("Scan has no download address."));
  const key = scanKey(file);
  return comparisonScanCache.get(
    key,
    async (downloadSignal, report) => {
      let lastProgress = 0;
      const blob =
        file.blob ||
        (await downloadPublic(
          file.url!,
          128 * 1024 * 1024,
          downloadSignal,
          (bytes, total) => {
            if (performance.now() - lastProgress < 100) return;
            lastProgress = performance.now();
            report(
              `Loading ${(bytes / 1048576).toFixed(1)}${total ? ` / ${(total / 1048576).toFixed(1)}` : ""} MB`,
            );
          },
        ));
      report("Preparing image…");
      return prepareComparisonFile(
        blob,
        file.name.split("/").at(-1)!,
        downloadSignal,
      );
    },
    signal,
    progress,
  );
}

function scanKey(file: RepositoryFile) {
  if (file.blob && !blobIds.has(file.blob))
    blobIds.set(file.blob, ++nextBlobId);
  return JSON.stringify([
    file.blob ? `blob:${blobIds.get(file.blob)}` : file.url,
    file.name,
    file.size,
  ]);
}
export function forgetComparisonScan(file: RepositoryFile) {
  comparisonScanCache.forget(scanKey(file));
}
