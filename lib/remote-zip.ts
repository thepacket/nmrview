import type { RepositoryFile } from "./repositories.ts";
const MiB = 1024 * 1024;
const MAX_DIRECTORY = 8 * MiB;
const MAX_ENTRY = 128 * MiB;
const MARKER = "#nmrview-zip=";
type Entry = {
  name: string;
  size: number;
  compressed: number;
  offset: number;
  method: number;
  crc: number;
};
const cache = new Map<string, { at: number; entries: Entry[] }>();
function address(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "zenodo.org" ||
    u.username ||
    u.password ||
    !/^\/api\/records\/\d+\/files\/[^/]+\/content$/.test(u.pathname)
  )
    throw new Error("Unsupported online archive address.");
  u.hash = "";
  return u.href;
}
async function range(
  url: string,
  start: number,
  length: number,
  signal: AbortSignal,
) {
  if (
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > MAX_ENTRY + 65536
  )
    throw new Error("Invalid archive byte range.");
  signal.throwIfAborted();
  const response = await fetch(address(url), {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { Range: `bytes=${start}-${start + length - 1}` },
  });
  // Never fall back to downloading a multi-gigabyte archive.
  if (response.status !== 206) {
    await response.body?.cancel();
    throw new Error(
      `Online archive requires partial downloads (HTTP ${response.status}).`,
    );
  }
  const contentRange = response.headers.get("content-range");
  if (
    contentRange &&
    !contentRange.startsWith(`bytes ${start}-${start + length - 1}/`)
  ) {
    await response.body?.cancel();
    throw new Error("Repository returned the wrong archive byte range.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty archive response.");
  const bytes = new Uint8Array(length);
  let used = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (used + value.length > length)
        throw new Error("Archive response exceeds requested range.");
      bytes.set(value, used);
      used += value.length;
    }
    if (used !== length) throw new Error("Incomplete archive response.");
    return bytes;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
}
function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function uint64(v: DataView, p: number) {
  const n = Number(v.getBigUint64(p, true));
  if (!Number.isSafeInteger(n))
    throw new Error("Archive offset exceeds supported range.");
  return n;
}
export async function zipDirectory(
  url: string,
  size: number,
  signal: AbortSignal,
  budget?: { remaining: number },
): Promise<Entry[]> {
  url = address(url);
  if (!Number.isSafeInteger(size) || size < 22)
    throw new Error("Invalid archive size.");
  const key = `${url}:${size}`,
    saved = cache.get(key);
  signal.throwIfAborted();
  if (saved && Date.now() - saved.at < 300000) return saved.entries;
  const readRange = (
    source: string,
    start: number,
    length: number,
    abort: AbortSignal,
  ) => {
    if (budget) {
      if (length > budget.remaining)
        throw new Error(
          "Archive search byte budget reached. Narrow the search or browse a specific record.",
        );
      budget.remaining -= length;
    }
    return range(source, start, length, abort);
  };
  const tailStart = Math.max(0, size - 65557),
    tail = await readRange(url, tailStart, size - tailStart, signal),
    t = view(tail);
  let end = -1;
  for (let p = tail.length - 22; p >= 0; p--) {
    if (
      t.getUint32(p, true) === 0x06054b50 &&
      p + 22 + t.getUint16(p + 20, true) === tail.length
    ) {
      end = p;
      break;
    }
  }
  if (end < 0) throw new Error("Archive directory not found.");
  if (t.getUint16(end + 4, true) || t.getUint16(end + 6, true))
    throw new Error("Split ZIP archives are not supported.");
  let count = t.getUint16(end + 10, true),
    length = t.getUint32(end + 12, true),
    offset = t.getUint32(end + 16, true);
  if (count === 65535 || length === 0xffffffff || offset === 0xffffffff) {
    const locator = await readRange(url, tailStart + end - 20, 20, signal),
      l = view(locator);
    if (
      l.getUint32(0, true) !== 0x07064b50 ||
      l.getUint32(4, true) ||
      l.getUint32(16, true) !== 1
    )
      throw new Error("Invalid or split ZIP64 archive.");
    const z = view(await readRange(url, uint64(l, 8), 56, signal));
    if (
      z.getUint32(0, true) !== 0x06064b50 ||
      z.getUint32(16, true) ||
      z.getUint32(20, true)
    )
      throw new Error("Invalid ZIP64 directory.");
    count = uint64(z, 32);
    length = uint64(z, 40);
    offset = uint64(z, 48);
  }
  if (
    count > 50000 ||
    length > MAX_DIRECTORY ||
    offset + length > tailStart + end
  )
    throw new Error("Archive directory exceeds browsing limits.");
  if (!count) return [];
  const bytes =
      offset >= tailStart && offset + length <= size
        ? tail.subarray(offset - tailStart, offset - tailStart + length)
        : await readRange(url, offset, length, signal),
    v = view(bytes),
    entries: Entry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    signal.throwIfAborted();
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50)
      throw new Error("Invalid ZIP file listing.");
    const flags = v.getUint16(p + 8, true),
      method = v.getUint16(p + 10, true),
      crc = v.getUint32(p + 16, true);
    let compressed = v.getUint32(p + 20, true),
      expanded = v.getUint32(p + 24, true),
      local = v.getUint32(p + 42, true);
    const n = v.getUint16(p + 28, true),
      e = v.getUint16(p + 30, true),
      c = v.getUint16(p + 32, true),
      stop = p + 46 + n + e + c;
    if (stop > bytes.length) throw new Error("Truncated ZIP file listing.");
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + n));
    if (
      compressed === 0xffffffff ||
      expanded === 0xffffffff ||
      local === 0xffffffff
    ) {
      let found = false;
      for (let a = p + 46 + n; a + 4 <= p + 46 + n + e;) {
        const kind = v.getUint16(a, true),
          size = v.getUint16(a + 2, true);
        a += 4;
        if (a + size > p + 46 + n + e)
          throw new Error("Invalid ZIP extra field.");
        if (kind === 1) {
          let q = a;
          const next = () => {
            if (q + 8 > a + size) throw new Error("Truncated ZIP64 entry.");
            const value = uint64(v, q);
            q += 8;
            return value;
          };
          if (expanded === 0xffffffff) expanded = next();
          if (compressed === 0xffffffff) compressed = next();
          if (local === 0xffffffff) local = next();
          found = true;
          break;
        }
        a += size;
      }
      if (!found) throw new Error("Missing ZIP64 entry sizes.");
    }
    if (
      !(flags & 1) &&
      [0, 8].includes(method) &&
      expanded > 0 &&
      expanded <= MAX_ENTRY &&
      compressed > 0 &&
      compressed <= MAX_ENTRY &&
      local + 30 + compressed <= offset &&
      v.getUint16(p + 34, true) === 0 &&
      !name.includes("\\") &&
      !name.startsWith("/") &&
      !name
        .split("/")
        .some((part) => part.startsWith(".") || part === "__MACOSX")
    )
      entries.push({
        name,
        size: expanded,
        compressed,
        offset: local,
        method,
        crc,
      });
    p = stop;
  }
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), entries });
  return entries;
}
export async function onlineZipVolumes(
  file: RepositoryFile,
  signal: AbortSignal,
  budget?: { remaining: number },
): Promise<RepositoryFile[]> {
  if (!file.url) return [];
  const entries = await zipDirectory(file.url, file.size, signal, budget);
  return entries
    .filter((e) => /\.(nii(\.gz)?|nrrd|mgh|mgz)$/i.test(e.name))
    .map((e) => ({
      name: `${file.name.replace(/\.zip$/i, "")}/${e.name}`,
      size: e.size,
      url: `${address(file.url!)}${MARKER}${encodeURIComponent(JSON.stringify({ name: e.name, size: file.size, crc: e.crc }))}`,
    }));
}
export const isZipVolume = (url: string) =>
  new URL(url).hash.startsWith(MARKER);
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export async function downloadZipVolume(
  url: string,
  limit: number,
  signal: AbortSignal,
  progress?: (bytes: number, total: number) => void,
) {
  const u = new URL(url);
  address(url);
  const target = JSON.parse(decodeURIComponent(u.hash.slice(MARKER.length)));
  if (
    typeof target.name !== "string" ||
    !Number.isSafeInteger(target.size) ||
    !Number.isInteger(target.crc)
  )
    throw new Error("Invalid archive scan reference.");
  const entry = (await zipDirectory(url, target.size, signal)).find(
    (e) => e.name === target.name && e.crc === target.crc,
  );
  if (!entry)
    throw new Error(
      "The archive scan has changed or is no longer available. Browse the dataset again.",
    );
  if (entry.size > limit || entry.compressed > limit)
    throw new Error("Archive scan exceeds the download limit.");
  const header = view(await range(url, entry.offset, 30, signal));
  if (
    header.getUint32(0, true) !== 0x04034b50 ||
    header.getUint16(8, true) !== entry.method ||
    header.getUint16(6, true) & 1
  )
    throw new Error("Invalid ZIP scan header.");
  const offset =
    entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  if (offset + entry.compressed > target.size)
    throw new Error("Invalid ZIP scan location.");
  const data = await range(url, offset, entry.compressed, signal);
  progress?.(data.length, entry.compressed);
  const stream =
    entry.method === 0
      ? new Blob([data]).stream()
      : new Blob([data])
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader(),
    output = new Uint8Array(entry.size);
  let used = 0,
    crc = 0xffffffff;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (used + value.length > entry.size)
        throw new Error("ZIP scan exceeds declared size.");
      output.set(value, used);
      used += value.length;
      for (const byte of value)
        crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    }
    signal.throwIfAborted();
    if (used !== entry.size || (crc ^ 0xffffffff) >>> 0 !== entry.crc)
      throw new Error("ZIP scan integrity check failed.");
    return new Blob([output]);
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
  }
}
