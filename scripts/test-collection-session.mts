import assert from "node:assert/strict";
import { parseCollectionSession } from "../lib/collection-session.ts";
const file = {
  name: "sub-01_T1w.nii.gz",
  size: 1024,
  url: "https://s3.amazonaws.com/openneuro.org/ds000001/sub-01_T1w.nii.gz",
};
const data = {
  format: "nmrview-collection",
  version: 1,
  collection: {
    id: "a",
    title: "Study",
    studies: [
      {
        id: "sub-01/",
        participant: "sub-01",
        session: "",
        initialFile: file.name,
        files: [file],
      },
    ],
    documentation: {
      title: "Study",
      source: "https://openneuro.org/datasets/ds000001",
      license: "CC0",
      authors: "Authors",
      sections: [{ title: "Case notes", text: "Test documentation" }],
      links: [],
    },
  },
  view: {
    selected: ["sub-01/"],
    choices: { "sub-01/": file.name },
    layout: "2",
    linked: true,
    filter: "01",
    notes: "sub-01/",
  },
};
assert.deepEqual(parseCollectionSession(JSON.stringify(data)), data);
function rejects(change: (d: any) => void) {
  const copy = structuredClone(data);
  change(copy);
  assert.throws(() => parseCollectionSession(JSON.stringify(copy)));
}
rejects((d) => (d.version = 2));
rejects((d) => (d.view.selected = ["missing"]));
rejects((d) => (d.view.choices["sub-01/"] = "missing.nii"));
rejects(
  (d) =>
    (d.collection.studies[0].files[0].url =
      "https://untrusted.example/scan.nii"),
);
rejects((d) => (d.collection.documentation.source = "javascript:alert(1)"));
rejects((d) => (d.view.selected = Array(5).fill("sub-01/")));
rejects((d) => (d.collection.studies[0].initialFile = "missing.nii"));
assert.throws(() => parseCollectionSession("{broken"));
console.log(
  "PASS: collection round-trip, selections, metadata, versions, limits and source URL validation.",
);
