import assert from "node:assert/strict";
import { createAnnotationStore } from "../lib/annotation-store.ts";
import type { AnnotationRecord } from "../lib/annotations.ts";
const initial: AnnotationRecord = {
  format: "nmrview-annotations",
  version: 1,
  source: "scan",
  grid: "grid",
  name: "scan.nii",
  dimensions: [2, 2, 2],
  frames: 1,
  updatedAt: new Date().toISOString(),
  notes: "",
  labels: [],
  measurements: [],
  bitmap: null,
};
const disk = new Map<string, AnnotationRecord>();
let reads = 0,
  fail = false;
const store = createAnnotationStore(
  {
    read: async (key) => {
      reads++;
      return disk.get(key);
    },
    write: async (key, value) => {
      if (fail) throw new Error("quota");
      disk.set(key, structuredClone(value));
    },
  },
  16,
);
const statuses: string[] = [];
const [main, comparison] = await Promise.all([
  store.open(initial, (s) => statuses.push(s)),
  store.open(initial, () => {}),
]);
assert.equal(reads, 1, "concurrent views share one storage read");
let observed = "";
comparison.subscribe((value) => {
  observed = value.notes;
});
main.update({ ...main.get(), notes: "Shared note", bitmap: new Uint8Array(8) });
assert.equal(observed, "Shared note");
assert.equal(comparison.get().notes, "Shared note");
await new Promise((r) => setTimeout(r, 0));
main.close();
comparison.close();
const reopened = await store.open(initial, () => {});
assert.equal(
  reopened.get().notes,
  "Shared note",
  "reopens from persistent storage",
);
assert.equal(reads, 2);
fail = true;
reopened.update({ ...reopened.get(), notes: "Unsaved work" });
await new Promise((r) => setTimeout(r, 0));
reopened.close();
const recovered = await store.open(initial, () => {});
assert.equal(
  recovered.get().notes,
  "Unsaved work",
  "failed writes retain work in memory",
);
assert.equal(reads, 2);
const other = await store.open({ ...initial, source: "other" }, () => {});
other.update({ ...other.get(), bitmap: new Uint8Array(8) });
const third = await store.open({ ...initial, source: "third" }, () => {});
assert.throws(
  () => third.update({ ...third.get(), bitmap: new Uint8Array(8) }),
  /memory is full/,
);
assert.throws(
  () => third.update({ ...third.get(), source: "wrong" }),
  /identity/,
);
console.log(
  "PASS: shared annotation views, persistent reopening, concurrent read deduplication, failed-write recovery, identity and aggregate label memory.",
);

assert.throws(() => third.update({ ...third.get(), frames: 2 }), /frame count/);
let notifications = 0;
let unsubscribe = () => {};
const listener = () => {
  notifications++;
  unsubscribe();
  unsubscribe = third.subscribe(listener);
  if (notifications > 2) throw new Error("Reentrant listener loop");
};
unsubscribe = third.subscribe(listener);
third.update({ ...third.get(), notes: "Listener can resubscribe" });
assert.equal(notifications, 1);
unsubscribe();
let unexpectedWrites = 0;
const unreadable = createAnnotationStore({
  read: async () => {
    throw new Error("read failed");
  },
  write: async () => {
    unexpectedWrites++;
  },
});
const isolated = await unreadable.open(initial, () => {});
isolated.update({ ...isolated.get(), notes: "Exportable work" });
await new Promise((r) => setTimeout(r, 0));
assert.equal(
  unexpectedWrites,
  0,
  "failed reads must not overwrite earlier saved work",
);
isolated.close();
assert.equal(
  (await unreadable.open(initial, () => {})).get().notes,
  "Exportable work",
);
