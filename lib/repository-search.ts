import { RepositoryRateLimitError } from "./repository-traffic.ts";
import {
  downloadPublic,
  browseRepository,
  type RepositoryFile,
} from "./repositories.ts";
export type DatasetHit = {
  id: string;
  title: string;
  description: string;
  authors: string;
  license: string;
  url: string;
  compatibility?: string;
  files?: RepositoryFile[];
};
export type DatasetResults = {
  hits: DatasetHit[];
  next?: string;
  total?: number;
  checked?: number;
  excluded?: {
    archives: number;
    unsupported: number;
    oversized: number;
    unchecked: number;
  };
  catalogTotal?: number;
};
const anatomyTerms: Record<string, string[]> = {
  knee: ["knee", "knees"],
  knees: ["knee", "knees"],
  femur: ["femur", "femurs", "femoral"],
  femoral: ["femur", "femurs", "femoral"],
};
export function zenodoSearchQuery(term: string, datasetsOnly: boolean) {
  const words = term
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const variants = anatomyTerms[word.toLowerCase()] || [word];
      const quoted = variants.map(
        (value) => `"${value.replace(/[\\"]/g, "\\$&")}"`,
      );
      return quoted.length > 1 ? `(${quoted.join(" OR ")})` : quoted[0];
    });
  return [
    ...words,
    "access_right:open",
    ...(datasetsOnly ? ["resource_type.type:dataset"] : []),
  ].join(" AND ");
}
function plainText(value: string) {
  // Remote descriptions are displayed only as text, never as HTML.
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 450);
}
export async function searchPage(
  provider: string,
  term: string,
  filter: string,
  signal: AbortSignal,
  cursor?: string,
  mode: "mri" | "nmr" = "mri",
): Promise<DatasetResults> {
  if (term.length > 200)
    throw new Error("Keep the search under 200 characters.");
  if (provider === "zenodo") {
    const page = cursor ? Number(cursor) : 1;
    if (!Number.isInteger(page) || page < 1)
      throw new Error("Invalid search page.");
    const query = new URLSearchParams({
      q: zenodoSearchQuery(term, filter === "dataset"),
      size: "10",
      page: String(page),
      sort: term.trim() ? "bestmatch" : "mostrecent",
    });
    const data = JSON.parse(
      await (
        await downloadPublic(
          `https://zenodo.org/api/records?${query}`,
          4 * 1024 * 1024,
          signal,
        )
      ).text(),
    );
    const total =
      typeof data.hits?.total === "number"
        ? data.hits.total
        : data.hits?.total?.value;
    const hits = (data.hits?.hits || [])
      .filter(
        (r: { metadata: { access_right: string } }) =>
          r.metadata.access_right === "open",
      )
      .map(
        (r: {
          id: number;
          files?: { key: string; size: number }[];
          metadata: {
            title: string;
            description?: string;
            creators?: { name: string }[];
            license?: { id: string };
          };
        }) => ({
          id: String(r.id),
          files: (r.files || []).map((f) => ({
            name: f.key,
            size: f.size,
            url: `https://zenodo.org/api/records/${r.id}/files/${encodeURIComponent(f.key)}/content`,
          })),
          title: r.metadata.title,
          description: plainText(r.metadata.description || ""),
          authors: (r.metadata.creators || []).map((a) => a.name).join(", "),
          license: r.metadata.license?.id || "Review source terms",
          url: `https://zenodo.org/records/${r.id}`,
        }),
      );
    return {
      hits,
      total,
      next: data.links?.next ? String(page + 1) : undefined,
    };
  }
  const query = `query Catalog($query: DatasetSearchInput!, $after: String) {
    advancedSearch(first: 10, query: $query, after: $after) {
      edges { node { id name public metadata { studyDesign studyDomain species } latestSnapshot { description { Authors License } } } }
      pageInfo { hasNextPage endCursor }
    }
  }`;
  const variables = {
    query: {
      publicOnly: true,
      modality: "mri",
      keywords: term.trim().split(/\s+/).filter(Boolean),
      ...(filter !== "all" ? { bidsDatasetType: filter } : {}),
    },
    after: cursor || null,
  };
  const params = new URLSearchParams({
    query,
    variables: JSON.stringify(variables),
  });
  const data = JSON.parse(
    await (
      await downloadPublic(
        `https://openneuro.org/crn/graphql?${params}`,
        4 * 1024 * 1024,
        signal,
      )
    ).text(),
  );
  if (data.errors?.length)
    throw new Error(
      "OpenNeuro search is unavailable. Please retry or use a dataset ID.",
    );
  const result = data.data?.advancedSearch;
  if (!result) throw new Error("OpenNeuro returned no catalog response.");
  const hits = result.edges
    .filter((e: { node: { public: boolean } }) => e.node?.public)
    .map(
      ({
        node: n,
      }: {
        node: {
          id: string;
          name: string;
          metadata?: {
            studyDesign?: string;
            studyDomain?: string;
            species?: string;
          };
          latestSnapshot?: {
            description?: { Authors?: string[]; License?: string };
          };
        };
      }) => ({
        id: n.id,
        title: n.name,
        description:
          plainText(
            [
              n.metadata?.studyDesign,
              n.metadata?.studyDomain,
              n.metadata?.species,
            ]
              .filter(Boolean)
              .join(" · "),
          ) ||
          "Public MRI dataset. Browse files for acquisition types and individual scans.",
        authors: (n.latestSnapshot?.description?.Authors || []).join(", "),
        license:
          n.latestSnapshot?.description?.License || "Review source terms",
        url: `https://openneuro.org/datasets/${n.id}`,
      }),
    );
  return {
    hits,
    next: result.pageInfo.hasNextPage ? result.pageInfo.endCursor : undefined,
  };
}

