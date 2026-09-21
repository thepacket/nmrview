"use client";
import { useEffect, useRef, useState } from "react";
import {
  idcBodyParts,
  searchIDC,
  downloadIDCSeries,
  idcDocumentation,
  type IDCPage,
  type IDCSeries,
} from "@/lib/idc";
import type { CaseDocumentation } from "@/lib/study-collection";
export function IDCBrowser({
  onLoad,
  onDocumentation,
}: {
  onLoad: (files: File[], source: string, replace: boolean) => Promise<void>;
  onDocumentation?: (doc: CaseDocumentation) => void;
}) {
  const [parts, setParts] = useState<string[]>([]),
    [body, setBody] = useState(""),
    [collection, setCollection] = useState(""),
    [participant, setParticipant] = useState("");
  const [result, setResult] = useState<IDCPage | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [replace, setReplace] = useState(true);
  const controller = useRef<AbortController | null>(null),
    last = useRef(["", "", ""]);
  useEffect(() => () => controller.current?.abort(), []);
  async function run(
    message: string,
    work: (signal: AbortSignal) => Promise<void>,
    timeout = 30000,
  ) {
    if (controller.current) return;
    const a = new AbortController();
    controller.current = a;
    setBusy(message);
    setError("");
    const timer = setTimeout(() => a.abort(), timeout);
    try {
      await work(a.signal);
    } catch (e) {
      setError(
        a.signal.aborted
          ? "Cancelled or timed out. No partial download was opened."
          : (e as Error).message,
      );
    } finally {
      clearTimeout(timer);
      controller.current = null;
      setBusy("");
    }
  }
  function search(page = 0, more = false) {
    const filters = more
      ? last.current
      : [body, collection.trim(), participant.trim()];
    void run("Searching IDC MRI series…", async (signal) => {
      const r = await searchIDC(
        filters[0],
        filters[1],
        filters[2],
        page,
        signal,
      );
      signal.throwIfAborted();
      last.current = filters;
      setResult(r);
    });
  }
  function load(series: IDCSeries) {
    void run(
      "Reading source documentation…",
      async (signal) => {
        const doc = await idcDocumentation(series, signal);
        const files = await downloadIDCSeries(series, signal, setBusy);
        signal.throwIfAborted();
        setBusy("Converting DICOM in your browser…");
        await onLoad(
          files,
          `${series.collection_id} · ${series.SeriesInstanceUID}`,
          replace,
        );
        onDocumentation?.(doc);
      },
      300000,
    );
  }
  return (
    <section aria-label="IDC MRI browser">
      <h4>Imaging Data Commons · MRI</h4>
      <p>
        Free public MRI series. Search metadata first; images download only when
        you choose a series. Up to 1,000 DICOM files / 512 MB per series.
      </p>
      <button
        className="btn"
        disabled={!!busy}
        onClick={() =>
          void run("Reading body regions…", async (signal) =>
            setParts(await idcBodyParts(signal)),
          )
        }
      >
        Load body-region filters
      </button>
      <label>
        Body region
        <select
          className="field"
          value={body}
          disabled={!!busy}
          onChange={(e) => setBody(e.target.value)}
        >
          <option value="">All regions</option>
          {parts.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <p className="hint">
        Region names come from repository metadata across all modalities; some
        have no MRI matches. Missing body-region tags are included only in All
        regions.
      </p>
      <label>
        Collection ID (optional)
        <input
          className="field"
          value={collection}
          maxLength={128}
          disabled={!!busy}
          onChange={(e) => setCollection(e.target.value)}
        />
      </label>
      <label>
        Participant ID (optional)
        <input
          className="field"
          value={participant}
          maxLength={128}
          disabled={!!busy}
          onChange={(e) => setParticipant(e.target.value)}
        />
      </label>
      <button
        className="btn primary"
        disabled={!!busy}
        onClick={() => search()}
      >
        Find MRI series
      </button>
      <p className="hint">
        Ten series per page. Searches are cached for five minutes; no automatic
        retries or background scan downloads. Collection and participant IDs use
        exact matching.
      </p>
      <label>
        <input
          type="checkbox"
          checked={replace}
          disabled={!!busy}
          onChange={(e) => setReplace(e.target.checked)}
        />{" "}
        Replace current study
      </label>
      {busy && (
        <p role="status">
          {busy}{" "}
          <button className="btn" onClick={() => controller.current?.abort()}>
            Cancel
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>
            {result.total_series.toLocaleString()} matching series · page{" "}
            {result.page + 1}
          </p>
          {result.counts.warnings?.map((w) => (
            <p key={w}>{w}</p>
          ))}
          {!result.series.length && (
            <p>
              No supported MRI series on this page. Try another region or clear
              the exact-ID filters.
            </p>
          )}
          {result.series.map((s) => (
            <article key={s.SeriesInstanceUID} className="data-choice">
              <h4>{s.SeriesDescription || "MRI series"}</h4>
              <p>
                {s.collection_id} · Participant {s.PatientID}
              </p>
              <p>
                {s.instanceCount} files · {s.series_size_MB.toFixed(1)} MB
              </p>
              <details>
                <summary>Study and series identifiers</summary>
                <p style={{ overflowWrap: "anywhere" }}>
                  Study: {s.StudyInstanceUID}
                  <br />
                  Series: {s.SeriesInstanceUID}
                </p>
              </details>
              <button className="btn" disabled={!!busy} onClick={() => load(s)}>
                Load complete series
              </button>
            </article>
          ))}
          <div className="full-row">
            <button
              className="btn"
              disabled={!!busy || result.page === 0}
              onClick={() => search(result.page - 1, true)}
            >
              Previous page
            </button>
            <button
              className="btn"
              disabled={
                !!busy ||
                (result.page + 1) * result.page_size >= result.total_series
              }
              onClick={() => search(result.page + 1, true)}
            >
              Next page
            </button>
          </div>
        </>
      )}
      <p>
        <a
          href="https://portal.imaging.datacommons.cancer.gov/collections/"
          target="_blank"
          rel="noreferrer"
        >
          Collection documentation and licenses
        </a>
      </p>
    </section>
  );
}
