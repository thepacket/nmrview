import {
  downloadPublic,
  supportedFile,
  unpackSpectra,
  type RepositoryFile,
} from "./repositories.ts";
const checks = new Map<string, boolean>();
// Cache verdicts, not scan buffers, so catalog browsing cannot retain large studies.
function remember(key: string, value: boolean) {
  if (checks.size >= 300) checks.delete(checks.keys().next().value!);
  checks.set(key, value);
}
export async function compatibleFiles(
  files: RepositoryFile[],
  mode: "mri" | "nmr",
  signal: AbortSignal,
  firstOnly = false,
  budget = { remaining: 128 * 1024 * 1024 },
): Promise<RepositoryFile[]> {
  const accepted: RepositoryFile[] = [];
  for (const file of files) {
    signal.throwIfAborted();
    const archive = mode === "nmr" && /\.zip$/i.test(file.name);
    if (
      (!supportedFile(file.name, mode) && !archive) ||
      file.size > (mode === "mri" ? 512 : 60) * 1024 * 1024
    )
      continue;
    if (mode === "mri") {
      accepted.push(file);
      if (firstOnly) break;
      continue;
    }
    const key = `${mode}:${file.url || file.name}:${file.size}`;
    let valid = file.url ? checks.get(key) : undefined;
    if (valid === undefined) {
      try {
        if (!file.blob && file.size > budget.remaining) continue;
        if (!file.blob) budget.remaining -= file.size;
        const blob =
          file.blob ||
          (await downloadPublic(file.url!, 60 * 1024 * 1024, signal));
        const entries = archive
          ? await unpackSpectra(blob, signal)
          : [{ ...file, blob }];
        const { importSpectraFiles } = await import("./nmr/import-client");
        valid = false;
        for (const entry of entries) {
          signal.throwIfAborted();
          try {
            await importSpectraFiles([{ file: entry.blob!, name: entry.name }]);
            valid = true;
            break;
          } catch {
            signal.throwIfAborted();
          }
        }
        if (file.url) remember(key, valid);
      } catch {
        signal.throwIfAborted();
        // Network failures are not cached as permanent incompatibility.
        valid = false;
      }
    }
    if (valid) {
      accepted.push(file);
      if (firstOnly) break;
    }
  }
  return accepted;
}
export async function compatibleArchiveEntries(
  files: RepositoryFile[],
  signal: AbortSignal,
) {
  return compatibleFiles(files, "nmr", signal);
}
