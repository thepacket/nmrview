import { createRepositoryTraffic } from "./repository-traffic.ts";
import { idcCollections, type IDCCollection } from "./idc.ts";
const traffic = createRepositoryTraffic(400);
const API = "https://www.cancerimagingarchive.net/api/v1/collections/";
export type TCIACatalogEntry = {
  slug: string;
  collection_short_title: string;
  collection_title: string;
  collection_doi: string;
};
let cached: { at: number; records: TCIACatalogEntry[] } | undefined;
export function matchTCIACollections(
  records: TCIACatalogEntry[],
  collections: IDCCollection[],
): IDCCollection[] {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return collections.flatMap((collection) => {
    const matches = records.filter((record) =>
      [record.collection_short_title, record.slug].some(
        (name) =>
          key(name) === key(collection.collection_name) ||
          key(name) === key(collection.collection_id),
      ),
    );
    if (matches.length !== 1) return [];
    const record = matches[0];
    if (!/^[a-z0-9-]+$/.test(record.slug)) return [];
    return [
      {
        ...collection,
        source_url: `https://www.cancerimagingarchive.net/collection/${record.slug}/`,
        source_doi: record.collection_doi,
      },
    ];
  });
}
async function catalog(signal: AbortSignal) {
  if (cached && Date.now() - cached.at < 3600000) return cached.records;
  const records: TCIACatalogEntry[] = [];
  for (let page = 1; page <= 5; page++) {
    const query = new URLSearchParams({
      per_page: "100",
      page: String(page),
      _fields: "slug,collection_short_title,collection_title,collection_doi",
    });
    const response = await traffic.fetch(`${API}?${query}`, {
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new Error(
        `TCIA catalog is unavailable (${response.status}). Try again later or use the IDC browser.`,
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("TCIA returned no catalog.");
    let bytes = 0,
      text = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 2 * 1024 * 1024)
          throw new Error("TCIA catalog page exceeds the size limit.");
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
    }
    const data: unknown = JSON.parse(text);
    if (
      !Array.isArray(data) ||
      data.length > 100 ||
      !data.every(
        (r) =>
          r &&
          [
            "slug",
            "collection_short_title",
            "collection_title",
            "collection_doi",
          ].every((k) => typeof r[k] === "string" && r[k].length < 10000),
      )
    )
      throw new Error("Unexpected TCIA catalog format.");
    records.push(...(data as TCIACatalogEntry[]));
    if (data.length < 100) {
      signal.throwIfAborted();
      cached = { at: Date.now(), records };
      return records;
    }
  }
  throw new Error(
    "TCIA catalog exceeds the browsing limit; use the IDC browser.",
  );
}
export async function tciaCollections(signal: AbortSignal) {
  const records = await catalog(signal);
  const collections = await idcCollections(signal);
  return matchTCIACollections(records, collections);
}
