"use client";
import { useEffect, useRef, useState } from "react";
import {
  idcBodyParts,
  idcCollections,
  filterIDCCollections,
  groupIDCExaminations,
  type IDCCollection,
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
  const [catalog, setCatalog] = useState<IDCCollection[] | null>(null);
  const [catalogTerm, setCatalogTerm] = useState("");
  const [catalogLimit, setCatalogLimit] = useState(10);
  const [exam, setExam] = useState("");
  const [parts, setParts] = useState<string[]>([]),
    [body, setBody] = useState(""),
    [collection, setCollection] = useState(""),
    [participant, setParticipant] = useState("");
  const [result, setResult] = useState<IDCPage | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [replace, setReplace] = useState(true);
  const catalogPanel = useRef<HTMLDetailsElement>(null);
  const resultsPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result) resultsPanel.current?.scrollIntoView({ block: "nearest" });
  }, [result]);
  const controller = useRef<AbortController | null>(null),
    last = useRef(["", "", "", ""]);
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
  function search(page = 0, more = false, scope?: string[]) {
    const filters = more
      ? last.current
      : scope || [body, collection.trim(), participant.trim(), exam];
    void run("Searching IDC MRI series…", async (signal) => {
      const r = await searchIDC(
        filters[0],
        filters[1],
        filters[2],
        page,
        signal,
        filters[3],
      );
      signal.throwIfAborted();
      last.current = filters;
      setResult(
        more
          ? {
              ...r,
              series: [...(result?.series || []), ...r.series].filter(
                (s, i, a) =>
                  a.findIndex(
                    (x) => x.SeriesInstanceUID === s.SeriesInstanceUID,
                  ) === i,
              ),
            }
          : r,
      );
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
  const matches = filterIDCCollections(catalog || [], catalogTerm);
  return (
    <section aria-label="IDC MRI browser">
      <h4>Imaging Data Commons · MRI</h4>
      <p>
        Free public MRI series. Search metadata first; images download only when
        you choose a series. Up to 1,000 DICOM files / 512 MB per series.
      </p>
      <details open ref={catalogPanel}>
        <summary>Browse MRI collections by name or anatomy</summary>
        {!catalog ? (
          <button
            className="btn"
            disabled={!!busy}
            onClick={() =>
              void run("Reading MRI collection catalog…", async (signal) =>
                setCatalog(await idcCollections(signal)),
              )
            }
          >
            Browse MRI collections
          </button>
        ) : (
          <>
            <label>
              Find a collection
              <input
                className="field"
                value={catalogTerm}
                maxLength={200}
                onChange={(e) => {
                  setCatalogTerm(e.target.value);
                  setCatalogLimit(10);
                }}
                placeholder="e.g. prostate, breast, brain"
              />
            </label>
            <p className="hint">
              {matches.length} MRI collections. Filtering names, anatomy and
              descriptions is local; typing sends no requests. Series counts
              include all MRI sizes.
            </p>
            {matches.slice(0, catalogLimit).map((c) => (
              <article className="data-choice" key={c.collection_id}>
                <h4>{c.collection_name}</h4>
                <p>
                  {c.tumor_locations || "Anatomy not specified"} ·{" "}
                  {c.cancer_types}
                </p>
                <p>
                  {c.series_count.toLocaleString()} MRI series · {c.subjects}{" "}
                  participants across the collection
                </p>
                <details>
                  <summary>Collection description</summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{c.description}</p>
                </details>
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={() => {
                    if (catalogPanel.current) catalogPanel.current.open = false;
                    setCollection(c.collection_id);
                    setParticipant("");
                    setBody("");
                    setExam("");
                    search(0, false, ["", c.collection_id, "", ""]);
                  }}
                >
                  Browse {c.collection_name}
                </button>
              </article>
            ))}
            {!matches.length && (
              <p>
                No matching MRI collections. Try a broader anatomy or disease
                term.
              </p>
            )}
            {matches.length > catalogLimit && (
              <button
                className="btn"
                onClick={() => setCatalogLimit((n) => n + 10)}
              >
                Show more collections
              </button>
            )}
          </>
        )}
      </details>
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
          onChange={(e) => {
            setCollection(e.target.value);
            setExam("");
          }}
        />
      </label>
      {exam && (
        <p>
          Exam filter active{" "}
          <button
            className="btn"
            disabled={!!busy}
            onClick={() => {
              setExam("");
              search(0, false, [body, collection, participant, ""]);
            }}
          >
            Clear examination filter
          </button>
        </p>
      )}
      <label>
        Participant ID (optional)
        <input
          className="field"
          value={participant}
          maxLength={128}
          disabled={!!busy}
          onChange={(e) => {
            setParticipant(e.target.value);
            setExam("");
          }}
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
        <div ref={resultsPanel}>
          <p>
            {result.total_series.toLocaleString()} matching series ·{" "}
            {result.series.length} loaded from {result.page + 1} page(s)
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
          <p className="hint">
            Groups contain only the pages loaded so far, not necessarily every
            sequence in an examination. Browse an examination to narrow the
            search. Sequence names are repository descriptions; matching
            examinations do not guarantee registered images.
          </p>
          {groupIDCExaminations(result.series).map((group) => (
            <section key={group.key} className="data-choice">
              <h3>Participant {group.participant}</h3>
              <p>
                {group.collection} · {group.series.length} loaded sequence(s)
              </p>
              <details>
                <summary>Examination identifier</summary>
                <p style={{ overflowWrap: "anywhere" }}>{group.study}</p>
              </details>
              <button
                className="btn"
                disabled={!!busy}
                onClick={() => {
                  setCollection(group.collection);
                  setParticipant(group.participant);
                  setBody("");
                  setExam(group.study);
                  search(0, false, [
                    "",
                    group.collection,
                    group.participant,
                    group.study,
                  ]);
                }}
              >
                Browse this examination
              </button>
              {group.series.map((s) => (
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
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() => load(s)}
                  >
                    Load complete series
                  </button>
                </article>
              ))}
            </section>
          ))}
          <div className="full-row">
            <button
              className="btn"
              disabled={
                !!busy ||
                result.page >= 19 ||
                (result.page + 1) * result.page_size >= result.total_series
              }
              onClick={() => search(result.page + 1, true)}
            >
              Load more series
            </button>
          </div>
          {result.page >= 19 && (
            <p>
              Reached the 200-series browsing limit. Narrow to a collection,
              participant or examination.
            </p>
          )}
        </div>
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
