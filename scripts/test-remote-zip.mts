import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { onlineZipVolumes, downloadZipVolume } from "../lib/remote-zip.ts";
import { compatibleFiles } from "../lib/repository-compatibility.ts";
import { downloadPublic } from "../lib/repositories.ts";
const original = globalThis.fetch;
const scan = new Uint8Array(4000).map((_, i) => i % 251);
let bytes = zipSync({
  "sub-01/anat/sub-01_T1w.nii": scan,
  "README.txt": strToU8("test"),
  "../unsafe.nii": scan,
  "photo.png": scan,
});
let requests = 0;
const signal = new AbortController().signal;
let wrongRange = false,
  fullResponse = false,
  corrupt = false;
globalThis.fetch = async (url, options) => {
  requests++;
  assert.equal(options?.credentials, "omit");
  assert.equal(new URL(String(url)).hash, "");
  const match = new Headers(options?.headers)
    .get("Range")!
    .match(/^bytes=(\d+)-(\d+)$/)!;
  const start = Number(match[1]),
    end = Number(match[2]);
  const part = bytes.slice(start, end + 1);
  if (corrupt && start > 0 && part.length > 30) part[0] ^= 255;
  return new Response(part, {
    status: fullResponse ? 200 : 206,
    headers: {
      "Content-Range": `bytes ${wrongRange ? start + 1 : start}-${end}/${bytes.length}`,
    },
  });
};
try {
  const file = {
    name: "images.zip",
    size: bytes.length,
    url: "https://zenodo.org/api/records/123/files/images.zip/content",
  };
  const files = await onlineZipVolumes(file, signal);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "images/sub-01/anat/sub-01_T1w.nii");
  assert.deepEqual(
    new Uint8Array(
      await (await downloadPublic(files[0].url!, 10000, signal)).arrayBuffer(),
    ),
    scan,
  );
  assert.equal((await compatibleFiles([file], "mri", signal)).length, 1);
  await assert.rejects(downloadZipVolume(files[0].url!, 10, signal), /limit/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(onlineZipVolumes(file, cancelled.signal), /abort/i);
  wrongRange = true;
  await assert.rejects(
    onlineZipVolumes({ ...file, url: file.url.replace("123", "124") }, signal),
    /wrong.*range/,
  );
  wrongRange = false;
  fullResponse = true;
  await assert.rejects(
    onlineZipVolumes({ ...file, url: file.url.replace("123", "125") }, signal),
    /partial downloads/,
  );
  fullResponse = false;
  corrupt = true;
  await assert.rejects(downloadZipVolume(files[0].url!, 10000, signal));
  await assert.rejects(
    onlineZipVolumes({ ...file, url: "https://example.com/files.zip" }, signal),
    /address/,
  );
  corrupt = false;
  // ZIP64 end records, even when this small fixture does not need 64-bit offsets.
  const oldEnd = bytes.length - 22;
  const old = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const z64 = new Uint8Array(bytes.length + 76);
  z64.set(bytes.subarray(0, oldEnd));
  const zv = new DataView(z64.buffer);
  zv.setUint32(oldEnd, 0x06064b50, true);
  zv.setBigUint64(oldEnd + 4, BigInt(44), true);
  zv.setBigUint64(oldEnd + 24, BigInt(old.getUint16(oldEnd + 10, true)), true);
  zv.setBigUint64(oldEnd + 32, BigInt(old.getUint16(oldEnd + 10, true)), true);
  zv.setBigUint64(oldEnd + 40, BigInt(old.getUint32(oldEnd + 12, true)), true);
  zv.setBigUint64(oldEnd + 48, BigInt(old.getUint32(oldEnd + 16, true)), true);
  zv.setUint32(oldEnd + 56, 0x07064b50, true);
  zv.setBigUint64(oldEnd + 64, BigInt(oldEnd), true);
  zv.setUint32(oldEnd + 72, 1, true);
  z64.set(bytes.subarray(oldEnd), oldEnd + 76);
  zv.setUint16(oldEnd + 76 + 10, 65535, true);
  bytes = z64;
  const zip64 = await onlineZipVolumes(
    { ...file, size: bytes.length, url: file.url.replace("123", "126") },
    signal,
  );
  assert.equal(zip64.length, 1);
  assert.deepEqual(
    new Uint8Array(
      await (
        await downloadZipVolume(zip64[0].url!, 10000, signal)
      ).arrayBuffer(),
    ),
    scan,
  );
  await assert.rejects(
    onlineZipVolumes(
      { ...file, size: bytes.length, url: file.url.replace("123", "127") },
      signal,
      { remaining: 1 },
    ),
    /budget/,
  );
  bytes = zipSync({ "knee.nii": [scan, { level: 0 }] });
  const stored = await onlineZipVolumes(
    { ...file, size: bytes.length, url: file.url.replace("123", "128") },
    signal,
  );
  assert.deepEqual(
    new Uint8Array(
      await (
        await downloadZipVolume(stored[0].url!, 10000, signal)
      ).arrayBuffer(),
    ),
    scan,
  );
  console.log(
    "PASS: remote ZIP listing, selective extraction, integrity, unsafe paths, limits, cancellation, range validation and no full-download fallback.",
  );
} finally {
  globalThis.fetch = original;
}
