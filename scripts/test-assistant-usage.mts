import assert from "node:assert/strict";
import { parseUsage, sumUsage, usageText } from "../lib/assistant/usage.ts";
const known = parseUsage({
  prompt_tokens: 100,
  completion_tokens: 20,
  cost: 0.00004,
});
assert.deepEqual(known, { input: 100, output: 20, cost: 0.00004 });
assert.deepEqual(sumUsage([known, known]), {
  input: 200,
  output: 40,
  cost: 0.00008,
});
assert.deepEqual(
  parseUsage({ prompt_tokens: -1, completion_tokens: Infinity, cost: "0" }),
  { input: null, output: null, cost: null },
);
assert.equal(sumUsage([known, parseUsage(undefined)]).cost, null);
assert.match(
  usageText(parseUsage({ prompt_tokens: 0, completion_tokens: 0, cost: 0 })),
  /\$0.00/,
);
assert.match(usageText(parseUsage({ cost: 0.0000001 })), /<\$0.000001/);
assert.match(usageText(parseUsage({})), /unavailable/);
console.log(
  "PASS: reported tokens/cost, chat totals, unavailable vs zero and sub-microdollar charges.",
);
