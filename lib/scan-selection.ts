import type { RepositoryFile } from "./repositories.ts";
import { describeRepositoryFile } from "./repository-file-guide.ts";

export function scanDescriptor(file: RepositoryFile) {
  const leaf = file.name.split("/").at(-1)!;
  const info = describeRepositoryFile(file.name, "mri");
  const pipeline = file.name.match(/(?:^|\/)derivatives\/([^/]+)/i)?.[1];
  const processing = pipeline ? `Processed · ${pipeline}` : "Original";
  const entities = [
    ...leaf.matchAll(
      /(?:^|_)(acq|task|run|echo|space|res|desc|rec|dir|part)-([^_.]+)/g,
    ),
  ].map((m) => [m[1], m[2]] as [string, string]);
  const labels: Record<string, string> = {
    acq: "Acquisition",
    task: "Task",
    run: "Run",
    echo: "Echo",
    space: "Space",
    res: "Resolution",
    desc: "Variant",
    rec: "Reconstruction",
    dir: "Direction",
    part: "Part",
  };
  const details = entities
    .map(([key, value]) => `${labels[key]} ${value}`)
    .join(" · ");
  // Keep unrecognized suffixes distinct and do not infer comparability from "Volume".
  const suffix = leaf
    .replace(/\.(nii(\.gz)?|nrrd|mgh|mgz)$/i, "")
    .split("_")
    .at(-1)!;
  const signature = JSON.stringify([
    info.label,
    pipeline || "",
    suffix,
    [...entities].sort(([a], [b]) => a.localeCompare(b)),
  ]);
  return {
    type: info.label,
    group: `${info.label} · ${processing}`,
    details,
    processing,
    signature,
    known: info.label !== "Volume",
  };
}
export function matchingScan(
  reference: RepositoryFile,
  files: RepositoryFile[],
) {
  const descriptor = scanDescriptor(reference);
  if (!descriptor.known)
    return { reason: "unrecognized scan type", file: undefined };
  const matches = files.filter(
    (file) => scanDescriptor(file).signature === descriptor.signature,
  );
  return matches.length === 1
    ? { file: matches[0], reason: "" }
    : {
        file: undefined,
        reason: matches.length
          ? "multiple matching scans; choose manually"
          : "no matching acquisition",
      };
}
