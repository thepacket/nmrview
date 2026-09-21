"use client";
import { useEffect, useRef, useState } from "react";
import { searchPage, type DatasetResults } from "@/lib/repository-search";
import {
  spectroscopyCandidates,
  spectroscopyRecord,
  type SpectroscopyKind,
} from "@/lib/nmr/catalog";
export function SpectroscopyBrowser({
  kind,
  disabled,
  onLoad,
}: {
  kind: SpectroscopyKind;
  disabled: boolean;
  onLoad: (url: string) => void;
}) {
  const [provider, setProvider] = useState<"zenodo" | "openneuro">("zenodo");
  const [term, setTerm] = useState(kind === "mrs" ? "NIfTI-MRS" : "2D NMR");
  const [id, setId] = useState("");
  const [results, setResults] = useState<DatasetResults | null>(null);
  const [record, setRecord] = useState<Awaited<
    ReturnType<typeof spectroscopyRecord>
  > | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const lastTerm = useRef("");
  const recordId = useRef("");
  const cache = useRef(
    new Map<string, { time: number; value: DatasetResults }>(),
  );
  useEffect(() => () => controller.current?.abort(), []);
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const a = new AbortController();
    controller.current = a;
    setBusy(true);
    setError("");
    const timeout = setTimeout(() => a.abort(), 30000);
    try {
      await work(a.signal);
    } catch (e) {
      setError(
        a.signal.aborted
          ? "Lookup cancelled or timed out. Existing results are retained."
          : (e as Error).message,
      );
    } finally {
      clearTimeout(timeout);
      controller.current = null;
      setBusy(false);
    }
  }
  function search(more = false) {
    const query = more ? lastTerm.current : term;
    const cursor = more ? results?.next : undefined;
    void run(async (signal) => {
      const key = JSON.stringify([query, cursor]);
      const saved = cache.current.get(key);
      const page =
        saved && Date.now() - saved.time < 300000
          ? saved.value
          : await searchPage("zenodo", query, "all", signal, cursor);
      signal.throwIfAborted();
      if (cache.current.size > 20) cache.current.clear();
      cache.current.set(key, { time: Date.now(), value: page });
      const hits = page.hits.filter(
        (h) => spectroscopyCandidates(h.files || [], kind).length,
      );
      setResults({
        ...page,
        hits: more
          ? [...(results?.hits || []), ...hits].filter(
              (h, i, a) => a.findIndex((x) => x.id === h.id) === i,
            )
          : hits,
      });
      lastTerm.current = query;
    });
  }
  function open(value: string, more = false) {
    void run(async (signal) => {
      const next = await spectroscopyRecord(
        provider,
        value,
        kind,
        signal,
        more ? record?.next : undefined,
      );
      signal.throwIfAborted();
      setRecord({
        ...next,
        files: more ? [...(record?.files || []), ...next.files] : next.files,
      });
      recordId.current = value;
    });
  }
  return (
    <details className="spectroscopy-browser">
      <summary>Browse online acquisitions</summary>
      <p className="hint">
        Choose a record, then load a spectrum. Only candidate file types within
        the import size limit are listed; their contents are validated on load.
        Archives and raw vendor files are excluded.
      </p>
      <label>
        Repository
        <select
          className="field"
          value={provider}
          disabled={busy || disabled}
          onChange={(e) => {
            setProvider(e.target.value as typeof provider);
            setRecord(null);
            setError("");
          }}
        >
          <option value="zenodo">Zenodo</option>
          {kind === "mrs" && <option value="openneuro">OpenNeuro</option>}
        </select>
      </label>
      {provider === "zenodo" && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <label>
              Search spectra
              <input
                className="field"
                value={term}
                maxLength={200}
                onChange={(e) => setTerm(e.target.value)}
              />
            </label>
            <button className="btn" disabled={busy || disabled || !term.trim()}>
              Search
            </button>
          </form>
          <p className="hint">
            Ten records per search page; results reused for five minutes. No
            acquisition files are downloaded during search.
          </p>
          {results && (
            <div>
              {results.hits.length === 0 && (
                <p>
                  No candidate files on this page. Try another term or check the
                  next page.
                </p>
              )}
              {results.hits.map((h) => (
                <button
                  key={h.id}
                  className="btn"
                  style={{
                    whiteSpace: "normal",
                    textAlign: "left",
                    width: "100%",
                  }}
                  disabled={busy || disabled}
                  onClick={() => open(h.id)}
                >
                  {h.title} ·{" "}
                  {spectroscopyCandidates(h.files || [], kind).length} candidate
                  files
                </button>
              ))}
              {results.next && (
                <button
                  className="btn"
                  disabled={busy || disabled}
                  onClick={() => search(true)}
                >
                  Find more records
                </button>
              )}
            </div>
          )}
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          open(id);
        }}
      >
        <label>
          {provider === "zenodo"
            ? "Record ID or record URL"
            : "Dataset ID or dataset URL"}
          <input
            className="field"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder={provider === "zenodo" ? "5085449" : "ds000001"}
          />
        </label>
        <button className="btn" disabled={busy || disabled || !id.trim()}>
          Open record
        </button>
      </form>
      {busy && (
        <p role="status">
          Checking repository…{" "}
          <button className="btn" onClick={() => controller.current?.abort()}>
            Cancel
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {record && (
        <section>
          <h4>{record.title}</h4>
          <a href={record.source} target="_blank" rel="noreferrer">
            Case documentation & license
          </a>
          {!record.files.length && (
            <p>
              No candidate spectra found{record.next ? " on this page" : ""}.{" "}
              {provider === "openneuro"
                ? "Only files in BIDS mrs folders are included."
                : "Ordinary MRI volumes may use the same extension as MRS; the loader checks the header."}
            </p>
          )}
          {record.files.map((f) => (
            <div
              key={f.url}
              style={{ overflowWrap: "anywhere", marginBlock: 12 }}
            >
              <span>
                {f.name} ·{" "}
                {f.size < 1024 * 1024
                  ? `${Math.ceil(f.size / 1024)} KB`
                  : `${(f.size / 1024 / 1024).toFixed(1)} MB`}
              </span>
              <button
                className="btn"
                disabled={busy || disabled}
                onClick={() => onLoad(f.url!)}
              >
                Load {kind === "mrs" ? "MRS" : "2D spectrum"}
              </button>
            </div>
          ))}
          {record.next && (
            <button
              className="btn"
              disabled={busy || disabled}
              onClick={() => open(recordId.current, true)}
            >
              More files
            </button>
          )}
        </section>
      )}
    </details>
  );
}
