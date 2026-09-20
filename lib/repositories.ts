export type RepositoryFile = {
  name: string;
  size: number;
  url?: string;
  blob?: Blob;
};
export type RepositoryRecord = {
  title: string;
  source: string;
  license: string;
  authors: string;
  files: RepositoryFile[];
  next?: string;
  excludedFiles?: string[];
};
export const supportedFile = (name: string, mode: "mri" | "nmr") =>
  (mode === "mri"
    ? /\.(nii(\.gz)?|nrrd|mgh|mgz)$/i
    : /\.(jdx|dx|jcamp|csv|tsv)$/i
  ).test(name);
export function compatibilitySummary(names: string[], mode: "mri" | "nmr") {
  if (!names.length)
    return "File formats not listed; inspect the record before loading.";
  const supported = names.filter((n) => supportedFile(n, mode));
  if (supported.length)
    return `${supported.length} candidate ${mode === "mri" ? "volume" : "spectrum"} file(s). Format contents still need validation${mode === "nmr" ? "; CSV/TSV must contain paired ppm and intensity values" : ""}.`;
  const otherMode = mode === "mri" ? "nmr" : "mri";
  if (names.some((n) => supportedFile(n, otherMode)))
    return `Files may belong in the ${otherMode === "mri" ? "MRI imaging" : "NMR spectroscopy"} workspace instead.`;
  if (names.some((n) => /\.zip$/i.test(n)))
    return mode === "nmr"
      ? "ZIP archive: contents unverified. It may contain microscopy, raw data or other unsupported files."
      : "Online ZIP: supported volume entries are inspected automatically and fetched individually.";
  if (names.every((n) => /\.(pdf|docx?|xlsx?|pptx?)$/i.test(n)))
    return "Documents or spreadsheets only — no directly viewable scans or spectra.";
  if (names.some((n) => /\.(tiff?|png|jpe?g|svs|ndpi)$/i.test(n)))
    return "2D images or pathology slides — this viewer does not currently support these image formats.";
  return "No directly supported files listed for this workspace.";
}
export function repositoryId(value: string, provider: string) {
  const match =
    provider === "openneuro"
      ? value
          .trim()
          .match(
            /^(?:https:\/\/openneuro\.org\/datasets\/)?(ds\d{6})(?:\/versions\/[^/?#]+)?\/?$/,
          )
      : value
          .trim()
          .match(
            /^(?:https:\/\/zenodo\.org\/(?:records?|api\/records)\/|https:\/\/doi\.org\/10\.5281\/zenodo\.)?(\d+)\/?$/,
          );
  if (!match)
    throw new Error(
      provider === "openneuro"
        ? "Enter an OpenNeuro ID such as ds000228 or its dataset URL."
        : "Enter a Zenodo record number or record URL.",
    );
  return match[1];
}
export async function downloadPublic(
  url: string,
  limit: number,
  signal: AbortSignal,
  progress?: (bytes: number, total: number) => void,
) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !["s3.amazonaws.com", "zenodo.org", "openneuro.org"].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new Error("Unsupported repository download address.");
  if (u.hash.startsWith("#nmrview-zip=")) {
    const { downloadZipVolume } = await import("./remote-zip.ts");
    return downloadZipVolume(url, limit, signal, progress);
  }
  const response = await fetch(u, {
    signal,
    credentials: "omit",
    ...(u.hostname === "openneuro.org"
      ? { headers: { "Content-Type": "application/json" } }
      : {}),
    referrerPolicy: "no-referrer",
  });
  if (!response.ok)
    throw new Error(
      `Repository returned HTTP ${response.status}${response.status === 429 ? ". Please wait before trying again" : ""}.`,
    );
  const total = Number(response.headers.get("content-length")) || 0;
  if (total > limit) {
    await response.body?.cancel();
    throw new Error("File exceeds the browser import size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Repository returned an empty response.");
  let bytes = 0;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit)
        throw new Error("Download exceeds the browser import size limit.");
      chunks.push(value);
      progress?.(bytes, total);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  return new Blob(chunks);
}
export async function browseRepository(
  provider: string,
  id: string,
  mode: "mri" | "nmr",
  signal: AbortSignal,
  next?: string,
): Promise<RepositoryRecord> {
  const json = async (url: string) =>
    JSON.parse(
      await (await downloadPublic(url, 2 * 1024 * 1024, signal)).text(),
    );
  if (provider === "zenodo") {
    const record = await json(`https://zenodo.org/api/records/${id}`);
    if (record.metadata?.access_right !== "open")
      throw new Error("Only openly accessible records can be loaded.");
    const { compatibleFiles } = await import("./repository-compatibility.ts");
    const candidates = (record.files || []).map(
      (f: { key: string; size: number }) => ({
        name: f.key,
        size: f.size,
        url: `https://zenodo.org/api/records/${id}/files/${encodeURIComponent(f.key)}/content`,
      }),
    );
    const compatible = await compatibleFiles(candidates, mode, signal);
    return {
      title: String(record.metadata.title),
      source: `https://zenodo.org/records/${id}`,
      license:
        record.metadata.license?.id ||
        "Not specified — review repository terms",
      authors: (record.metadata.creators || [])
        .map((a: { name: string }) => a.name)
        .join(", "),
      files: compatible,
    };
  }
  const query = new URLSearchParams({
    "list-type": "2",
    prefix: `${id}/`,
    "max-keys": "1000",
  });
  if (next) query.set("continuation-token", next);
  const [metadata, listing] = await Promise.all([
    json(
      `https://s3.amazonaws.com/openneuro.org/${id}/dataset_description.json`,
    ),
    downloadPublic(
      `https://s3.amazonaws.com/openneuro.org?${query}`,
      4 * 1024 * 1024,
      signal,
    ).then((b) => b.text()),
  ]);
  const xml = new DOMParser().parseFromString(listing, "application/xml");
  if (xml.querySelector("parsererror, Error"))
    throw new Error("Could not read the OpenNeuro file listing.");
  const files = Array.from(xml.querySelectorAll("Contents"))
    .map((el) => {
      const name = el.querySelector("Key")?.textContent || "";
      return {
        name,
        size: Number(el.querySelector("Size")?.textContent),
        url: `https://s3.amazonaws.com/openneuro.org/${name.split("/").map(encodeURIComponent).join("/")}`,
      };
    })
    .filter((f) => supportedFile(f.name, mode));
  return {
    title: metadata.Name || id,
    source: `https://openneuro.org/datasets/${id}`,
    license: metadata.License || "Not specified — review repository terms",
    authors: (metadata.Authors || []).join(", "),
    files,
    next: xml.querySelector("NextContinuationToken")?.textContent || undefined,
  };
}
export async function unpackSpectra(
  blob: Blob,
  signal?: AbortSignal,
): Promise<RepositoryFile[]> {
  const { unzip } = await import("fflate");
  let total = 0,
    count = 0,
    tooLarge = false;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let terminate: (() => void) | undefined;
    const cancel = () => {
      terminate?.();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      terminate = unzip(
        bytes,
        {
          filter: (entry) => {
            if (
              entry.name
                .split("/")
                .some((p) => p.startsWith(".") || p === "__MACOSX") ||
              !supportedFile(entry.name, "nmr")
            )
              return false;
            total += entry.originalSize;
            count++;
            if (total > 60 * 1024 * 1024 || count > 200) {
              tooLarge = true;
              return false;
            }
            return true;
          },
        },
        (error, files) => {
          signal?.removeEventListener("abort", cancel);
          if (error || tooLarge)
            return reject(
              error ||
                new Error(
                  "Archive exceeds 60 MB expanded data or 200 supported files.",
                ),
            );
          const result = Object.entries(files).map(([name, bytes]) => ({
            name,
            size: bytes.byteLength,
            blob: new Blob([new Uint8Array(bytes)]),
          }));
          if (!result.length)
            return reject(
              new Error(
                "This ZIP contains no supported 1D JCAMP or CSV/TSV spectra. It may contain microscopy images, documents, or raw acquisition data; these cannot be treated as processed spectra.",
              ),
            );
          resolve(result);
        },
      );
    } catch (error) {
      signal?.removeEventListener("abort", cancel);
      reject(error);
    }
  });
}
