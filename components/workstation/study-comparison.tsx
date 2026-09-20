"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Niivue } from "@niivue/niivue";
import { downloadPublic, type RepositoryFile } from "@/lib/repositories";
import type { Study, StudyCollection } from "@/lib/study-collection";
import { matchingScan } from "@/lib/scan-selection";
import { ScanPicker } from "./scan-picker";
import { prepareComparisonFile } from "@/lib/comparison-download";
import { CaseNotes } from "./case-documentation";
import { Choice, downloadBlob } from "./controls";
import {
  COLLECTION_STORAGE_KEY,
  readSavedCollection,
  parseCollectionSession,
} from "@/lib/collection-session";
export function StudyComparison({
  collection,
  onClose,
  onOpen,
}: {
  collection: StudyCollection;
  onClose: () => void;
  onOpen: (file: File) => Promise<void>;
}) {
  const [saved] = useState(() => {
    try {
      const s = readSavedCollection();
      return s && JSON.stringify(s.collection) === JSON.stringify(collection)
        ? s.view
        : null;
    } catch {
      return null;
    }
  });
  const [selected, setSelected] = useState<string[]>(
    saved?.selected || collection.studies.slice(0, 2).map((s) => s.id),
  );
  const [choices, setChoices] = useState<Record<string, string>>(
    saved?.choices || {},
  );
  const [filter, setFilter] = useState(saved?.filter || "");
  const [layout, setLayout] = useState<string>(saved?.layout || "0");
  const [linked, setLinked] = useState(saved?.linked || false);
  const [location, setLocation] = useState<{
    from: string;
    frac: number[];
  } | null>(null);
  const [notes, setNotes] = useState<string | null>(saved?.notes || null);
  const [saveStatus, setSaveStatus] = useState("");
  const [matchStatus, setMatchStatus] = useState("");
  function matchSelectedScans() {
    const first = collection.studies.find((s) => s.id === selected[0]);
    if (!first) return;
    const reference = first.files.find(
      (f) => f.name === (choices[first.id] || first.initialFile),
    )!;
    const updates: Record<string, string> = {};
    const skipped: string[] = [];
    for (const id of selected.slice(1)) {
      const study = collection.studies.find((s) => s.id === id)!;
      const match = matchingScan(reference, study.files);
      if (match.file) updates[id] = match.file.name;
      else
        skipped.push(`${study.participant} ${study.session}: ${match.reason}`);
    }
    setChoices((current) => ({ ...current, ...updates }));
    setMatchStatus(
      `${Object.keys(updates).length} studies matched to ${first.participant} ${first.session}. ${skipped.length ? `Unchanged — ${skipped.join("; ")}.` : ""} Filename matching does not verify identical acquisition parameters or registration.`,
    );
  }
  const serialized = useMemo(
    () =>
      JSON.stringify({
        format: "nmrview-collection",
        version: 1,
        collection,
        view: { selected, choices, filter, layout, linked, notes },
      }),
    [collection, selected, choices, filter, layout, linked, notes],
  );
  useEffect(() => {
    try {
      const valid = parseCollectionSession(serialized);
      localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(valid));
      setSaveStatus(
        "Collection saved on this browser. Scan data reloads from the repository.",
      );
    } catch {
      setSaveStatus(
        "Browser saving unavailable. Export the collection to keep your work.",
      );
    }
  }, [serialized]);
  const study = collection.studies.find((s) => s.id === notes);
  const file = study?.files.find(
    (f) => f.name === (choices[study.id] || study.initialFile),
  );
  return (
    <section className="study-comparison" aria-label="Participant comparison">
      <header>
        <div>
          <h2>{collection.title}</h2>
          <p>
            {collection.studies.length} participant/session studies ·{" "}
            {selected.length} displayed
          </p>
        </div>
        <button
          className="btn"
          onClick={() => setNotes(notes ? null : "dataset")}
        >
          Study documentation
        </button>
        <button className="btn" onClick={onClose}>
          Back to main viewer
        </button>
        <button
          className="btn"
          onClick={() =>
            downloadBlob(
              new Blob([serialized], { type: "application/json" }),
              "nmrview-collection.json",
            )
          }
        >
          Export collection
        </button>
      </header>
      <div className="comparison-body">
        <aside className="study-list">
          <p role="status">{saveStatus}</p>
          <input
            className="field"
            aria-label="Find participant"
            placeholder="Find participant or session"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <p>
            Choose up to four studies at once. All participants remain available
            in this list; only displayed scans are downloaded.
          </p>
          <button className="btn small" onClick={() => setSelected([])}>
            Clear comparison
          </button>
          {collection.studies
            .filter((s) => s.id.toLowerCase().includes(filter.toLowerCase()))
            .map((s) => (
              <div className="study-list-row" key={s.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    disabled={!selected.includes(s.id) && selected.length >= 4}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, s.id]
                          : ids.filter((id) => id !== s.id),
                      )
                    }
                  />
                  {s.participant} {s.session}
                </label>
                <small>{s.files.length} scans</small>
                <div>
                  <button
                    className="btn small"
                    onClick={() => setSelected([s.id])}
                  >
                    View alone
                  </button>
                  <button className="btn small" onClick={() => setNotes(s.id)}>
                    Case notes
                  </button>
                </div>
              </div>
            ))}
        </aside>
        <div className="comparison-main">
          <div className="comparison-toolbar">
            <Choice
              label="Comparison plane"
              value={layout}
              options={[
                ["0", "Axial"],
                ["1", "Coronal"],
                ["2", "Sagittal"],
                ["3", "Multiplanar"],
              ]}
              onChange={setLayout}
            />
            <label>
              <input
                type="checkbox"
                checked={linked}
                onChange={(e) => setLinked(e.target.checked)}
              />
              Link relative slice position
            </label>
            <span>Participants are not automatically registered.</span>
            <button
              className="btn small"
              disabled={selected.length < 2}
              onClick={matchSelectedScans}
            >
              Match scans to first participant
            </button>
            {matchStatus && <p role="status">{matchStatus}</p>}
          </div>
          {notes && (
            <div className="comparison-notes">
              <button className="btn" onClick={() => setNotes(null)}>
                Back to images
              </button>
              <CaseNotes
                doc={collection.documentation}
                study={study}
                file={file}
              />
            </div>
          )}
          <div
            style={{ display: notes ? "none" : undefined }}
            className={`comparison-grid ${selected.length === 1 ? "single" : ""}`}
          >
            {!selected.length && (
              <p>Select a participant from the study list.</p>
            )}
            {selected.map((id) => {
              const s = collection.studies.find((s) => s.id === id)!;
              const f = s.files.find(
                (f) => f.name === (choices[id] || s.initialFile),
              )!;
              return (
                <ComparisonPane
                  key={id}
                  study={s}
                  file={f}
                  layout={layout}
                  location={linked ? location : null}
                  onLocation={(frac) => setLocation({ from: id, frac })}
                  onFile={(name) => setChoices((c) => ({ ...c, [id]: name }))}
                  onNotes={() => setNotes(id)}
                  onOpen={onOpen}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
function ComparisonPane({
  study,
  file,
  layout,
  location,
  onLocation,
  onFile,
  onNotes,
  onOpen,
}: {
  study: Study;
  file: RepositoryFile;
  layout: string;
  location: { from: string; frac: number[] } | null;
  onLocation: (frac: number[]) => void;
  onFile: (name: string) => void;
  onNotes: () => void;
  onOpen: (file: File) => Promise<void>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    viewer = useRef<Niivue | null>(null),
    local = useRef<File | null>(null),
    locationHandler = useRef(onLocation),
    applying = useRef(false);
  locationHandler.current = onLocation;
  const downloadController = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [frame, setFrame] = useState(0),
    [frames, setFrames] = useState(1),
    [contrast, setContrast] = useState<[number, number]>([0, 1]);
  useEffect(() => {
    const abort = new AbortController();
    downloadController.current = abort;
    const signal = AbortSignal.any([
      abort.signal,
      AbortSignal.timeout(5 * 60 * 1000),
    ]);
    let lastProgress = 0;
    let n: Niivue | undefined;
    setReady(false);
    setFrames(1);
    setFrame(0);
    setError("");
    setStatus("Loading scan…");
    local.current = null;
    (async () => {
      try {
        if (file.size > 128 * 1024 * 1024)
          throw new Error(
            "This scan exceeds the 128 MB comparison download limit. Choose a smaller scan or use the main viewer.",
          );
        const { Niivue, NVImage } = await import("@niivue/niivue");
        signal.throwIfAborted();
        const blob =
          file.blob ||
          (await downloadPublic(
            file.url!,
            128 * 1024 * 1024,
            signal,
            (bytes, total) => {
              if (!signal.aborted && performance.now() - lastProgress > 100) {
                lastProgress = performance.now();
                setStatus(
                  `Loading ${(bytes / 1048576).toFixed(1)}${total ? ` / ${(total / 1048576).toFixed(1)}` : ""} MB`,
                );
              }
            },
          ));
        if (abort.signal.aborted) return;
        const scan = new File([blob], file.name.split("/").at(-1)!);
        setStatus("Preparing image…");
        const prepared = await prepareComparisonFile(blob, scan.name, signal);
        signal.throwIfAborted();
        const image = await NVImage.loadFromFile({ file: prepared });
        signal.throwIfAborted();
        if (!image.img) throw new Error("The scan contains no image data.");
        if (image.img.byteLength > 256 * 1024 * 1024)
          throw new Error(
            "This scan exceeds the comparison memory limit. Use the main viewer for large volumes.",
          );
        n = new Niivue({
          backColor: [0.03, 0.045, 0.06, 1],
          crosshairColor: [1, 0.85, 0.05, 1],
          crosshairWidth: 0.5,
          crosshairWidthUnit: "percent",
          dragAndDropEnabled: false,
          multiplanarShowRender: 0,
        });
        await n.attachToCanvas(canvas.current!);
        if (abort.signal.aborted) {
          n.cleanup();
          return;
        }
        n.addVolume(image);
        n.setSliceType(Number(layout));
        n.onLocationChange = (value) => {
          const frac = (value as { frac?: number[] }).frac;
          if (frac && !applying.current)
            locationHandler.current(Array.from(frac).slice(0, 3));
        };
        viewer.current = n;
        local.current = scan;
        setFrames(image.nFrame4D || 1);
        setFrame(0);
        setContrast([image.cal_min ?? 0, image.cal_max ?? 1]);
        setReady(true);
        setStatus("");
      } catch (e) {
        n?.cleanup();
        n = undefined;
        if (!abort.signal.aborted) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus("");
        }
      }
    })();
    return () => {
      abort.abort();
      viewer.current = null;
      local.current = null;
      n?.cleanup();
    };
  }, [file, attempt]);
  useEffect(() => {
    viewer.current?.setSliceType(Number(layout));
  }, [layout, ready]);
  useEffect(() => {
    const n = viewer.current;
    if (!n || !location || location.from === study.id) return;
    applying.current = true;
    n.scene.crosshairPos = location.frac.map((v) =>
      Math.max(0, Math.min(1, v)),
    ) as [number, number, number];
    n.drawScene();
    applying.current = false;
  }, [location, ready, study.id]);
  function adjust(index: number, value: number) {
    const n = viewer.current;
    if (!n) return;
    const next: [number, number] = [...contrast];
    next[index] = value;
    if (next[1] <= next[0]) return;
    setContrast(next);
    n.volumes[0].cal_min = next[0];
    n.volumes[0].cal_max = next[1];
    n.updateGLVolume();
  }
  return (
    <article className="comparison-pane">
      <header>
        <strong>
          {study.participant} {study.session}
        </strong>
        <button className="btn small" onClick={onNotes}>
          Case notes
        </button>
      </header>
      <ScanPicker study={study} file={file} onChange={onFile} />
      <div className="comparison-canvas">
        <canvas
          ref={canvas}
          style={{ visibility: ready ? "visible" : "hidden" }}
          aria-label={`MRI comparison ${study.id}`}
        />
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="comparison-controls">
        {status && (
          <button
            className="btn small"
            onClick={() => {
              downloadController.current?.abort();
              setStatus("");
              setError("Loading cancelled.");
            }}
          >
            Cancel loading
          </button>
        )}
        {error && (
          <button
            className="btn small"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry scan
          </button>
        )}
        <button
          className="btn small"
          disabled={!ready}
          onClick={() => {
            const n = viewer.current!;
            n.scene.crosshairPos = [0.5, 0.5, 0.5];
            n.setPan2Dxyzmm([0, 0, 0, 1]);
            n.drawScene();
          }}
        >
          Center
        </button>
        <button
          className="btn small"
          disabled={!ready}
          onClick={() => local.current && onOpen(local.current)}
        >
          Open in main viewer
        </button>
        <label>
          Low
          <input
            type="number"
            className="field"
            aria-label={`Low intensity ${study.id}`}
            disabled={!ready}
            value={Number(contrast[0].toFixed(2))}
            onChange={(e) => {
              if (Number.isFinite(e.target.valueAsNumber))
                adjust(0, e.target.valueAsNumber);
            }}
          />
        </label>
        <label>
          High
          <input
            type="number"
            className="field"
            aria-label={`High intensity ${study.id}`}
            disabled={!ready}
            value={Number(contrast[1].toFixed(2))}
            onChange={(e) => {
              if (Number.isFinite(e.target.valueAsNumber))
                adjust(1, e.target.valueAsNumber);
            }}
          />
        </label>
        {ready && frames > 1 && (
          <label>
            Frame {frame + 1}/{frames}
            <input
              aria-label={`Frame ${study.id}`}
              type="range"
              min={0}
              max={frames - 1}
              value={frame}
              onChange={(e) => {
                const value = Number(e.target.value);
                setFrame(value);
                const n = viewer.current!;
                n.setFrame4D(n.volumes[0].id, value);
              }}
            />
          </label>
        )}
      </div>
    </article>
  );
}
