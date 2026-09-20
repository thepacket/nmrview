"use client";
import { useEffect, useRef, useState } from "react";
import { searchDatasets, type DatasetResults } from "@/lib/repository-search";
import { Choice } from "./controls";
export function RepositoryCatalog({
  provider,
  mode,
  disabled,
  onChoose,
}: {
  provider: string;
  mode: "mri" | "nmr";
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  const [term, setTerm] = useState(mode === "mri" ? "brain" : "NMR");
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
    const timer = setTimeout(() => abort.abort(), 180000);
    setBusy(true);
    setError("");
    const request = more ? last.current : { term, filter };
    try {
      const next = await searchDatasets(
        provider,
        request.term,
        request.filter,
        abort.signal,
        more ? results?.next : undefined,
        mode,
      );
      if (abort.signal.aborted) return;
      last.current = request;
      setResults(
        more
          ? {
              ...next,
              hits: [...(results?.hits || []), ...next.hits].filter(
                (hit, i, all) => all.findIndex((h) => h.id === hit.id) === i,
              ),
            }
          : next,
      );
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
        Search{" "}
        {provider === "openneuro"
          ? "public MRI datasets on OpenNeuro"
          : "open records on Zenodo"}
        . Only records with supported files are shown. Spectrum files and ZIP
        contents are checked automatically.
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
            onChange={(e) => setTerm(e.target.value)}
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
          Checking compatible datasets…{" "}
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
                    disabled={busy || disabled}
                    onClick={() => onChoose(hit.id)}
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
