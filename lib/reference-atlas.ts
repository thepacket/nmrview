export type AtlasQuality = "detail" | "light";
export function defaultAtlasQuality(): AtlasQuality {
  // Large reference volumes are opt-in, regardless of device capability.
  return "light";
}
export async function referenceAtlas(
  quality: AtlasQuality,
  signal: AbortSignal,
  progress: (text: string) => void,
) {
  if (quality === "light")
    return { url: "/data/mni-t1.nii.gz", name: "MNI152_T1.nii.gz" };
  const response = await fetch("/data/mni-hires/manifest.json", { signal });
  if (!response.ok) throw new Error("High-detail atlas is unavailable.");
  const manifest = (await response.json()) as {
    name: string;
    bytes: number;
    parts: { name: string; bytes: number; sha256: string }[];
  };
  if (
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes <= 0 ||
    manifest.bytes > 160 * 1024 * 1024 ||
    manifest.parts.length > 8 ||
    manifest.parts.reduce((n, p) => n + p.bytes, 0) !== manifest.bytes
  )
    throw new Error("Invalid atlas manifest.");
  const data = new Uint8Array(manifest.bytes);
  let offset = 0;
  for (const p of manifest.parts) {
    if (
      !/^t1-\d{2}\.bin$/.test(p.name) ||
      !Number.isSafeInteger(p.bytes) ||
      p.bytes <= 0 ||
      p.bytes > 24 * 1024 * 1024
    )
      throw new Error("Invalid atlas part.");
    progress(
      `Loading 0.5 mm reference · ${Math.round((offset / manifest.bytes) * 100)}% (121 MiB)…`,
    );
    const r = await fetch(`/data/mni-hires/${p.name}`, { signal });
    if (!r.ok) throw new Error("Could not download high-detail atlas.");
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength !== p.bytes)
      throw new Error("Incomplete atlas download.");
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    if (digest !== p.sha256) throw new Error("Atlas integrity check failed.");
    signal.throwIfAborted();
    data.set(new Uint8Array(bytes), offset);
    offset += bytes.byteLength;
  }
  progress("Preparing 0.5 mm reference for display…");
  return { url: manifest.name, buffer: data.buffer, name: manifest.name };
}
