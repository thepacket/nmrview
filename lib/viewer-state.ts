import type { Niivue } from "@niivue/niivue";
import type { PaneView } from "./collection-session";

export type ViewMode = "fit" | "manual";
export function inferViewMode(view: Pick<PaneView, "pan" | "mode">): ViewMode {
  return (
    view.mode ??
    (view.pan.some((v, i) => Math.abs(v - (i === 3 ? 1 : 0)) > 1e-6)
      ? "manual"
      : "fit")
  );
}
export function zoomForScale(
  zoom: number,
  actual: number,
  desired: number,
): number {
  if (![zoom, actual, desired].every((v) => Number.isFinite(v) && v > 0))
    return zoom;
  return Math.max(0.01, Math.min(100, (zoom * desired) / actual));
}

/** Shared adapter for main and comparison views. No image bytes live in this state.
 * NiiVue owns physical pan coordinates; this adapter preserves CSS pixels/mm on resize.
 * Fit is explicit: cursor navigation and contrast changes never switch it to Manual.
 */
export class ScanViewController {
  mode: ViewMode = "fit";
  private scale: number | undefined;
  private lastPan: number[] = [0, 0, 0, 1];
  private applying = false;
  private disposed = false;
  private raf = 0;
  private pointers = new Set<number>();
  private originalResize: () => void;
  private resize: () => void;
  private canvas: HTMLCanvasElement;
  private n: Niivue;
  private changed: (view: PaneView) => void;

  constructor(n: Niivue, changed: (view: PaneView) => void) {
    this.n = n;
    this.changed = changed;
    this.canvas = n.canvas!;
    this.originalResize = n.resizeListener;
    this.resize = () => this.preserveScale(() => this.originalResize.call(n));
    n.resizeListener = this.resize;
    this.canvas.addEventListener("pointerdown", this.pointerDown);
    window.addEventListener("pointerup", this.pointerUp);
    window.addEventListener("pointercancel", this.pointerUp);
    this.canvas.addEventListener("wheel", this.queueCapture, { passive: true });
    this.canvas.addEventListener("keyup", this.queueCapture);
  }
  get interacting() {
    return this.pointers.size > 0;
  }
  private pointerDown = (e: PointerEvent) => {
    this.pointers.add(e.pointerId);
    // Keep a drag in its originating canvas even when it crosses another pane.
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* detached canvas */
    }
  };
  private pointerUp = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId)) return;
    this.queueCapture();
  };
  private queueCapture = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      if (!this.disposed) this.capture();
    });
  };
  private pixelsPerMM(): number | undefined {
    const tile = this.n.screenSlices.find(
      (s) => s.axCorSag >= 0 && s.axCorSag < 3 && Math.abs(s.fovMM[0]) > 0,
    );
    const dpr =
      this.n.canvas!.width / this.n.canvas!.getBoundingClientRect().width;
    const value = tile
      ? Math.abs(tile.leftTopWidthHeight[2] / tile.fovMM[0]) / dpr
      : NaN;
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  private preserveScale(action: () => void) {
    if (this.disposed || this.applying) {
      action();
      return;
    }
    // Ignore hidden/zero-sized workspaces; their last valid physical scale survives.
    const bounds = this.canvas.parentElement?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    this.applying = true;
    try {
      const target = this.scale;
      if (this.mode === "fit") this.n.scene.pan2Dxyzmm = [0, 0, 0, 1];
      action();
      const actual = this.pixelsPerMM();
      if (this.mode === "manual" && target && actual) {
        const pan = Array.from(this.n.scene.pan2Dxyzmm);
        pan[3] = zoomForScale(pan[3], actual, target);
        this.n.setPan2Dxyzmm(pan);
      }
      this.capture(false);
    } finally {
      this.applying = false;
    }
  }
  setLayout(layout: number) {
    this.preserveScale(() => this.n.setSliceType(layout));
  }
  fit() {
    this.mode = "fit";
    this.n.setPan2Dxyzmm([0, 0, 0, 1]);
    this.n.setScale(1);
    this.capture(false);
  }
  setZoom(zoom: number) {
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    this.mode = "manual";
    const pan = Array.from(this.n.scene.pan2Dxyzmm);
    pan[3] = zoom;
    this.n.setPan2Dxyzmm(pan);
    this.n.setScale(zoom);
    this.capture(false);
  }
  capture(detectGesture = true): PaneView | undefined {
    if (this.disposed) return;
    const image = this.n.volumes[0];
    if (!image) return;
    const pan = Array.from(this.n.scene.pan2Dxyzmm) as PaneView["pan"];
    if (
      detectGesture &&
      !this.applying &&
      pan.some((v, i) => Math.abs(v - this.lastPan[i]) > 1e-6)
    )
      this.mode = "manual";
    this.lastPan = [...pan];
    this.scale = this.pixelsPerMM() ?? this.scale;
    const view: PaneView = {
      mode: this.mode,
      pixelsPerMM: this.scale,
      contrast: [image.cal_min ?? 0, image.cal_max ?? 1],
      cursor: Array.from(this.n.scene.crosshairPos).map((v) =>
        Math.max(0, Math.min(1, v)),
      ) as PaneView["cursor"],
      pan,
      frame: image.frame4D || 0,
    };
    this.changed(view);
    return view;
  }
  restore(view: PaneView) {
    const image = this.n.volumes[0];
    if (!image) return;
    this.applying = true;
    try {
      this.mode = inferViewMode(view);
      this.n.scene.crosshairPos = [...view.cursor];
      image.cal_min = view.contrast[0];
      image.cal_max = view.contrast[1];
      this.n.setFrame4D(
        image.id,
        Math.min(view.frame, (image.nFrame4D || 1) - 1),
      );
      this.n.setPan2Dxyzmm(this.mode === "fit" ? [0, 0, 0, 1] : [...view.pan]);
      this.n.updateGLVolume();
      this.n.drawScene();
      const actual = this.pixelsPerMM();
      if (this.mode === "manual" && view.pixelsPerMM && actual) {
        const pan = Array.from(this.n.scene.pan2Dxyzmm);
        pan[3] = zoomForScale(pan[3], actual, view.pixelsPerMM);
        this.n.setPan2Dxyzmm(pan);
      }
      this.capture(false);
    } finally {
      this.applying = false;
    }
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.n.resizeListener === this.resize)
      this.n.resizeListener = this.originalResize;
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    window.removeEventListener("pointerup", this.pointerUp);
    window.removeEventListener("pointercancel", this.pointerUp);
    this.canvas.removeEventListener("wheel", this.queueCapture);
    this.canvas.removeEventListener("keyup", this.queueCapture);
  }
}
