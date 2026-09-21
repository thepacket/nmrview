"use client";
import { useEffect, useRef, useState } from "react";
import { searchDatasets, type DatasetResults } from "@/lib/repository-search";
import { Choice } from "./controls";
export function RepositoryCatalog({
  provider,
  mode,
  disabled,
  onChoose,
  term,
  onTermChange,
}: {
  provider: string;
  mode: "mri" | "nmr";
  disabled: boolean;
  onChoose: (id: string) => void;
  term: string;
  onTermChange: (value: string) => void;
}) {
  const [filter, setFilter] = useState(
    provider === "zenodo" ? "dataset" : "all",
  );
  const [results, setResults] = useState<DatasetResults | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const last = useRef({ term: "", filter: "" });
  useEffect(() => () => controller.current?.abort(), []);
  async function search(more = false) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 30000);
    setBusy(true);
    setError("");
    const request = more ? last.current : { term, filter };
    last.current = request;
    const previous = more ? results : null;
    if (!more) setResults(null);
    const display = (next: DatasetResults) => {
      if (abort.signal.aborted) return;
      setResults(
        more
          ? {
              ...next,
              checked: (previous?.checked || 0) + (next.checked || 0),
              excluded: next.excluded
                ? (Object.fromEntries(
                    Object.entries(next.excluded).map(([key, value]) => [
                      key,
                      value +
                        (previous?.excluded?.[
                          key as keyof NonNullable<DatasetResults["excluded"]>
                        ] || 0),
                    ]),
                  ) as DatasetResults["excluded"])
                : undefined,
              hits: [...(previous?.hits || []), ...next.hits].filter(
                (hit, i, all) => all.findIndex((h) => h.id === hit.id) === i,
              ),
            }
          : next,
      );
    };
    try {
      const next = await searchDatasets(
        provider,
        request.term,
        request.filter,
        abort.signal,
        more ? previous?.next : undefined,
        mode,
        display,
      );
      display(next);
    } catch (e) {
      setError(
        abort.signal.aborted
          ? "Search cancelled or timed out. Try again."
          : e instanceof TypeError
            ? "Cannot reach this repository. Please retry; direct ID lookup is also available below."
            : e instanceof Error
              ? e.message
              : String(e),
      );
    } finally {
      clearTimeout(timer);
      controller.current = null;
      setBusy(false);
    }
  }
  return (
    <div className="repository-catalog">
      <h4>Discover datasets</h4>
      <p className="hint">
        Each search checks one page of up to 10 records. Use Find more to
        continue. Requests are paced, and completed results are reused for five
        minutes.
      </p>
      <p className="hint">
        Search{" "}
        {provider === "openneuro"
          ? "public MRI datasets on OpenNeuro"
          : "open records on Zenodo"}
        . Only records with supported files are shown.
        {mode === "mri"
          ? " ZIP archives are checked for supported volumes and scans load directly online. 7z, RAR and raw scanner formats are not supported. OpenNeuro focuses on neuroimaging; use Zenodo for other body regions. Zenodo also matches knee/knees and femur/femoral."
          : " Spectrum files and ZIP contents are checked automatically."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <label htmlFor={`catalog-search-${mode}`}>Keywords</label>
        <div className="full-row">
          <input
            id={`catalog-search-${mode}`}
            className="field"
            maxLength={200}
            value={term}
            onChange={(e) => onTermChange(e.target.value)}
            disabled={busy || disabled}
            placeholder="Search by topic, title or author"
          />
          <button className="btn primary" disabled={busy || disabled}>
            Search datasets
          </button>
        </div>
        <Choice
          label="Dataset search filter"
          value={filter}
          onChange={(value) => {
            if (!busy && !disabled) setFilter(value);
          }}
          options={
            provider === "openneuro"
              ? [
                  ["all", "All MRI datasets"],
                  ["raw", "Raw acquisitions"],
                  ["derivative", "Processed derivatives"],
                ]
              : [
                  ["dataset", "Datasets only"],
                  ["all", "All open records"],
                ]
          }
        />
      </form>
      {busy && (
        <div role="status">
          Checking compatible datasets… verified results appear below as they
          arrive.{" "}
          <button
            className="btn small"
            onClick={() => controller.current?.abort()}
          >
            Cancel search
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="repository-error">
          {error}
        </p>
      )}
      {results && (
        <>
          <p role="status">
            {results.hits.length
              ? `${results.hits.length} results loaded${results.total != null ? ` · ${results.total.toLocaleString()} matches` : ""} for “${last.current.term || "all public datasets"}”`
              : "No compatible datasets found in the checked results."}
          </p>
          <p className="hint">
            {results.checked || 0} records checked
            {results.catalogTotal != null
              ? ` of ${results.catalogTotal} catalog matches`
              : ""}
            .
            {results.excluded && (
              <>
                {" "}
                {results.excluded.archives > 0 &&
                  `${results.excluded.archives} records in unsupported archives or archives without loadable volumes hidden. `}
                {results.excluded.oversized > 0 &&
                  `${results.excluded.oversized} records exceed the volume size limit. `}
                {results.excluded.unsupported > 0 &&
                  `${results.excluded.unsupported} records have no directly supported volume files. `}
                {results.excluded.unchecked > 0 &&
                  `${results.excluded.unchecked} records could not be checked; retry the search. `}
              </>
            )}
            {results.next &&
              " More catalog results remain; this is not an exhaustive result."}
          </p>
          <div className="catalog-results">
            {results.hits.map((hit) => (
              <article key={hit.id} className="catalog-result">
                <h4>{hit.title}</h4>
                <p className="hint">
                  {hit.id} · {hit.license}
                </p>
                <p>{hit.description}</p>
                {hit.compatibility && (
                  <p className="compatibility-note">{hit.compatibility}</p>
                )}
                <details>
                  <summary>Authors</summary>
                  <p>{hit.authors || "See source record"}</p>
                </details>
                <div className="full-row">
                  <button
                    className="btn"
                    disabled={disabled}
                    onClick={() => {
                      controller.current?.abort();
                      onChoose(hit.id);
                    }}
                  >
                    Browse files · {hit.id}
                  </button>
                  <a href={hit.url} target="_blank" rel="noreferrer">
                    Source ↗
                  </a>
                </div>
              </article>
            ))}
          </div>
          {results.next && (
            <button
              className="btn"
              disabled={busy || disabled}
              onClick={() => search(true)}
            >
              Find more compatible datasets
            </button>
          )}
        </>
      )}
    </div>
  );
}
