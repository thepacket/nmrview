"use client";
import { useEffect, useRef, useState } from "react";
import {
  browseRepository,
  downloadPublic,
  repositoryId,
  unpackSpectra,
  type RepositoryRecord,
  type RepositoryFile,
} from "@/lib/repositories";
import { compatibleArchiveEntries } from "@/lib/repository-compatibility";
import { RepositoryCatalog } from "./repository-catalog";
import {
  describeRepositoryFile,
  recommendedFile,
} from "@/lib/repository-file-guide";
import {
  groupStudies,
  loadCaseDocumentation,
  type CaseDocumentation,
  type StudyCollection,
} from "@/lib/study-collection";
import { Choice } from "./controls";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
export function RepositoryBrowser({
  mode,
  onLoad,
  onCollection,
  onDocumentation,
}: {
  mode: "mri" | "nmr";
  onLoad: (files: File[], source: string, replace: boolean) => Promise<void>;
  onCollection?: (collection: StudyCollection) => void;
  onDocumentation?: (doc: CaseDocumentation) => void;
}) {
  const [provider, setProvider] = useState(
    mode === "mri" ? "openneuro" : "zenodo",
  );
  const [catalogTerm, setCatalogTerm] = useState(
    mode === "mri" ? "brain" : "NMR",
  );
  const [input, setInput] = useState(mode === "mri" ? "ds000228" : "4616665");
  const [record, setRecord] = useState<RepositoryRecord | null>(null);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const recordPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (record)
      recordPanel.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [record]);
  const loaded = useRef({ provider: "", id: "" });
  useEffect(() => () => controller.current?.abort(), []);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 300000);
    setError("");
    try {
      await action(abort.signal);
    } catch (e) {
      setError(
        abort.signal.aborted
          ? "Request cancelled or timed out. Your current study is unchanged."
          : e instanceof TypeError
            ? "Cannot reach the repository. Check your connection or try again later; the repository may block browser access."
            : e instanceof Error
              ? e.message
              : String(e),
      );
    } finally {
      clearTimeout(timer);
      controller.current = null;
      setBusy("");
    }
  }
  function browse(more = false, selectedId?: string) {
    run(async (signal) => {
      const id = more
        ? loaded.current.id
        : repositoryId(selectedId || input, provider);
      const source = more ? loaded.current.provider : provider;
      setBusy("Reading repository…");
      const result = await browseRepository(
        source,
        id,
        mode,
        signal,
        more ? record?.next : undefined,
      );
      if (signal.aborted) return;
      loaded.current = { provider: source, id };
      setRecord(
        more
          ? { ...result, files: [...(record?.files || []), ...result.files] }
          : result,
      );
      if (!more) {
        setSelected([]);
        setQuery("");
        setSubject("all");
      }
    });
  }
  async function fetchFile(file: RepositoryFile, signal: AbortSignal) {
    if (file.blob) return file.blob;
    const limit = (mode === "mri" ? 512 : 60) * 1024 * 1024;
    return downloadPublic(file.url!, limit, signal, (bytes, total) =>
      setBusy(
        `Downloading ${file.name.split("/").at(-1)} · ${mb(bytes)}${total ? ` / ${mb(total)}` : ""}`,
      ),
    );
  }
  function archive(file: RepositoryFile) {
    run(async (signal) => {
      setBusy("Downloading archive…");
      const blob = await fetchFile(file, signal);
      setBusy("Opening spectrum archive…");
      const files = await compatibleArchiveEntries(
        await unpackSpectra(blob, signal),
        signal,
      );
      if (signal.aborted) return;
      setRecord((r) => r && { ...r, files });
      setSelected([]);
      setQuery("");
    });
  }
  async function documentation(signal: AbortSignal) {
    return loadCaseDocumentation(
      loaded.current.provider,
      loaded.current.id,
      {
        title: record!.title,
        source: record!.source,
        license: record!.license,
        authors: record!.authors,
      },
      signal,
    );
  }
  function loadCollection() {
    run(async (signal) => {
      let all = [...record!.files],
        next = record!.next;
      let pages = 0;
      while (next) {
        if (++pages > 100)
          throw new Error(
            "Study listing exceeds 100 pages. Please use a smaller dataset.",
          );
        setBusy(
          `Discovering all participants… ${all.length} scan files indexed`,
        );
        const page = await browseRepository(
          loaded.current.provider,
          loaded.current.id,
          mode,
          signal,
          next,
        );
        all.push(...page.files);
        next = page.next;
      }
      const unique = [...new Map(all.map((f) => [f.name, f])).values()];
      const studies = groupStudies(unique);
      if (!studies.length)
        throw new Error(
          "This dataset has no participant identifiers in its filenames. Choose files individually.",
        );
      setBusy("Reading study and participant documentation…");
      const doc = await documentation(signal);
      if (signal.aborted) return;
      onCollection?.({
        id: record!.source,
        title: record!.title,
        studies,
        documentation: doc,
      });
    });
  }
  function load(names = selected) {
    run(async (signal) => {
      const chosen = record!.files.filter((f) => names.includes(f.name));
      if (!chosen.length) throw new Error("Select at least one file.");
      if (mode === "mri" && onCollection && groupStudies(chosen).length > 1) {
        setBusy("Preparing participant comparison and documentation…");
        const doc = await documentation(signal);
        onCollection({
          id: record!.source,
          title: record!.title,
          studies: groupStudies(chosen),
          documentation: doc,
        });
        return;
      }
      if (
        chosen.length > 24 ||
        chosen.reduce((n, f) => n + f.size, 0) >
          (mode === "mri" ? 512 : 60) * 1024 * 1024
      )
        throw new Error(
          `Select at most 24 files totaling ${mode === "mri" ? 512 : 60} MB.`,
        );
      const files: File[] = [];
      let downloaded = 0;
      for (const file of chosen) {
        setBusy(`Downloading ${file.name}…`);
        const blob = await fetchFile(file, signal);
        downloaded += blob.size;
        if (downloaded > (mode === "mri" ? 512 : 60) * 1024 * 1024)
          throw new Error("Selected downloads exceed the import size limit.");
        files.push(
          new File(
            [blob],
            `${loaded.current.provider}_${loaded.current.id}__${file.name.replaceAll("/", "__")}`,
          ),
        );
      }
      if (signal.aborted) return;
      setBusy("Reading study documentation…");
      const doc = onDocumentation ? await documentation(signal) : undefined;
      setBusy("Opening data in viewer…");
      await onLoad(
        files,
        `${record!.title} · ${record!.source} · ${record!.license}`,
        replace,
      );
      if (doc) onDocumentation?.(doc);
    });
  }
  const subjects = [
    ...new Set(
      (record?.files || [])
        .map((f) => describeRepositoryFile(f.name, mode).subject)
        .filter(Boolean),
    ),
  ].sort();
  const scopedFiles = (record?.files || []).filter(
    (f) =>
      subject === "all" ||
      describeRepositoryFile(f.name, mode).subject === subject,
  );
  const recommendation = recommendedFile(scopedFiles, mode);
  return (
    <div className="repository-browser">
      <h3>Public online repositories</h3>
      <p>
        Free public downloads directly into this browser. The repository
        receives download requests; your local scans are never uploaded.
      </p>
      <label>Repository</label>
      <Choice
        label="Online repository"
        value={provider}
        options={
          mode === "mri"
            ? [
                ["openneuro", "OpenNeuro · MRI"],
                ["zenodo", "Zenodo · public records"],
              ]
            : [["zenodo", "Zenodo · public records"]]
        }
        onChange={(v) => {
          if (busy) return;
          setProvider(v);
          setInput(v === "openneuro" ? "ds000228" : "4616665");
          setRecord(null);
          setSelected([]);
        }}
      />
      <RepositoryCatalog
        key={provider}
        term={catalogTerm}
        onTermChange={setCatalogTerm}
        provider={provider}
        mode={mode}
        disabled={!!busy}
        onChoose={(id) => {
          setInput(id);
          browse(false, id);
        }}
      />
      <h4>Open a known dataset</h4>
      <label htmlFor={`repository-id-${mode}`}>
        {provider === "openneuro"
          ? "Dataset ID or URL"
          : "Record number or URL"}
      </label>
      <div className="full-row">
        <input
          id={`repository-id-${mode}`}
          className="field"
          value={input}
          disabled={!!busy}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn" disabled={!!busy} onClick={() => browse()}>
          Browse
        </button>
      </div>
      {record && (
        <div ref={recordPanel}>
          <h4>{record.title}</h4>
          <p className="hint">{record.authors}</p>
          <p>
            License: {record.license} ·{" "}
            <a href={record.source} target="_blank" rel="noreferrer">
              Source and citation ↗
            </a>
          </p>
          {loaded.current.provider === "openneuro" && (
            <p className="hint">
              Latest public S3 mirror; not a pinned version. Choose anatomical
              NIfTI files for structural images. Diffusion and functional scans
              may contain many frames.
            </p>
          )}
          {mode === "mri" && onCollection && (
            <div className="file-start-guide">
              <h4>Participant collection</h4>
              <p>
                Load the complete participant list, including later pages. Each
                participant/session stays separate. Compare up to four scans at
                a time and consult the study and case documentation.
              </p>
              <button
                className="btn primary"
                disabled={!!busy}
                onClick={loadCollection}
              >
                Load all participants for comparison
              </button>
            </div>
          )}
          <div className="file-start-guide">
            <h4>
              {mode === "mri"
                ? "Start with an anatomical scan"
                : "Start with one spectrum"}
            </h4>
            <p>
              {mode === "mri"
                ? "Choose one participant and one T1 or T2 scan to explore anatomy. Masks are optional overlays; functional and diffusion files contain multiple frames."
                : "You do not need to load the entire dataset. Start with one named spectrum, then add comparison spectra if needed."}
            </p>
            {!!subjects.length && (
              <Choice
                label="Participant"
                value={subject}
                options={[
                  ["all", "All participants"],
                  ...subjects.map((s) => [s, s] as [string, string]),
                ]}
                onChange={(v) => {
                  setSubject(v);
                  setSelected([]);
                }}
              />
            )}
            {recommendation ? (
              <>
                <strong>
                  {mode === "mri"
                    ? "Suggested starting scan"
                    : "Suggested first spectrum"}
                  : {describeRepositoryFile(recommendation.name, mode).label}
                </strong>
                <p>
                  {describeRepositoryFile(recommendation.name, mode).context}
                </p>
                <p className="hint">
                  {recommendation.name.split("/").at(-1)} ·{" "}
                  {mb(recommendation.size)}
                </p>
                <button
                  className="btn primary"
                  disabled={!!busy}
                  onClick={() => load([recommendation.name])}
                >
                  {mode === "mri"
                    ? "Load starting scan"
                    : "Load first spectrum"}
                </button>
                <p className="hint">
                  {mode === "mri"
                    ? "Suggested from filenames among the files loaded so far; this does not identify a tumor or establish clinical suitability."
                    : "This is a starting example, not a ranking of scientific relevance."}
                </p>
              </>
            ) : scopedFiles.some((f) => /\.zip$/i.test(f.name)) ? (
              <p>
                Click <strong>Open spectrum collection</strong> below. We will
                show the individual spectra and suggest one to start with.
              </p>
            ) : (
              <p>
                No recognizable anatomical starting scan on this page.{" "}
                {record.next
                  ? "Load more files below to look for one."
                  : "Use the descriptions below to choose a volume; its acquisition type may not be identifiable from the filename."}
              </p>
            )}
          </div>
          <input
            className="field"
            aria-label="Filter repository files"
            placeholder="Filter loaded files, e.g. T1w or sub-01"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="repository-files">
            {scopedFiles
              .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
              .map((f) => (
                <div className="repository-file" key={f.name}>
                  {/\.zip$/i.test(f.name) ? (
                    <button
                      className="btn small"
                      disabled={!!busy}
                      onClick={() => archive(f)}
                    >
                      Open spectrum collection
                    </button>
                  ) : (
                    <input
                      type="checkbox"
                      aria-label={`Select ${f.name}`}
                      checked={selected.includes(f.name)}
                      disabled={!!busy}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, f.name]
                            : s.filter((n) => n !== f.name),
                        )
                      }
                    />
                  )}
                  <span>
                    <strong>
                      {describeRepositoryFile(f.name, mode).label}
                    </strong>
                    <span className="file-guide-context">
                      {describeRepositoryFile(f.name, mode).context}
                    </span>
                    <span className="file-guide-context">
                      {describeRepositoryFile(f.name, mode).help}
                    </span>
                    <details>
                      <summary>Filename</summary>
                      {f.name}
                    </details>
                  </span>
                  <small>{mb(f.size)}</small>
                </div>
              ))}
          </div>
          {!record.files.length && (
            <p>
              No compatible files on this page.{" "}
              {record.next
                ? "Load the next page."
                : "MRI supports NIfTI, NRRD and MGH/MGZ; NMR supports processed 1D JCAMP and two-column CSV/TSV. Other files require local preparation."}
            </p>
          )}
          {record.next && (
            <button
              className="btn small"
              disabled={!!busy}
              onClick={() => browse(true)}
            >
              Load more files
            </button>
          )}
          <label className="repository-replace">
            <input
              type="checkbox"
              checked={replace}
              disabled={!!busy}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Replace current {mode === "mri" ? "study" : "spectra"}
          </label>
          {mode === "mri" && !replace && (
            <p>
              Add layers only when already registered to the same anatomy. No
              automatic alignment is performed.
            </p>
          )}
          <button
            className="btn primary"
            disabled={!!busy || !selected.length}
            onClick={() => load()}
          >
            Load {selected.length || "selected"} file
            {selected.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
      {busy && (
        <div role="status">
          <p>{busy}</p>
          <button
            className="btn small"
            onClick={() => controller.current?.abort()}
          >
            Cancel download
          </button>
        </div>
      )}
      {error && (
        <p className="repository-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
