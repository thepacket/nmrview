import { downloadPublic } from "./repositories.ts";
const base = "https://s3.amazonaws.com/openneuro.org/";
export function metadataDirectories(key: string) {
  const parts = key.split("/");
  const root = parts[1] === "derivatives" ? 3 : 1;
  return Array.from(
    { length: parts.length - root },
    (_, i) => parts.slice(0, root + i).join("/") + "/",
  );
}
function filenameParts(path: string) {
  const tokens = path
    .split("/")
    .at(-1)!
    .replace(/\.(json|nii(?:\.gz)?)$/i, "")
    .split("_");
  const suffix = tokens.pop();
  const entities = tokens.map((token) => {
    const i = token.indexOf("-");
    return [token.slice(0, i), token.slice(i + 1)];
  });
  return { suffix, entities };
}
export function applicableMetadata(scan: string, candidate: string) {
  if (!candidate.endsWith(".json")) return false;
  const dir = candidate.slice(0, candidate.lastIndexOf("/") + 1);
  if (!metadataDirectories(scan).includes(dir)) return false;
  const target = filenameParts(scan),
    source = filenameParts(candidate);
  return (
    source.suffix === target.suffix &&
    source.entities.every(([key, value]) =>
      target.entities.some(([k, v]) => k === key && v === value),
    )
  );
}
export type AcquisitionMetadata = {
  values: Record<string, unknown>;
  sources: { name: string; url: string }[];
  provenance: Record<string, string>;
};
export function mergeMetadata(
  sources: { name: string; url: string; values: Record<string, unknown> }[],
): AcquisitionMetadata {
  const values: Record<string, unknown> = Object.create(null),
    provenance: Record<string, string> = Object.create(null);
  for (const source of sources)
    for (const [key, value] of Object.entries(source.values)) {
      values[key] = value;
      provenance[key] = source.name;
    }
  return {
    values,
    provenance,
    sources: sources.map(({ name, url }) => ({ name, url })),
  };
}
export async function loadAcquisitionMetadata(
  url: string,
  signal: AbortSignal,
): Promise<AcquisitionMetadata> {
  if (!url.startsWith(base))
    throw new Error("Acquisition metadata requires an OpenNeuro scan.");
  const key = decodeURIComponent(
    new URL(url).pathname.slice("/openneuro.org/".length),
  );
  if (!/^ds\d+\//.test(key)) throw new Error("Unknown dataset path.");
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  const sources: {
    name: string;
    url: string;
    values: Record<string, unknown>;
  }[] = [];
  for (const prefix of metadataDirectories(key)) {
    const candidates: string[] = [];
    let next = "";
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({
        "list-type": "2",
        prefix,
        delimiter: "/",
        "max-keys": "1000",
      });
      if (next) query.set("continuation-token", next);
      const xml = new DOMParser().parseFromString(
        await (
          await downloadPublic(`${base}?${query}`, 4 * 1024 * 1024, bounded)
        ).text(),
        "application/xml",
      );
      if (xml.querySelector("parsererror"))
        throw new Error("Invalid repository metadata listing.");
      for (const node of xml.querySelectorAll("Contents > Key"))
        if (node.textContent && applicableMetadata(key, node.textContent))
          candidates.push(node.textContent);
      next = xml.querySelector("NextContinuationToken")?.textContent || "";
      if (xml.querySelector("IsTruncated")?.textContent !== "true") break;
      if (!next || page === 9)
        throw new Error(
          "Metadata listing exceeded its limit; documentation may be incomplete.",
        );
    }
    if (candidates.length > 1)
      throw new Error(
        `Multiple applicable metadata files in ${prefix}; inheritance is ambiguous. Consult source documents.`,
      );
    if (candidates.length === 1) {
      const name = candidates[0],
        sourceUrl = base + name.split("/").map(encodeURIComponent).join("/");
      const values: unknown = JSON.parse(
        await (await downloadPublic(sourceUrl, 1024 * 1024, bounded)).text(),
      );
      if (!values || typeof values !== "object" || Array.isArray(values))
        throw new Error(`Invalid metadata object in ${name}.`);
      sources.push({
        name,
        url: sourceUrl,
        values: values as Record<string, unknown>,
      });
    }
  }
  return mergeMetadata(sources);
}
