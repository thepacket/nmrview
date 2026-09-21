import type { ScanSnapshot } from "../assistant/scan";
// Rasterize the exact visible SVG once after a display update. Capture never sends data.
export async function spectralSnapshot(
  svg: SVGSVGElement,
  label: string,
  metadata: object,
): Promise<ScanSnapshot> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const rect = svg.getBoundingClientRect(),
    scale = Math.min(1, 1536 / Math.max(rect.width, rect.height));
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not capture spectrum."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#090e13";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      image: canvas.toDataURL("image/jpeg", 0.92),
      label,
      capturedAt: new Date().toISOString(),
      metadata: JSON.stringify(metadata).slice(0, 12000),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasSpectrumSnapshot(
  canvas: HTMLCanvasElement,
  label: string,
  metadata: object,
): ScanSnapshot {
  const target = document.createElement("canvas"),
    scale = Math.min(1, 1536 / Math.max(canvas.width, canvas.height));
  target.width = Math.max(1, Math.round(canvas.width * scale));
  target.height = Math.max(1, Math.round(canvas.height * scale));
  target.getContext("2d")!.drawImage(canvas, 0, 0, target.width, target.height);
  return {
    image: target.toDataURL("image/jpeg", 0.92),
    label,
    capturedAt: new Date().toISOString(),
    metadata: JSON.stringify(metadata).slice(0, 12000),
  };
}
