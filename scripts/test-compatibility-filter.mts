import assert from "node:assert/strict";
import { searchDatasets } from "../lib/repository-search.ts";
import { compatibleFiles } from "../lib/repository-compatibility.ts";
const original = globalThis.fetch;
let requests = 0;
try {
  globalThis.fetch = async (url) => {
    requests++;
    const page = new URL(String(url)).searchParams.get("page");
    return Response.json({
      hits: {
        hits:
          page === "1"
            ? [
                {
                  id: 4683021,
                  metadata: { access_right: "open", title: "Pathology" },
                  files: [{ key: "IHC.xlsx", size: 100 }],
                },
              ]
            : [
                {
                  id: 7,
                  metadata: { access_right: "open", title: "MRI" },
                  files: [{ key: "scan.nii.gz", size: 100 }],
                },
              ],
      },
      links: page === "1" ? { next: "next" } : {},
    });
  };
  const signal = new AbortController().signal;
  const result = await searchDatasets(
    "zenodo",
    "parathyroid",
    "dataset",
    signal,
  );
  assert.deepEqual(
    result.hits.map((h) => h.id),
    ["7"],
  );
  assert.equal(requests, 2); // Empty incompatible page skipped without user intervention.
  assert.equal(result.total, undefined); // Never present unfiltered total as compatible count.
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    assert.equal(u.searchParams.get("size"), "25");
    const page = Number(u.searchParams.get("page"));
    return Response.json({
      hits: {
        total: 100,
        hits: [
          {
            id: page,
            metadata: { access_right: "open", title: "Knee imaging" },
            files: [
              { key: page === 4 ? "knee.nii.gz" : "images.7z", size: 100 },
            ],
          },
        ],
      },
      links: page < 4 ? { next: "next" } : {},
    });
  };
  const deeper = await searchDatasets("zenodo", "knee", "dataset", signal);
  assert.deepEqual(
    deeper.hits.map((h) => h.id),
    ["4"],
    "continues beyond the old three-page cutoff",
  );
  assert.equal(deeper.checked, 4);
  assert.equal(deeper.excluded?.archives, 3);
  assert.equal(deeper.catalogTotal, 100);
  const originalNow = Date.now;
  let elapsed = 0;
  Date.now = () => {
    elapsed += 50000;
    return elapsed;
  };
  try {
    const bounded = await searchDatasets("zenodo", "femur", "dataset", signal);
    assert.equal(bounded.checked, 1);
    assert.equal(
      bounded.next,
      "2",
      "time budget preserves the continuation instead of timing out the whole search",
    );
  } finally {
    Date.now = originalNow;
  }

  assert.deepEqual(
    await compatibleFiles(
      [
        { name: "pathology.jpg", size: 100 },
        { name: "measurements.xlsx", size: 100 },
      ],
      "nmr",
      signal,
    ),
    [],
  );
  assert.deepEqual(
    await compatibleFiles(
      [{ name: "huge.zip", size: 61 * 1024 * 1024 }],
      "nmr",
      signal,
    ),
    [],
  );
  assert.equal(requests, 2); // Obviously incompatible files require no downloads.
} finally {
  globalThis.fetch = original;
}
console.log(
  "PASS: incompatible records hidden, compatible records retained, empty pages skipped and oversize archives excluded.",
);
