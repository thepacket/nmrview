import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { prepareComparisonFile } from "../lib/comparison-download.ts";
const signal = new AbortController().signal;
const blob = new Blob([gzipSync("bounded image data")]);
const file = await prepareComparisonFile(blob, "test.nii.gz", signal, 100);
assert.equal(file.name, "test.nii");
assert.equal(await file.text(), "bounded image data");
await assert.rejects(
  prepareComparisonFile(blob, "test.nii.gz", signal, 5),
  /comparison limit/,
);
await assert.rejects(
  prepareComparisonFile(new Blob(["invalid"]), "test.nii.gz", signal),
);
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  prepareComparisonFile(blob, "test.nii.gz", aborted.signal),
);
assert.equal(
  (await prepareComparisonFile(new Blob(["raw"]), "test.nii", signal)).name,
  "test.nii",
);
console.log(
  "PASS: streamed gzip expansion, expansion limit, corrupt gzip, cancellation and uncompressed files.",
);
