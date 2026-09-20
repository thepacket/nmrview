import type {
  Niivue,
  CompletedMeasurement,
  CompletedAngle,
} from "@niivue/niivue";
import type { AnnotationHandle } from "./annotation-store.ts";
import { MAX_LABEL_BYTES, type AnnotationRecord } from "./annotations.ts";
/** Bind one viewer to a scan record. Volume replacement invalidates this binding. */
export function bindAnnotationViewer(
  n: Niivue,
  handle: AnnotationHandle,
  changed: (record: AnnotationRecord) => void,
  failed: (message: string) => void,
) {
  const volume = n.volumes[0];
  let disposed = false,
    applying = false,
    previousBitmap: Uint8Array | null | undefined,
    previousCount = 0;
  const old = {
    distance: n.onMeasurementCompleted,
    angle: n.onAngleCompleted,
    drawing: n.onDrawingChanged,
    frame: n.onFrameChange,
  };
  const current = () => !disposed && n.volumes[0] === volume;
  function apply(value: AnnotationRecord) {
    if (!current()) return;
    applying = true;
    try {
      const values = value.measurements
        .filter((m) => m.frame === volume.frame4D)
        .map((m) => m.value);
      const redraw =
        values.length > 0 ||
        previousCount > 0 ||
        !!value.bitmap ||
        !!n.drawBitmap;
      previousCount = values.length;
      n.document.completedMeasurements = values.filter(
        (v) => "distance" in v,
      ) as CompletedMeasurement[];
      n.document.completedAngles = values.filter(
        (v) => "angle" in v,
      ) as CompletedAngle[];
      if (value.bitmap !== previousBitmap) {
        if (value.bitmap) {
          if (!n.drawBitmap) n.createEmptyDrawing();
          n.drawBitmap = value.bitmap.slice();
          n.drawClearAllUndoBitmaps();
          n.drawAddUndoBitmap();
          n.refreshDrawing(true);
        } else if (n.drawBitmap) n.closeDrawing();
        previousBitmap = value.bitmap;
      }
      if (redraw) n.drawScene();
      changed(value);
    } catch (error) {
      failed(error instanceof Error ? error.message : String(error));
    } finally {
      applying = false;
    }
  }
  function update(value: AnnotationRecord) {
    try {
      handle.update({ ...value, updatedAt: new Date().toISOString() });
    } catch (error) {
      failed(error instanceof Error ? error.message : String(error));
    }
  }
  function measure(value: CompletedMeasurement | CompletedAngle) {
    if (!current()) return;
    const point = (v: ArrayLike<number>) =>
      Array.from(v).slice(0, 3) as [number, number, number];
    const normalized =
      "distance" in value
        ? { ...value, startMM: point(value.startMM), endMM: point(value.endMM) }
        : {
            ...value,
            firstLineMM: {
              start: point(value.firstLineMM.start),
              end: point(value.firstLineMM.end),
            },
            secondLineMM: {
              start: point(value.secondLineMM.start),
              end: point(value.secondLineMM.end),
            },
          };
    update({
      ...handle.get(),
      measurements: [
        ...handle.get().measurements,
        {
          id: crypto.randomUUID(),
          name: "distance" in value ? "Distance" : "Angle",
          frame: volume.frame4D,
          value: normalized,
        },
      ],
    });
  }
  function drawing() {
    if (!current() || applying) return;
    if (n.drawBitmap && n.drawBitmap.byteLength > MAX_LABEL_BYTES) {
      failed(
        "Label map exceeds the 64 MB annotation limit. Export the NIfTI label map.",
      );
      return;
    }
    const bitmap = n.drawBitmap?.slice() || null;
    previousBitmap = bitmap;
    update({ ...handle.get(), bitmap });
  }
  const frame: Niivue["onFrameChange"] = (v, index) => {
    old.frame(v, index);
    if (!applying) apply(handle.get());
  };
  apply(handle.get());
  const unsubscribe = handle.subscribe(apply);
  n.onMeasurementCompleted = measure;
  n.onAngleCompleted = measure;
  n.onDrawingChanged = drawing;
  n.onFrameChange = frame;
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    if (n.onMeasurementCompleted === measure)
      n.onMeasurementCompleted = old.distance;
    if (n.onAngleCompleted === measure) n.onAngleCompleted = old.angle;
    if (n.onDrawingChanged === drawing) n.onDrawingChanged = old.drawing;
    if (n.onFrameChange === frame) n.onFrameChange = old.frame;
  };
}
