import assert from "node:assert/strict";
import { discoverMRSSupport } from "../lib/nmr/supporting-files.ts";
import type { MRSInfo } from "../lib/nmr/mrs.ts";
const info: MRSInfo = {
  name: "scan.nii.gz",
  source: "https://zenodo.org/records/123/files/scan.nii.gz",
  dims: [1, 1, 1, 16, 1, 1, 1],
  dwell: 0.001,
  frequency: 123,
  nucleus: "1H",
  affine: [],
  localized: false,
  metadata: { EchoTime: 0.03, SequenceName: "PRESS" },
};
const basis = {
  format: "nmrview-basis-1",
  name: "Reference",
  source: "Test",
  nucleus: "1H",
  frequencyMHz: 123,
  echoTimeSeconds: 0.03,
  sequence: "PRESS",
  x: Array.from({ length: 16 }, (_, i) => i),
  components: [{ name: "A", y: Array(16).fill(1) }],
};
let files = ["scan.json", "basis.json", "other-subject.nii.gz"];
let requests: string[] = [];
const download = async (url: string) => {
  requests.push(url);
  const data = url.endsWith("/123")
    ? {
        metadata: { access_right: "open" },
        files: files.map((key) => ({ key, size: 100 })),
      }
    : url.includes("scan.json")
      ? { Description: "Acquisition notes" }
      : basis;
  return new Blob([JSON.stringify(data)]);
};
const signal = new AbortController().signal;
let result = await discoverMRSSupport(info, signal, download);
assert.equal(result.basis?.name, "Reference");
assert.deepEqual(result.notes, { Description: "Acquisition notes" });
assert.equal(requests.length, 3);
assert(!requests.some((u) => u.includes("other-subject")));
result = await discoverMRSSupport(
  { ...info, frequency: 400 },
  signal,
  download,
);
assert.equal(result.basis, undefined);
files = ["basis-a.json", "basis-b.json"];
result = await discoverMRSSupport(info, signal, download);
assert.equal(result.basis, undefined);
assert.match(result.message, /Multiple/);
files = Array.from({ length: 20 }, (_, i) => `basis-${i}.json`);
requests = [];
await discoverMRSSupport(info, signal, download);
assert.equal(requests.length, 4, "Discovery must not crawl the record");
requests = [];
await discoverMRSSupport(
  {
    ...info,
    source:
      "https://s3.amazonaws.com/openneuro.org/ds000001/sub-01/mrs/sub-01_mrs.nii.gz",
  },
  signal,
  download,
);
assert.deepEqual(requests, [
  "https://s3.amazonaws.com/openneuro.org/ds000001/sub-01/mrs/sub-01_mrs.json",
]);
result = await discoverMRSSupport(info, signal, async (url) => {
  if (url.endsWith("/123")) return download(url);
  throw new Error("404");
});
assert.equal(result.basis, undefined);
console.log(
  "MRS optional-file discovery: matching, ambiguity, bounded requests, sidecars and missing files passed.",
);
