import assert from "node:assert/strict";
import { groupStudies, parseParticipants } from "../lib/study-collection.ts";
const files = [
  "ds/sub-02/ses-1/anat/sub-02_ses-1_T2w.nii.gz",
  "ds/sub-01/anat/sub-01_T1w.nii.gz",
  "ds/sub-01/anat/sub-01_mask.nii.gz",
  "ds/sub-02/ses-2/anat/sub-02_ses-2_T1w.nii.gz",
  "ds/atlas.nii.gz",
].map((name) => ({ name, size: 10 }));
const studies = groupStudies(files);
assert.equal(studies.length, 3);
assert.equal(studies[0].participant, "sub-01");
assert.equal(studies[0].files.length, 2);
assert.ok(studies[0].initialFile.endsWith("_T1w.nii.gz"));
assert.equal(studies[1].session, "ses-1");
assert.equal(studies[2].session, "ses-2");
const rows = parseParticipants(
  "participant_id\tage\tgroup\r\nsub-01\t31\tcontrol\r\nsub-02\tn/a\tcase\r\n",
);
assert.deepEqual(rows[0], {
  participant_id: "sub-01",
  age: "31",
  group: "control",
});
assert.equal(rows[1].age, "n/a");
console.log(
  "PASS: participants and sessions remain separate, all scans retained, anatomical defaults selected, TSV metadata preserved.",
);
