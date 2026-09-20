import assert from "node:assert/strict";
import {
  applicableMetadata,
  metadataDirectories,
  mergeMetadata,
} from "../lib/acquisition-metadata.ts";
const scan =
  "ds000001/sub-01/ses-02/func/sub-01_ses-02_task-rest_run-1_bold.nii.gz";
assert.deepEqual(metadataDirectories(scan), [
  "ds000001/",
  "ds000001/sub-01/",
  "ds000001/sub-01/ses-02/",
  "ds000001/sub-01/ses-02/func/",
]);
assert.ok(applicableMetadata(scan, "ds000001/task-rest_bold.json"));
assert.ok(
  applicableMetadata(scan, "ds000001/sub-01/sub-01_task-rest_bold.json"),
);
assert.ok(!applicableMetadata(scan, "ds000001/task-other_bold.json"));
assert.ok(!applicableMetadata(scan, "ds000001/acq-high_task-rest_bold.json"));
assert.ok(!applicableMetadata(scan, "ds000001/sub-02/task-rest_bold.json"));
assert.ok(!applicableMetadata(scan, "ds000001/task-rest_T1w.json"));
const derivative =
  "ds000001/derivatives/pipeline/sub-01/anat/sub-01_T1w.nii.gz";
assert.equal(
  metadataDirectories(derivative)[0],
  "ds000001/derivatives/pipeline/",
);
assert.ok(!applicableMetadata(derivative, "ds000001/T1w.json"));
const merged = mergeMetadata([
  {
    name: "dataset",
    url: "a",
    values: { RepetitionTime: 2, Manufacturer: "Example" },
  },
  { name: "scan", url: "b", values: { RepetitionTime: 1.5 } },
]);
assert.equal(merged.values.RepetitionTime, 1.5);
assert.equal(merged.values.Manufacturer, "Example");
assert.equal(merged.provenance.RepetitionTime, "scan");
console.log(
  "PASS: hierarchy, entity applicability, derivative isolation, overrides and per-field provenance.",
);
