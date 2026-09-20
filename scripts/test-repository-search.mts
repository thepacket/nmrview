import assert from "node:assert/strict";
import {
  searchPage as searchDatasets,
  zenodoSearchQuery,
} from "../lib/repository-search.ts";
assert.equal(
  zenodoSearchQuery("NMR glucose", true),
  '"NMR" AND "glucose" AND access_right:open AND resource_type.type:dataset',
);
assert.ok(zenodoSearchQuery('a"b', false).includes('a\\"b'));
const original = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => {
    const u = new URL(String(url));
    assert.equal(options?.credentials, "omit");
    if (u.hostname === "zenodo.org") {
      assert.equal(u.searchParams.get("page"), "2");
      return Response.json({
        hits: {
          total: 23,
          hits: [
            {
              id: 7,
              metadata: {
                access_right: "open",
                title: "Spectrum",
                description: "<b>Open data</b>",
                license: { id: "cc-by-4.0" },
              },
            },
            { id: 8, metadata: { access_right: "restricted" } },
          ],
        },
        links: { next: "ignored" },
      });
    }
    const variables = JSON.parse(u.searchParams.get("variables")!);
    assert.equal(variables.query.modality, "mri");
    assert.equal(variables.query.publicOnly, true);
    assert.equal(variables.query.bidsDatasetType, "raw");
    assert.equal(variables.after, "cursor2");
    assert.deepEqual(variables.query.keywords, ["motor"]);
    assert.equal(
      (options?.headers as Record<string, string>)["Content-Type"],
      "application/json",
    );
    return Response.json({
      data: {
        advancedSearch: {
          edges: [
            {
              node: {
                id: "ds000001",
                name: "MRI",
                public: true,
                metadata: { species: "human" },
              },
            },
            { node: { id: "private", public: false } },
          ],
          pageInfo: { hasNextPage: true, endCursor: "cursor3" },
        },
      },
    });
  };
  const signal = new AbortController().signal;
  const zenodo = await searchDatasets("zenodo", "NMR", "dataset", signal, "2");
  assert.equal(zenodo.hits.length, 1);
  assert.equal(zenodo.hits[0].description, "Open data");
  assert.equal(zenodo.next, "3");
  const open = await searchDatasets(
    "openneuro",
    "motor",
    "raw",
    signal,
    "cursor2",
  );
  assert.equal(open.hits.length, 1);
  assert.equal(open.next, "cursor3");
  globalThis.fetch = async () =>
    Response.json({ errors: [{ message: "unavailable" }] });
  await assert.rejects(
    searchDatasets("openneuro", "motor", "all", signal),
    /unavailable/,
  );
  await assert.rejects(
    searchDatasets("zenodo", "a".repeat(201), "all", signal),
    /200/,
  );
} finally {
  globalThis.fetch = original;
}
console.log(
  "PASS: search filters, escaped keywords, pagination, public-only results, plain-text descriptions and API errors.",
);
