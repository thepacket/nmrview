import { downloadPublic } from "../repositories.ts";
import { parseBasis, type Basis } from "./basis.ts";
import { acquisitionMetadata, type MRSInfo } from "./mrs.ts";

export type MRSSupport = {
  notes?: unknown;
  notesURL?: string;
  basis?: Basis;
  basisURL?: string;
  message: string;
};
export function basisMatchesAcquisition(
  b: Basis,
  info: MRSInfo,
  selection: number[],
) {
  const m = acquisitionMetadata(info, selection);
  return (
    b.nucleus === info.nucleus &&
    Math.abs(info.frequency / b.frequencyMHz - 1) <= 0.001 &&
    typeof m.EchoTime === "number" &&
    Math.abs(m.EchoTime - b.echoTimeSeconds) <= 1e-6 &&
    m.SequenceName === b.sequence
  );
}

// One record listing, one exact sidecar and at most three named basis candidates.
// Never crawl a dataset or infer compatibility from a file's proximity alone.
export async function discoverMRSSupport(
  info: MRSInfo,
  signal: AbortSignal,
  download: typeof downloadPublic = downloadPublic,
): Promise<MRSSupport> {
  const result: MRSSupport = {
    message:
      "No compatible optional basis found. Spectrum viewing and processing are ready without one.",
  };
  const source = new URL(info.source);
  const recordId =
    source.hostname === "zenodo.org"
      ? source.pathname.match(/^\/(?:api\/)?records?\/(\d+)\/files\//)?.[1]
      : undefined;
  let files: { name: string; url: string; size: number }[] = [];
  const name = decodeURIComponent(
    source.pathname
      .replace(/\/content$/, "")
      .split("/")
      .pop() || "",
  );
  if (recordId) {
    const record = JSON.parse(
      await (
        await download(
          `https://zenodo.org/api/records/${recordId}`,
          2 * 1024 * 1024,
          signal,
        )
      ).text(),
    );
    if (record.metadata?.access_right !== "open")
      return {
        message: "Optional file discovery is available for open records only.",
      };
    files = (record.files || []).map((f: { key: string; size: number }) => ({
      name: f.key,
      size: f.size,
      url: `https://zenodo.org/api/records/${recordId}/files/${encodeURIComponent(f.key)}/content`,
    }));
  } else if (
    source.hostname === "s3.amazonaws.com" &&
    /^\/openneuro.org\/ds\d{6}\//.test(source.pathname)
  ) {
    const sidecar = new URL(source);
    sidecar.pathname = sidecar.pathname.replace(/\.nii(?:\.gz)?$/i, ".json");
    sidecar.search = "";
    if (sidecar.pathname !== source.pathname)
      files = [
        {
          name: name.replace(/\.nii(?:\.gz)?$/i, ".json"),
          url: sidecar.href,
          size: 0,
        },
      ];
  } else
    return {
      message:
        "Automatic supporting-file discovery is available for Zenodo records and OpenNeuro S3 acquisitions. Optional files can still be supplied below.",
    };
  const sidecarName = name.replace(/\.nii(?:\.gz)?$/i, ".json");
  const sidecar = files.find(
    (f) => f.name === sidecarName && f.size <= 1024 * 1024,
  );
  if (sidecar) {
    try {
      result.notes = JSON.parse(
        await (await download(sidecar.url, 1024 * 1024, signal)).text(),
      );
      result.notesURL = sidecar.url;
    } catch {
      if (signal.aborted) throw new Error("Supporting-file lookup cancelled.");
    }
  }
  const matches: { basis: Basis; url: string }[] = [];
  for (const file of files
    .filter((f) => /basis.*\.json$/i.test(f.name) && f.size <= 8 * 1024 * 1024)
    .slice(0, 3)) {
    try {
      const basis = parseBasis(
        JSON.parse(
          await (await download(file.url, 8 * 1024 * 1024, signal)).text(),
        ),
      );
      if (basisMatchesAcquisition(basis, info, [0, 0, 0, 0, 0, 0]))
        matches.push({ basis, url: file.url });
    } catch {
      if (signal.aborted) throw new Error("Supporting-file lookup cancelled.");
    }
  }
  if (matches.length === 1) {
    result.basis = matches[0].basis;
    result.basisURL = matches[0].url;
    result.message =
      "A basis matching nucleus, frequency, echo time and sequence was loaded. Verify its processing conventions before fitting.";
  } else if (matches.length > 1)
    result.message =
      "Multiple bases match the acquisition metadata. Supply the intended basis below; none was selected automatically.";
  if (result.notesURL) result.message += " Acquisition notes loaded.";
  return result;
}
