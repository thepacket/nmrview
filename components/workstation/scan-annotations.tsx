"use client";
import { useEffect, useRef, useState } from "react";
import type { Niivue } from "@niivue/niivue";
import {
  annotationMetadata,
  assertAnnotationTarget,
  exportAnnotations,
  importAnnotations,
  type AnnotationRecord,
} from "@/lib/annotations";
import { openAnnotations, type AnnotationHandle } from "@/lib/annotation-store";
import { bindAnnotationViewer } from "@/lib/annotation-viewer";
import { downloadBlob } from "./controls";
export function ScanAnnotations({
  getViewer,
  ready,
  source,
  name,
  active = true,
  open = true,
  onLocate,
}: {
  getViewer: () => Niivue | null;
  ready: boolean;
  source: string;
  name: string;
  active?: boolean;
  open?: boolean;
  onLocate?: (slice: number) => void;
}) {
  const viewer = ready ? getViewer() : null;
  const viewerGetter = useRef(getViewer);
  viewerGetter.current = getViewer;
  const [record, setRecord] = useState<AnnotationRecord | null>(null);
  const [status, setStatus] = useState("Loading annotations…");
  const [error, setError] = useState("");
  const [tool, setTool] = useState("locate");
  const [pen, setPen] = useState("1");
  const handle = useRef<AnnotationHandle | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const locate = useRef(onLocate);
  locate.current = onLocate;
  const commit = (next: AnnotationRecord) => {
    try {
      handle.current?.update({ ...next, updatedAt: new Date().toISOString() });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    const viewer = ready ? viewerGetter.current() : null;
    if (!viewer || !active || !viewer.volumes[0]) return;
    const n = viewer,
      volume = n.volumes[0];
    let disposed = false,
      subscription: (() => void) | undefined,
      opened: AnnotationHandle | undefined;
    const dims = volume.dimsRAS?.slice(1, 4) as [number, number, number];
    const grid = JSON.stringify({
      dims,
      affine: volume.hdr?.affine,
      datatype: volume.hdr?.datatypeCode,
      bytes: volume.img?.byteLength,
      frames: volume.nFrame4D || 1,
    });
    const initial: AnnotationRecord = {
      format: "nmrview-annotations",
      version: 1,
      source,
      grid,
      name,
      dimensions: dims,
      frames: volume.nFrame4D || 1,
      updatedAt: new Date().toISOString(),
      notes: "",
      labels: [
        { value: 1, name: "Region 1" },
        { value: 2, name: "Region 2" },
        { value: 3, name: "Region 3" },
        { value: 4, name: "Region 4" },
      ],
      measurements: [],
      bitmap: null,
    };
    setRecord(null);
    setError("");
    setStatus("Loading annotations…");
    void openAnnotations(initial, setStatus)
      .then((h) => {
        opened = h;
        if (disposed) {
          h.close();
          return;
        }
        handle.current = h;
        subscription = bindAnnotationViewer(n, h, setRecord, setError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      disposed = true;
      subscription?.();
      opened?.close();
      handle.current = null;
    };
  }, [ready, source, name, active]);
  function chooseTool(value: string) {
    if (!viewer || !record) return;
    setTool(value);
    viewer.setDrawingEnabled(value === "draw" || value === "erase");
    if (value === "draw" || value === "erase")
      viewer.setPenValue(value === "erase" ? 0 : Number(pen));
    viewer.setMouseEventConfig({
      leftButton: {
        primary: value === "distance" ? 2 : value === "angle" ? 7 : 8,
        withShift: 3,
      },
      rightButton: 9,
      centerButton: 3,
    });
  }
  async function act(operation: () => Promise<void>) {
    try {
      setError("");
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <section
      className="scan-annotations"
      hidden={!open}
      aria-label={`Annotations ${name}`}
    >
      <p className="eyebrow">Scan annotations</p>
      <p role="status">{status}</p>
      {error && <p role="alert">{error}</p>}
      {record && (
        <>
          <div className="full-row">
            <label>
              Tool{" "}
              <select
                className="field"
                value={tool}
                onChange={(e) => chooseTool(e.target.value)}
              >
                <option value="locate">Locate</option>
                <option value="distance">Distance</option>
                <option value="angle">Angle</option>
                <option value="draw">Draw label</option>
                <option value="erase">Erase label</option>
              </select>
            </label>
            <label>
              Label{" "}
              <select
                className="field"
                value={pen}
                onChange={(e) => {
                  setPen(e.target.value);
                  if (tool === "draw")
                    viewer?.setPenValue(Number(e.target.value));
                }}
              >
                {record.labels.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.value} · {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn small" onClick={() => viewer?.drawUndo()}>
              Undo stroke
            </button>
            <button
              className="btn small"
              onClick={() => commit({ ...record, bitmap: null })}
            >
              Clear labels
            </button>
          </div>
          <p className="hint">
            Measurements belong to their time frame. Labels cover the spatial
            volume across frames. Edit in slice views. Geometry and header units
            must be verified before interpreting measurements.
          </p>
          {record.labels.map((l) => (
            <label key={l.value} className="annotation-label">
              Label {l.value}
              <input
                className="field"
                aria-label={`Label ${l.value} name`}
                defaultValue={l.name}
                key={l.name}
                maxLength={80}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== l.name)
                    commit({
                      ...record,
                      labels: record.labels.map((item) =>
                        item.value === l.value ? { ...item, name } : item,
                      ),
                    });
                }}
              />
            </label>
          ))}
          {record.measurements.map((m) => (
            <div className="annotation" key={m.id}>
              <input
                className="field"
                aria-label={`Measurement name ${m.id}`}
                key={m.name}
                defaultValue={m.name}
                maxLength={100}
                onBlur={(e) => {
                  if (e.target.value !== m.name)
                    commit({
                      ...record,
                      measurements: record.measurements.map((item) =>
                        item.id === m.id
                          ? { ...item, name: e.target.value }
                          : item,
                      ),
                    });
                }}
              />
              <span>
                {"distance" in m.value
                  ? `${m.value.distance.toFixed(2)} mm`
                  : `${m.value.angle.toFixed(1)}°`}{" "}
                · frame {m.frame + 1}
              </span>
              <button
                className="btn small"
                onClick={() => {
                  if (!viewer) return;
                  const v = m.value;
                  viewer.setFrame4D(viewer.volumes[0].id, m.frame);
                  viewer.scene.crosshairPos = Array.from(
                    viewer.mm2frac(
                      "distance" in v ? v.startMM : v.firstLineMM.start,
                    ),
                  ) as [number, number, number];
                  viewer.setSliceType(v.sliceType);
                  locate.current?.(v.sliceType);
                  viewer.drawScene();
                }}
              >
                Locate
              </button>
              <button
                className="btn small"
                onClick={() =>
                  commit({
                    ...record,
                    measurements: record.measurements.filter(
                      (v) => v.id !== m.id,
                    ),
                  })
                }
              >
                Delete
              </button>
            </div>
          ))}
          <label>
            Scan notes
            <textarea
              className="field"
              aria-label={`Annotation notes ${name}`}
              key={record.notes}
              defaultValue={record.notes}
              maxLength={20000}
              onBlur={(e) => {
                if (e.target.value !== record.notes)
                  commit({ ...record, notes: e.target.value });
              }}
            />
          </label>
          <div className="full-row">
            <button
              className="btn small"
              onClick={() =>
                downloadBlob(
                  exportAnnotations(handle.current!.get()),
                  "nmrview-annotations.nmra",
                )
              }
            >
              Export annotations
            </button>
            <button
              className="btn small"
              onClick={() => input.current?.click()}
            >
              Import annotations
            </button>
            <button
              className="btn small"
              onClick={() =>
                downloadBlob(
                  JSON.stringify(
                    annotationMetadata(handle.current!.get()),
                    null,
                    2,
                  ),
                  "nmrview-measurements.json",
                )
              }
            >
              Measurement report
            </button>
            <button
              className="btn small"
              disabled={!record.bitmap}
              onClick={() =>
                void act(async () => {
                  await viewer?.saveImage({
                    filename: "nmrview-labels.nii.gz",
                    isSaveDrawing: true,
                    volumeByIndex: 0,
                  });
                })
              }
            >
              NIfTI labels
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept=".nmra"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void act(async () => {
                  const imported = await importAnnotations(file);
                  assertAnnotationTarget(imported, record.source, record.grid);
                  if (
                    JSON.stringify(imported.dimensions) !==
                      JSON.stringify(record.dimensions) ||
                    imported.frames !== record.frames
                  )
                    throw new Error(
                      "Annotation dimensions or frame count differ from the loaded scan.",
                    );
                  commit(imported);
                });
            }}
          />
          <p className="hint">
            Packages contain measurements, label names, scan notes and the label
            map; no source images. Import replaces this scan's annotations. Save
            a package to move work between browsers.
          </p>
        </>
      )}
    </section>
  );
}