async function searchUncached(
  provider: string,
  term: string,
  filter: string,
  signal: AbortSignal,
  cursor?: string,
  mode: "mri" | "nmr" = "mri",
  onProgress?: (result: DatasetResults) => void,
): Promise<DatasetResults> {
  const { compatibleFiles } = await import("./repository-compatibility.ts");
  const result = await searchPage(
    provider,
    term,
    filter,
    AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    cursor,
    mode,
  );
  // Bound the whole verification phase, rather than adding ten per-record waits.
  const verificationSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(15000),
  ]);
  const budget = { remaining: 128 * 1024 * 1024 };
  const outcomes = new Map<number, boolean>();
  const failed = new Set<number>();
  const snapshot = (): DatasetResults => {
    const excluded = {
      archives: 0,
      unsupported: 0,
      oversized: 0,
      unchecked: failed.size,
    };
    const hits: DatasetHit[] = [];
    result.hits.forEach((hit, i) => {
      if (!outcomes.has(i)) return;
      if (outcomes.get(i)) {
        hits.push({
          ...hit,
          compatibility:
            mode === "nmr"
              ? "Validated 1D spectra available"
              : "Supported volume files available",
        });
      } else if (provider === "zenodo" && mode === "mri") {
        const files = hit.files || [];
        if (
          files.some(
            (f) =>
              /\.(nii(\.gz)?|nrrd|mgh|mgz)$/i.test(f.name) &&
              f.size > 512 * 1024 * 1024,
          )
        )
          excluded.oversized++;
        else if (
          files.some((f) =>
            /\.(zip|7z|rar|tar|tgz|tar\.gz|tar\.gz[a-z]+)$/i.test(f.name),
          )
        )
          excluded.archives++;
        else excluded.unsupported++;
      }
    });
    return {
      hits,
      next: result.next,
      checked: outcomes.size + failed.size,
      excluded,
      catalogTotal: result.total,
    };
  };
  // Resolve filename-only MRI checks first, without waiting behind network probes.
  const pending: number[] = [];
  for (let i = 0; i < result.hits.length; i++) {
    const files = result.hits[i].files || [];
    if (provider === "zenodo" && mode === "mri") {
      const direct = files.filter((f) => !/\.zip$/i.test(f.name));
      const supported =
        (await compatibleFiles(direct, mode, signal, true)).length > 0;
      if (supported || !files.some((f) => /\.zip$/i.test(f.name))) {
        outcomes.set(i, supported);
        continue;
      }
    }
    pending.push(i);
  }
  onProgress?.(snapshot());
  let index = 0;
  const workers = new AbortController();
  try {
    await Promise.all(
      Array.from({ length: Math.min(2, pending.length) }, async () => {
        while (index < pending.length) {
          signal.throwIfAborted();
          workers.signal.throwIfAborted();
          const i = pending[index++];
          if (verificationSignal.aborted) {
            failed.add(i);
            continue;
          }
          const hit = result.hits[i];
          const checkSignal = AbortSignal.any([
            verificationSignal,
            workers.signal,
            AbortSignal.timeout(6000),
          ]);
          try {
            const files =
              provider === "zenodo"
                ? hit.files || []
                : (await browseRepository(provider, hit.id, mode, checkSignal))
                    .files;
            outcomes.set(
              i,
              (await compatibleFiles(files, mode, checkSignal, true, budget))
                .length > 0,
            );
          } catch (error) {
            if (error instanceof RepositoryRateLimitError) throw error;
            signal.throwIfAborted();
            workers.signal.throwIfAborted();
            failed.add(i);
          }
          onProgress?.(snapshot());
        }
      }),
    );
  } finally {
    workers.abort();
  }
  signal.throwIfAborted();
  return snapshot();
}

// Cache completed discovery only; errors and cancelled runs remain retryable.
const discoveries = new Map<string, { at: number; result: DatasetResults }>();
export async function searchDatasets(
  provider: string,
  term: string,
  filter: string,
  signal: AbortSignal,
  cursor?: string,
  mode: "mri" | "nmr" = "mri",
  onProgress?: (result: DatasetResults) => void,
): Promise<DatasetResults> {
  signal.throwIfAborted();
  const key = JSON.stringify([provider, term.trim(), filter, cursor, mode]);
  const saved = discoveries.get(key);
  if (saved && Date.now() - saved.at < 300000)
    return structuredClone(saved.result);
  const result = await searchUncached(
    provider,
    term,
    filter,
    signal,
    cursor,
    mode,
    onProgress,
  );
  signal.throwIfAborted();
  if (!result.excluded?.unchecked) {
    if (discoveries.size >= 20)
      discoveries.delete(discoveries.keys().next().value!);
    discoveries.set(key, { at: Date.now(), result: structuredClone(result) });
  }
  return result;
}
