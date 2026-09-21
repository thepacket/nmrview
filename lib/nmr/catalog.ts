import {
  downloadPublic,
  repositoryId,
  type RepositoryFile,
} from "../repositories.ts";
export type SpectroscopyKind = "mrs" | "2d";
export function spectroscopyCandidates(
  files: RepositoryFile[],
  kind: SpectroscopyKind,
  bids = false,
) {
  return files.filter(
    (f) =>
      f.url &&
      f.size <= (kind === "mrs" ? 64 : 32) * 1024 * 1024 &&
      (kind === "mrs"
        ? /\.nii(\.gz)?$/i.test(f.name) && (!bids || /\/mrs\//.test(f.name))
        : /\.(jdx|dx|jcamp|csv)$/i.test(f.name)),
  );
}
export async function spectroscopyRecord(
  provider: "zenodo" | "openneuro",
  value: string,
  kind: SpectroscopyKind,
  signal: AbortSignal,
  cursor?: string,
) {
  const id = repositoryId(value, provider);
  if (provider === "zenodo") {
    const r = JSON.parse(
      await (
        await downloadPublic(
          `https://zenodo.org/api/records/${id}`,
          2 * 1024 * 1024,
          signal,
        )
      ).text(),
    );
    if (r.metadata?.access_right !== "open")
      throw new Error("Only openly accessible records can be loaded.");
    return {
      title: String(r.metadata.title),
      source: `https://zenodo.org/records/${id}`,
      next: undefined as string | undefined,
      files: spectroscopyCandidates(
        (r.files || []).map((f: { key: string; size: number }) => ({
          name: f.key,
          size: f.size,
          url: `https://zenodo.org/api/records/${id}/files/${encodeURIComponent(f.key)}/content`,
        })),
        kind,
      ),
    };
  }
  const q = new URLSearchParams({
    "list-type": "2",
    prefix: `${id}/`,
    "max-keys": "1000",
  });
  if (cursor) q.set("continuation-token", cursor);
  const xml = new DOMParser().parseFromString(
    await (
      await downloadPublic(
        `https://s3.amazonaws.com/openneuro.org?${q}`,
        4 * 1024 * 1024,
        signal,
      )
    ).text(),
    "application/xml",
  );
  if (xml.querySelector("parsererror, Error"))
    throw new Error("Could not read the dataset listing.");
  const files = Array.from(xml.querySelectorAll("Contents")).map((el) => {
    const name = el.querySelector("Key")?.textContent || "";
    return {
      name,
      size: Number(el.querySelector("Size")?.textContent),
      url: `https://s3.amazonaws.com/openneuro.org/${name.split("/").map(encodeURIComponent).join("/")}`,
    };
  });
  return {
    title: id,
    source: `https://openneuro.org/datasets/${id}`,
    files: spectroscopyCandidates(files, kind, true),
    next: xml.querySelector("NextContinuationToken")?.textContent || undefined,
  };
}
