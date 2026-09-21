import { createRepositoryTraffic } from "./repository-traffic.ts";
import type { CaseDocumentation } from "./study-collection.ts";
const API = "https://api.imaging.datacommons.cancer.gov/v3";
const traffic = createRepositoryTraffic(300);
const cache = new Map<string, { time: number; data: unknown }>();
export const IDC_LIMIT = 512 * 1024 * 1024;
export type IDCSeries = {
  collection_id: string;
  PatientID: string;
  StudyInstanceUID: string;
  SeriesInstanceUID: string;
  Modality: string;
  SeriesDescription: string;
  instanceCount: number;
  series_size_MB: number;
  series_aws_url: string;
};
export type IDCPage = {
  series: IDCSeries[];
  total_series: number;
  page: number;
  page_size: number;
  counts: {
    warnings?: string[];
    filters_applied?: { terms?: { Modality?: string[] } };
  };
};
async function bounded(response: Response, limit: number) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `IDC returned HTTP ${response.status}. Please retry later.`,
    );
  }
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("IDC response exceeds the import size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("IDC returned an empty response.");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new Error("IDC response exceeds the import size limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new Blob(chunks);
}
async function api<T>(
  path: string,
  signal: AbortSignal,
  body?: object,
): Promise<T> {
  signal.throwIfAborted();
  const key = path + JSON.stringify(body || null),
    old = cache.get(key);
  if (old && Date.now() - old.time < 300000) return old.data as T;
  const response = await traffic.fetch(API + path, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = JSON.parse(
    await (await bounded(response, 4 * 1024 * 1024)).text(),
  );
  if (cache.size >= 40) cache.delete(cache.keys().next().value!);
  cache.set(key, { time: Date.now(), data });
  return data;
}
export async function idcBodyParts(signal: AbortSignal) {
  const data = await api<{ values: { value: string }[] }>(
    "/attributes/BodyPartExamined/values?limit=200",
    signal,
  );
  return data.values.map((v) => v.value).sort();
}
export function idcFilters(
  body: string,
  collection: string,
  participant: string,
  study = "",
) {
  if (study && !/^\d+(\.\d+)+$/.test(study))
    throw new Error("Invalid examination identifier.");
  if ([body, collection, participant, study].some((v) => v.length > 128))
    throw new Error("Keep filters under 128 characters.");
  return {
    terms: {
      Modality: ["MR"],
      ...(study ? { StudyInstanceUID: [study] } : {}),
      ...(body ? { BodyPartExamined: [body] } : {}),
      ...(collection ? { collection_id: [collection] } : {}),
      ...(participant ? { PatientID: [participant] } : {}),
    },
    ranges: {
      series_size_MB: { lte: 512 },
      instanceCount: { gte: 1, lte: 1000 },
    },
  };
}
export async function searchIDC(
  body: string,
  collection: string,
  participant: string,
  page: number,
  signal: AbortSignal,
  study = "",
) {
  if (!Number.isInteger(page) || page < 0)
    throw new Error("Invalid result page.");
  const result = await api<IDCPage>("/cohort/manifest", signal, {
    filters: idcFilters(body, collection, participant, study),
    page,
    page_size: 10,
  });
  if (!result.counts.filters_applied?.terms?.Modality?.includes("MR"))
    throw new Error(
      "IDC did not confirm the MRI filter; results were not accepted.",
    );
  return { ...result, series: result.series.filter(validIDCSeries) };
}
export function idcLocation(value: string) {
  const match = value.match(
    /^s3:\/\/(idc-open-data(?:-two|-three)?|idc-open-data-cr)\/([a-f0-9-]{36})\/\*$/i,
  );
  if (!match) throw new Error("Unsupported IDC storage location.");
  return { bucket: match[1], prefix: match[2] + "/" };
}
export function validIDCSeries(s: IDCSeries) {
  try {
    idcLocation(s.series_aws_url);
  } catch {
    return false;
  }
  return (
    s.Modality === "MR" &&
    typeof s.SeriesInstanceUID === "string" &&
    /^\d+(\.\d+)+$/.test(s.SeriesInstanceUID) &&
    Number.isInteger(s.instanceCount) &&
    s.instanceCount > 0 &&
    s.instanceCount <= 1000 &&
    Number.isFinite(s.series_size_MB) &&
    s.series_size_MB > 0 &&
    s.series_size_MB <= 512
  );
}
export function validateIDCObjects(
  objects: { key: string; size: number }[],
  series: IDCSeries,
  truncated: boolean,
) {
  const { prefix } = idcLocation(series.series_aws_url);
  if (
    truncated ||
    objects.length !== series.instanceCount ||
    new Set(objects.map((o) => o.key)).size !== objects.length
  )
    throw new Error(
      "Incomplete IDC series listing. No partial series was loaded.",
    );
  if (
    objects.some(
      (o) =>
        !o.key.startsWith(prefix) ||
        !/^[-a-f0-9]+\.dcm$/i.test(o.key.slice(prefix.length)) ||
        !Number.isSafeInteger(o.size) ||
        o.size <= 0,
    )
  )
    throw new Error("Unexpected IDC object metadata.");
  if (objects.reduce((n, o) => n + o.size, 0) > IDC_LIMIT)
    throw new Error("Series exceeds the 512 MB import limit.");
}
export async function downloadIDCSeries(
  series: IDCSeries,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  if (!validIDCSeries(series))
    throw new Error("Unsupported or oversized MRI series.");
  const { bucket, prefix } = idcLocation(series.series_aws_url);
  const a = new AbortController();
  const cancel = () => a.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    progress("Checking complete DICOM series…");
    const q = new URLSearchParams({
      "list-type": "2",
      prefix,
      "max-keys": "1000",
    });
    const xml = new DOMParser().parseFromString(
      await (
        await bounded(
          await traffic.fetch(`https://s3.amazonaws.com/${bucket}?${q}`, {
            signal: a.signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
          }),
          2 * 1024 * 1024,
        )
      ).text(),
      "application/xml",
    );
    if (xml.querySelector("parsererror, Error"))
      throw new Error("Could not read IDC object listing.");
    const objects = Array.from(xml.querySelectorAll("Contents")).map((el) => ({
      key: el.querySelector("Key")?.textContent || "",
      size: Number(el.querySelector("Size")?.textContent),
    }));
    validateIDCObjects(
      objects,
      series,
      xml.querySelector("IsTruncated")?.textContent !== "false",
    );
    const files: File[] = new Array(objects.length);
    let next = 0,
      done = 0;
    const work = async () => {
      while (next < objects.length) {
        const i = next++,
          o = objects[i];
        a.signal.throwIfAborted();
        const blob = await bounded(
          await traffic.fetch(`https://s3.amazonaws.com/${bucket}/${o.key}`, {
            signal: a.signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
          }),
          o.size,
        );
        if (blob.size !== o.size)
          throw new Error("Incomplete DICOM download; series was not loaded.");
        files[i] = new File([blob], o.key.split("/").pop()!);
        progress(
          `Downloading DICOM ${++done}/${objects.length} · ${(objects.reduce((n, o) => n + o.size, 0) / 1024 / 1024).toFixed(1)} MB total`,
        );
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, objects.length) }, () =>
        work().catch((e) => {
          a.abort();
          throw e;
        }),
      ),
    );
    a.signal.throwIfAborted();
    return files;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
