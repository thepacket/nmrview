import assert from "node:assert/strict";
import {
  validateAnnotations,
  exportAnnotations,
  importAnnotations,
  assertAnnotationTarget,
  type AnnotationRecord,
} from "../lib/annotations.ts";
const record: AnnotationRecord = {
  format: "nmrview-annotations",
  version: 1,
  source: "dataset/participant/scan",
  grid: "grid",
  name: "scan.nii",
  dimensions: [2, 2, 2],
  frames: 2,
  updatedAt: new Date().toISOString(),
  notes: "Case review",
  labels: [{ value: 1, name: "Region" }],
  measurements: [
    {
      id: "one",
      name: "Width",
      frame: 1,
      value: {
        startMM: [0, 0, 0],
        endMM: [1, 0, 0],
        distance: 1,
        sliceType: 0,
        sliceIndex: 0,
        slicePosition: 0.5,
      },
    },
  ],
  bitmap: new Uint8Array([0, 0, 1, 1, 0, 0, 0, 0]),
};
const result = await importAnnotations(exportAnnotations(record));
assert.deepEqual(result, record);
assertAnnotationTarget(result, record.source, record.grid);
assert.throws(
  () => assertAnnotationTarget(result, "other participant", record.grid),
  /different scan/,
);
assert.throws(
  () => assertAnnotationTarget(result, record.source, "changed grid"),
  /different scan/,
);
assert.throws(
  () => validateAnnotations(record, new Uint8Array(7)),
  /dimensions/,
);
assert.throws(
  () =>
    validateAnnotations(
      { ...record, measurements: [{ ...record.measurements[0], frame: 2 }] },
      null,
    ),
  /frame/,
);
assert.throws(
  () =>
    validateAnnotations(
      {
        ...record,
        measurements: [record.measurements[0], record.measurements[0]],
      },
      null,
    ),
  /identity/,
);
assert.throws(
  () =>
    validateAnnotations(
      { ...record, labels: [record.labels[0], record.labels[0]] },
      null,
    ),
  /Duplicate/,
);
await assert.rejects(importAnnotations(new Blob(["invalid"])), /size/);
const binary = new Uint8Array(await exportAnnotations(record).arrayBuffer());
binary[0] = 0;
await assert.rejects(importAnnotations(new Blob([binary])), /Not an/);
assert.deepEqual(
  (await importAnnotations(exportAnnotations({ ...record, bitmap: null })))
    .bitmap,
  null,
);
console.log(
  "PASS: measurement and label package round-trip, frame validation, scan/grid isolation, bitmap length, duplicate IDs and malformed files.",
);
