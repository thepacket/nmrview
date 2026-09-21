import assert from "node:assert/strict";
import {
  idcLocation,
  idcFilters,
  validIDCSeries,
  validateIDCObjects,
  type IDCSeries,
} from "../lib/idc.ts";
const s: IDCSeries = {
  collection_id: "test",
  PatientID: "public-example",
  StudyInstanceUID: "1.2.3",
  SeriesInstanceUID: "1.2.3.4",
  Modality: "MR",
  SeriesDescription: "Synthetic metadata",
  instanceCount: 2,
  series_size_MB: 1,
  series_aws_url: "s3://idc-open-data/1d7f2624-0b27-4849-96e2-2bd29407cd52/*",
};
const prefix = idcLocation(s.series_aws_url).prefix;
const objects = [
  { key: prefix + "abc.dcm", size: 100 },
  { key: prefix + "def.dcm", size: 200 },
];
assert(validIDCSeries(s));
assert(!validIDCSeries({ ...s, Modality: "CT" }));
assert(!validIDCSeries({ ...s, instanceCount: 1001 }));
assert(!validIDCSeries({ ...s, series_size_MB: 513 }));
assert.throws(() =>
  idcLocation("s3://untrusted/1d7f2624-0b27-4849-96e2-2bd29407cd52/*"),
);
assert.throws(() => idcLocation("https://example.org/file"));
validateIDCObjects(objects, s, false);
assert.throws(() => validateIDCObjects(objects, s, true));
assert.throws(() => validateIDCObjects(objects.slice(0, 1), s, false));
assert.throws(() => validateIDCObjects([objects[0], objects[0]], s, false));
assert.throws(() =>
  validateIDCObjects(
    [{ key: "other/abc.dcm", size: 100 }, objects[1]],
    s,
    false,
  ),
);
assert.throws(() =>
  validateIDCObjects(
    [{ ...objects[0], size: 513 * 1024 * 1024 }, objects[1]],
    s,
    false,
  ),
);
const filters = idcFilters("PROSTATE", "test", "public-example");
assert.deepEqual(filters.terms.Modality, ["MR"]);
assert.deepEqual(filters.terms.PatientID, ["public-example"]);
assert.equal(filters.ranges.instanceCount.lte, 1000);
console.log(
  "IDC: MRI filters, storage allowlist, size caps, duplicate and incomplete series guards passed.",
);

const { searchIDC } = await import("../lib/idc.ts");
const nativeFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (_url, init) => {
  calls++;
  const body = JSON.parse(String(init?.body));
  assert.equal(body.page_size, 10);
  assert.deepEqual(body.filters.terms.Modality, ["MR"]);
  return new Response(
    JSON.stringify({
      series: [s, { ...s, Modality: "CT" }],
      total_series: 1,
      page: 0,
      page_size: 10,
      counts: { filters_applied: body.filters, warnings: [] },
    }),
  );
};
try {
  const a = new AbortController();
  const result = await searchIDC("", "test", "", 0, a.signal);
  assert.equal(result.series.length, 1);
  await searchIDC("", "test", "", 0, a.signal);
  assert.equal(
    calls,
    1,
    "Identical searches reuse metadata without another request",
  );
  a.abort();
  await assert.rejects(searchIDC("", "test", "", 0, a.signal));
} finally {
  globalThis.fetch = nativeFetch;
}
console.log(
  "IDC: bounded query, modality filter, metadata cache and cancellation passed.",
);
