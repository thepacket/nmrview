import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import {
  repositoryId,
  compatibilitySummary,
  supportedFile,
  downloadPublic,
  unpackSpectra,
} from "../lib/repositories.ts";
assert.equal(
  repositoryId("https://openneuro.org/datasets/ds000228", "openneuro"),
  "ds000228",
);
assert.equal(
  repositoryId("https://doi.org/10.5281/zenodo.4616665", "zenodo"),
  "4616665",
);
assert.throws(() => repositoryId("ds000228/../../private", "openneuro"));
assert.throws(() => repositoryId("https://example.com/4616665", "zenodo"));
assert.equal(supportedFile("test.nii.gz", "mri"), true);
assert.equal(supportedFile("notes.pdf", "nmr"), false);
const zip = new Blob([
  zipSync({
    "folder/test.jdx": strToU8("test"),
    "__MACOSX/._test.jdx": strToU8("ignored"),
    "readme.txt": strToU8("ignored"),
  }),
]);
const files = await unpackSpectra(zip);
assert.deepEqual(
  files.map((f) => f.name),
  ["folder/test.jdx"],
);
assert.equal(await files[0].blob!.text(), "test");
await assert.rejects(unpackSpectra(new Blob(["not a zip"])));
await assert.rejects(
  downloadPublic("http://localhost/data", 10, new AbortController().signal),
  /Unsupported/,
);
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () =>
    new Response("123456", { headers: { "content-length": "6" } });
  await assert.rejects(
    downloadPublic("https://zenodo.org/file", 5, new AbortController().signal),
    /size limit/,
  );
  globalThis.fetch = async () => new Response("123456");
  await assert.rejects(
    downloadPublic("https://zenodo.org/file", 5, new AbortController().signal),
    /size limit/,
  );
  globalThis.fetch = async () => new Response("1234");
  assert.equal(
    await (
      await downloadPublic(
        "https://zenodo.org/file",
        5,
        new AbortController().signal,
      )
    ).text(),
    "1234",
  );
  globalThis.fetch = async () => new Response("", { status: 429 });
  await assert.rejects(
    downloadPublic("https://zenodo.org/file", 5, new AbortController().signal),
    /429/,
  );
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  "PASS: repository identifiers, compatible formats, ZIP extraction, URL restrictions, response size limits and HTTP errors.",
);

assert.match(
  compatibilitySummary(["results.xlsx", "paper.pdf"], "mri"),
  /Documents or spreadsheets/,
);
assert.match(
  compatibilitySummary(["NANOG IHC.zip"], "nmr"),
  /contents unverified/,
);
assert.match(compatibilitySummary(["tissue.jpg"], "mri"), /pathology/);
assert.match(compatibilitySummary(["scan.nii.gz"], "nmr"), /MRI imaging/);
