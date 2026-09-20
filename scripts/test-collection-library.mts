import assert from "node:assert/strict";
import {
  parseLibrary,
  saveLibrary,
  LIBRARY_KEY,
} from "../lib/collection-library.ts";
const file = {
  name: "sub-01_T1w.nii.gz",
  size: 100,
  url: "https://s3.amazonaws.com/openneuro.org/ds000001/sub-01_T1w.nii.gz",
};
const session: any = {
  format: "nmrview-collection",
  version: 1,
  collection: {
    id: "ds000001",
    title: "Test study",
    studies: [
      {
        id: "sub-01",
        participant: "sub-01",
        session: "",
        initialFile: file.name,
        files: [file],
      },
    ],
    documentation: {
      title: "Test study",
      source: "https://openneuro.org/datasets/ds000001",
      license: "CC0",
      authors: "Test",
      sections: [],
      links: [],
    },
  },
  view: {
    selected: ["sub-01"],
    choices: {},
    layout: "3",
    linked: false,
    filter: "",
    notes: null,
    panes: {},
  },
};
const entry = {
  id: "one",
  name: "My study",
  savedAt: "2026-09-20T00:00:00Z",
  session,
};
let raw: string | null = null;
const store = {
  setItem(key: string, value: string) {
    assert.equal(key, LIBRARY_KEY);
    raw = value;
  },
};
assert.deepEqual(parseLibrary(null), []);
saveLibrary(store, [entry]);
assert.deepEqual(parseLibrary(raw), [entry]);
saveLibrary(store, [{ ...entry, name: "Renamed" }]);
assert.equal(parseLibrary(raw)[0].name, "Renamed");
const previous = raw;
assert.throws(() =>
  saveLibrary(
    {
      setItem() {
        throw Error("QuotaExceeded");
      },
    },
    [entry],
  ),
);
assert.equal(raw, previous);
assert.throws(() => saveLibrary(store, [entry, entry]));
assert.equal(raw, previous);
assert.throws(() => saveLibrary(store, [{ ...entry, name: " " }]));
const invalid = structuredClone(entry);
invalid.session.view.selected = ["unknown"];
assert.throws(() => saveLibrary(store, [invalid]));
saveLibrary(store, []);
assert.deepEqual(parseLibrary(raw), []);
console.log(
  "PASS: named collection snapshots, rename, deletion, validation and quota failure preservation.",
);
