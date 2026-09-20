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
  assert.deepEqual(result.hits, []);
  assert.equal(result.next, "2");
  assert.equal(requests, 1);
  await searchDatasets("zenodo", "parathyroid", "dataset", signal);
  assert.equal(requests, 1, "repeat search uses cache");
  const second = await searchDatasets(
    "zenodo",
    "parathyroid",
    "dataset",
    signal,
    "2",
  );
  assert.deepEqual(
    second.hits.map((h) => h.id),
    ["7"],
  );
  assert.equal(
    requests,
    2,
    "only an explicit continuation fetches another page",
  );
  assert.equal(result.total, undefined);
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    assert.equal(u.searchParams.get("size"), "10");
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
  assert.deepEqual(deeper.hits, []);
  assert.equal(deeper.next, "2");
  assert.equal(deeper.checked, 1);
  assert.equal(deeper.excluded?.archives, 1);
  assert.equal(deeper.catalogTotal, 100);
  const fourth = await searchDatasets("zenodo", "knee", "dataset", signal, "4");
  assert.deepEqual(
    fourth.hits.map((h) => h.id),
    ["4"],
  );

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
  let throttledRequests = 0;
  globalThis.fetch = async () => {
    throttledRequests++;
    return new Response("", { status: 429 });
  };
  await assert.rejects(
    searchDatasets("zenodo", "throttle", "dataset", signal),
    /pause requests/,
  );
  await assert.rejects(
    searchDatasets("zenodo", "another", "dataset", signal),
    /pause requests/,
  );
  assert.equal(
    throttledRequests,
    1,
    "search never retries or bypasses cooldown",
  );
} finally {
  globalThis.fetch = original;
}
console.log(
  "PASS: incompatible records hidden, compatible records retained, explicit pagination and cached searches and oversize archives excluded.",
);
