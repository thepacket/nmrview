import type { NVImage } from "@niivue/niivue";
let source: (() => NVImage | undefined) | undefined;
export function registerMRSAnatomy(get: () => NVImage | undefined) {
  source = get;
  return () => {
    if (source === get) source = undefined;
  };
}
export function cloneMRSAnatomy() {
  const image = source?.();
  if (!image?.img)
    throw new Error(
      "Load a matching anatomical scan in the main MRI view first.",
    );
  if (image.img.byteLength > 128 * 1024 * 1024)
    throw new Error("Anatomical reference exceeds the 128 MB review limit.");
  return image.clone();
}
