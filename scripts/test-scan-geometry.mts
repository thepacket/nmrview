import assert from "node:assert/strict";
import { scanGeometry, compareGeometry } from "../lib/scan-geometry.ts";
const points = [
  [10, 20, 30],
  [11, 20, 30],
  [10, 22, 30],
  [10, 20, 33],
];
const reference = scanGeometry([100, 80, 60], points, 2);
assert.deepEqual(reference.spacing, [1, 2, 3]);
assert.deepEqual(reference.coverage, [100, 160, 180]);
assert.deepEqual(reference.origin, [10, 20, 30]);
assert.deepEqual(compareGeometry(reference, reference), []);
const meters = scanGeometry(
  [100, 80, 60],
  points.map((p) => p.map((v) => v / 1000)),
  1,
);
assert.deepEqual(compareGeometry(reference, meters), [], "unit normalization");
const microns = scanGeometry(
  [100, 80, 60],
  points.map((p) => p.map((v) => v * 1000)),
  3,
);
assert.deepEqual(compareGeometry(reference, microns), []);
const shifted = scanGeometry(
  [100, 80, 60],
  points.map((p) => p.map((v) => v + 10)),
  2,
);
assert.deepEqual(compareGeometry(reference, shifted), [
  "Different grid origin",
]);
const rotated = scanGeometry(
  [100, 80, 60],
  [
    [10, 20, 30],
    [10, 21, 30],
    [8, 20, 30],
    [10, 20, 33],
  ],
  2,
);
assert.deepEqual(compareGeometry(reference, rotated), [
  "Different grid orientation",
]);
const resized = scanGeometry([50, 80, 60], points, 2);
assert.deepEqual(compareGeometry(reference, resized), [
  "Different voxel counts",
  "Different field of view",
]);
assert.ok(scanGeometry([0, 1, 1], points, 2).issues.length);
assert.ok(scanGeometry([1, 1, 1], [], 2).issues.length);
assert.ok(
  scanGeometry(
    [1, 1, 1],
    [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [0, 0, 1],
    ],
    2,
  ).issues.includes("Degenerate spatial transform."),
);
assert.ok(scanGeometry([1, 1, 1], points, 0).issues.length);
assert.deepEqual(
  compareGeometry(reference, scanGeometry([1, 1, 1], points, 0)),
  ["Geometry cannot be reliably compared."],
);
const jitter = scanGeometry(
  [100, 80, 60],
  points.map((p) => p.map((v) => v + 0.0001)),
  2,
);
assert.deepEqual(compareGeometry(reference, jitter), []);
console.log(
  "PASS: geometry spacing, voxel extents, units, translation, orientation, dimensions, invalid transforms and tolerance.",
);
