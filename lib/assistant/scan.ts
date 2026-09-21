import type { Niivue } from "@niivue/niivue";
export type ScanSnapshot = {
  image: string;
  label: string;
  capturedAt: string;
  metadata: string;
};
type Source = {
  label: string;
  available: () => boolean;
  capture: () => ScanSnapshot;
};
const sources = new Map<string, Source>();
export function registerScanSource(id: string, source: Source) {
  sources.set(id, source);
  return () => {
    if (sources.get(id) === source) sources.delete(id);
  };
}
export function availableScanSources() {
  return [...sources]
    .filter(([, s]) => s.available())
    .map(([id, s]) => ({ id, label: s.label }));
}
export function captureScanSource(id: string) {
  const source = sources.get(id);
  if (!source?.available())
    throw new Error(
      "This view is no longer available. Refresh the displayed scan list.",
    );
  return source.capture();
}
export function snapshotCanvas(n: Niivue, label: string): ScanSnapshot {
  const canvas = n.canvas;
  if (!canvas || !canvas.width || !canvas.height || !n.volumes.length)
    throw new Error("Wait for the scan to finish loading.");
  // Render and copy synchronously: WebGL's default framebuffer may be cleared after the frame.
  n.drawScene();
  const target = document.createElement("canvas");
  const scale = Math.min(1, 1536 / Math.max(canvas.width, canvas.height));
  target.width = Math.max(1, Math.round(canvas.width * scale));
  target.height = Math.max(1, Math.round(canvas.height * scale));
  const context = target.getContext("2d");
  if (!context) throw new Error("Could not capture this view.");
  context.fillStyle = "black";
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(canvas, 0, 0, target.width, target.height);
  const image = target.toDataURL("image/jpeg", 0.92);
  if (image.length > 3000000)
    throw new Error("Snapshot is too large. Use a smaller single-plane view.");
  return {
    image,
    label,
    capturedAt: new Date().toISOString(),
    metadata: JSON.stringify({
      scope:
        "Rendered viewport only, not the full MRI volume. Display settings and overlays affect appearance.",
      layout: n.opts.sliceType,
      radiological: n.opts.isRadiologicalConvention,
      nativeSampling: n.opts.isNearestInterpolation,
      cursorFraction: Array.from(n.scene.crosshairPos),
      layers: n.volumes.map((v) => ({
        name: v.name,
        dimensions: v.hdr?.dims,
        voxelSpacing: v.hdr?.pixDims,
        frame: v.frame4D,
        contrast: [v.cal_min, v.cal_max],
        opacity: v.opacity,
      })),
    }).slice(0, 12000),
  };
}
