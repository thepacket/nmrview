import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseSpectrum,
  integrate,
  pickPeaks,
  validateSession,
  plotPoints,
} from "../lib/nmr/spectrum.ts";
const linear = parseSpectrum("ppm,intensity\n0,0\n1,2\n2,4\n3,6", "linear")[0];
assert.equal(integrate(linear, 0.5, 2.5), 6);
assert.equal(integrate(linear, 2.5, 0.5), 6);
assert.equal(integrate({ ...linear, shift: 10 }, 10.5, 12.5), 6);
const descending = parseSpectrum(
  "ppm,intensity\n3,6\n2,4\n1,2\n0,0",
  "descending",
)[0];
assert.deepEqual(descending.x, linear.x);
assert.deepEqual(descending.y, linear.y);
assert.throws(() => parseSpectrum("ppm,intensity\n0,1\n0,2", "bad"), /unique/);
assert.throws(
  () => parseSpectrum("ppm,intensity\n0,1\n1,NaN", "bad"),
  /non-numeric/,
);
assert.equal(integrate({ ...linear, baseline: [2, 0] }, 0, 3), 0);
const peak = parseSpectrum("0,0\n1,1\n2,10\n3,1\n4,0", "peak")[0];
assert.equal(pickPeaks(peak, 0.5)[0].x, 2);
assert.ok(plotPoints(peak, 0, 4, 1).includes(2));
for (const name of [
  "Menthol.jdx",
  "geraniol_Fig.5.jdx",
  "glucose_dmso_d5_Fig.S5.jdx",
]) {
  const s = parseSpectrum(fs.readFileSync("public/data/" + name, "utf8"), name);
  assert.equal(s.length, 1);
  assert.ok(s[0].x.length >= 32768);
  assert.equal(s[0].nucleus, "1H");
  assert.ok(s[0].frequency! > 500);
  assert.ok(s[0].x[0] < s[0].x.at(-1)!);
  const session = validateSession(
    JSON.parse(
      JSON.stringify({
        format: "nmrview-spectra-1",
        spectra: s,
        peaks: [],
        integrals: [],
      }),
    ),
  );
  assert.equal(session.spectra[0].x.length, s[0].x.length);
  console.log(
    name +
      ": " +
      s[0].x.length +
      " points, " +
      s[0].nucleus +
      ", session round-trip OK",
  );
}
assert.throws(
  () =>
    validateSession({
      format: "nmrview-spectra-1",
      spectra: [{ ...linear, shift: NaN }],
    }),
  /Invalid display/,
);
console.log(
  "PASS: integration, reversed input, reference shifts, baseline, peak detection, extrema preservation, validation, experimental JCAMP parsing and session round-trip.",
);
