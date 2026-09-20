import assert from "node:assert/strict";
import { matchingScan, scanDescriptor } from "../lib/scan-selection.ts";
const f = (name: string) => ({ name, size: 1024 });
const ref = f("ds/sub-01/ses-1/anat/sub-01_ses-1_acq-high_run-1_T1w.nii.gz");
const match = f("ds/sub-02/ses-2/anat/sub-02_ses-2_acq-high_run-1_T1w.nii.gz");
const wrongRun = f("ds/sub-02/anat/sub-02_acq-high_run-2_T1w.nii.gz");
const derived = f(
  "ds/derivatives/fmriprep/sub-02/anat/sub-02_acq-high_run-1_T1w.nii.gz",
);
assert.equal(matchingScan(ref, [wrongRun, derived, match]).file, match);
assert.equal(matchingScan(ref, [wrongRun, derived]).file, undefined);
assert.equal(matchingScan(ref, [match, { ...match }]).file, undefined);
assert.equal(
  matchingScan(f("unknown.nii"), [f("unknown.nii")]).file,
  undefined,
);
assert.equal(scanDescriptor(derived).processing, "Processed · fmriprep");
assert.match(scanDescriptor(ref).details, /Acquisition high/);
assert.equal(
  matchingScan(ref, [f("sub-02_acq-low_run-1_T1w.nii.gz")]).file,
  undefined,
);
console.log(
  "PASS: cross-participant/session matching, acquisition/run separation, original/derivative separation, ambiguous and unknown scans.",
);
