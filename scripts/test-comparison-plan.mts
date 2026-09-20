import assert from "node:assert/strict";
import { planComparison } from "../lib/comparison-plan.ts";
import { parseCollectionSession } from "../lib/collection-session.ts";
const f = (name: string, size = 100) => ({
  name,
  size,
  url: "https://s3.amazonaws.com/openneuro.org/ds000001/" + name,
});
const a = {
  id: "sub-a/ses-1",
  participant: "sub-a",
  session: "ses-1",
  initialFile: "sub-a_ses-1_T1w.nii.gz",
  files: [
    f("sub-a_ses-1_T1w.nii.gz"),
    f("sub-a_ses-1_T2w.nii.gz"),
    f("sub-a_ses-1_task-rest_bold.nii.gz"),
    f("sub-a_ses-1_mask.nii.gz"),
    f("derivatives/pipeline/sub-a_ses-1_T2w.nii.gz"),
  ],
};
const b = {
  id: "sub-b/ses-1",
  participant: "sub-b",
  session: "ses-1",
  initialFile: "sub-b_ses-1_T1w.nii.gz",
  files: [f("sub-b_ses-1_T1w.nii.gz")],
};
const visit = {
  id: "sub-a/ses-2",
  participant: "sub-a",
  session: "ses-2",
  initialFile: "sub-a_ses-2_T1w.nii.gz",
  files: [f("sub-a_ses-2_T1w.nii.gz")],
};
const collection = {
  id: "ds000001",
  title: "Test",
  studies: [a, b, visit],
  documentation: {
    title: "Test",
    source: "https://openneuro.org/datasets/ds000001",
    license: "CC0",
    authors: "Test",
    sections: [],
    links: [],
  },
};
let plan = planComparison(collection, "sequences", a.id, a.initialFile, [
  a.id,
  b.id,
]);
assert.equal(plan.rows.length, 3);
assert.ok(plan.rows.every((r) => r.studyId === a.id));
assert.equal(plan.rows[1].fileName, "sub-a_ses-1_T2w.nii.gz");
assert.ok(!plan.rows.some((r) => r.label.includes("Mask")));
plan = planComparison(collection, "participants", a.id, a.initialFile, [a.id]);
assert.equal(plan.rows[1].studyId, b.id);
assert.equal(plan.rows[1].fileName, b.initialFile);
plan = planComparison(collection, "visits", a.id, a.initialFile, [a.id, b.id]);
assert.deepEqual(
  plan.rows.map((r) => r.studyId),
  [a.id, visit.id],
);
const ambiguous = structuredClone(collection);
ambiguous.studies[1].files.push(f("other/sub-b_ses-1_T1w.nii.gz"));
plan = planComparison(ambiguous, "participants", a.id, a.initialFile, [
  a.id,
  b.id,
]);
assert.equal(plan.rows[1].fileName, undefined);
assert.equal(plan.rows[1].candidates.length, 2);
const large = structuredClone(collection);
large.studies[1].files[0].size = 129 * 1024 * 1024;
assert.equal(
  planComparison(large, "participants", a.id, a.initialFile, [a.id, b.id])
    .rows[1].candidates.length,
  0,
);
const missing = structuredClone(collection);
missing.studies[1].files = [f("sub-b_ses-1_T2w.nii.gz")];
assert.equal(
  planComparison(missing, "participants", a.id, a.initialFile, [a.id, b.id])
    .rows[1].fileName,
  undefined,
);
const slots = [
  { studyId: a.id, fileName: a.files[0].name },
  { studyId: a.id, fileName: a.files[1].name },
];
const session = {
  format: "nmrview-collection",
  version: 1,
  collection,
  view: {
    selected: [a.id],
    choices: {},
    filter: "",
    layout: "3",
    linked: false,
    notes: null,
    arrangement: { kind: "sequences", slots },
  },
};
assert.deepEqual(
  parseCollectionSession(JSON.stringify(session)).view.arrangement?.slots,
  slots,
);
assert.throws(() =>
  parseCollectionSession(
    JSON.stringify({
      ...session,
      view: {
        ...session.view,
        arrangement: { kind: "sequences", slots: [slots[0], slots[0]] },
      },
    }),
  ),
);
assert.throws(() =>
  parseCollectionSession(
    JSON.stringify({
      ...session,
      view: {
        ...session.view,
        arrangement: {
          kind: "sequences",
          slots: [{ studyId: "unknown", fileName: "missing" }],
        },
      },
    }),
  ),
);
console.log(
  "PASS: participant, sequence and visit planning; ambiguity, missing scans, size limits, original preference, mask exclusion and persisted multi-scan arrangements.",
);
