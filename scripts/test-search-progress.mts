import assert from "node:assert/strict";
import {
  searchDatasets,
  type DatasetResults,
} from "../lib/repository-search.ts";
const original = globalThis.fetch;
let archiveRequests = 0;
const updates: DatasetResults[] = [];
try {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/api/records?"))
      return Response.json({
        hits: {
          hits: [
            {
              id: 100,
              metadata: { access_right: "open", title: "Slow archive" },
              files: [{ key: "slow.zip", size: 100000 }],
            },
            {
              id: 101,
              metadata: { access_right: "open", title: "Direct volume" },
              files: [
                { key: "ignore.zip", size: 100000 },
                { key: "knee.nii.gz", size: 100 },
              ],
            },
          ],
        },
        links: { next: "next" },
      });
    archiveRequests++;
    assert.ok(
      updates.some((r) => r.hits.some((h) => h.id === "101")),
      "direct result delivered before archive request",
    );
    assert.ok(
      !String(url).includes("ignore.zip"),
      "direct volume avoids unnecessary ZIP probe",
    );
    return new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) reject(signal.reason);
      else
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
    });
  };
  // Keep Node alive while AbortSignal.timeout's unref timer models a stalled response.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const result = await searchDatasets(
      "zenodo",
      "progress fixture",
      "dataset",
      new AbortController().signal,
      undefined,
      "mri",
      (r) => updates.push(r),
    );
    assert.deepEqual(
      result.hits.map((h) => h.id),
      ["101"],
    );
    assert.equal(result.excluded?.unchecked, 1);
    assert.equal(result.next, "2");
    assert.equal(archiveRequests, 1);
  } finally {
    clearInterval(keepAlive);
  }
  console.log(
    "PASS: immediate direct results, no redundant archive probe, bounded slow checks and retained pagination.",
  );
} finally {
  globalThis.fetch = original;
}