export async function idcDocumentation(
  series: IDCSeries,
  signal: AbortSignal,
): Promise<CaseDocumentation> {
  const record = await api<{ collection_name?: string; description?: string }>(
    `/collections/${encodeURIComponent(series.collection_id)}`,
    signal,
  );
  const licenses = await api<{
    licenses: { license_short_name: string | null }[];
  }>("/licenses", signal, {
    filters: { terms: { SeriesInstanceUID: [series.SeriesInstanceUID] } },
  });
  return {
    title: record.collection_name || series.collection_id,
    source: "https://portal.imaging.datacommons.cancer.gov/",
    license:
      licenses.licenses
        .map((l) => l.license_short_name || "Unspecified")
        .join(", ") || "Review source terms",
    authors: "See collection source and citations",
    sections: [
      {
        title: "Collection documentation",
        text: record.description || "No collection description supplied.",
      },
      { title: "Selected MRI series", text: JSON.stringify(series, null, 2) },
    ],
    links: [
      {
        label: "IDC collection documentation",
        url: `https://portal.imaging.datacommons.cancer.gov/collections/`,
      },
      {
        label: "IDC data access and citation guidance",
        url: "https://learn.canceridc.dev/",
      },
    ],
  };
}

export type IDCCollection = {
  collection_id: string;
  collection_name: string;
  description: string;
  tumor_locations: string;
  cancer_types: string;
  subjects: number;
  series_count: number;
};
export async function idcCollections(
  signal: AbortSignal,
): Promise<IDCCollection[]> {
  const catalog = await api<Omit<IDCCollection, "series_count">[]>(
    "/collections",
    signal,
  );
  const counts = await api<{
    rows: { collection_id: string; series_count: number }[];
    truncated: boolean;
  }>("/sql", signal, {
    sql: "SELECT collection_id, COUNT(*) AS series_count FROM index WHERE Modality = 'MR' GROUP BY collection_id ORDER BY collection_id",
    max_rows: 1000,
  });
  if (counts.truncated)
    throw new Error(
      "IDC collection summary is incomplete. Try series search instead.",
    );
  const byId = new Map(
    counts.rows.map((r) => [r.collection_id, r.series_count]),
  );
  return catalog
    .filter((c) => (byId.get(c.collection_id) || 0) > 0)
    .map((c) => ({ ...c, series_count: byId.get(c.collection_id)! }))
    .sort((a, b) => a.collection_name.localeCompare(b.collection_name));
}
export function filterIDCCollections(
  collections: IDCCollection[],
  term: string,
) {
  const words = term.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return collections.filter((c) => {
    const text = [
      c.collection_name,
      c.collection_id,
      c.tumor_locations,
      c.cancer_types,
      c.description,
    ]
      .join(" ")
      .toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
export function groupIDCExaminations(series: IDCSeries[]) {
  const groups = new Map<
    string,
    {
      key: string;
      collection: string;
      participant: string;
      study: string;
      series: IDCSeries[];
    }
  >();
  for (const s of series) {
    const key = JSON.stringify([
      s.collection_id,
      s.PatientID,
      s.StudyInstanceUID,
    ]);
    if (!groups.has(key))
      groups.set(key, {
        key,
        collection: s.collection_id,
        participant: s.PatientID,
        study: s.StudyInstanceUID,
        series: [],
      });
    const group = groups.get(key)!;
    if (!group.series.some((x) => x.SeriesInstanceUID === s.SeriesInstanceUID))
      group.series.push(s);
  }
  return [...groups.values()];
}
