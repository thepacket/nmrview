import assert from "node:assert/strict";
import { ComparisonMemory } from "../lib/comparison-memory.ts";
const pool = new ComparisonMemory(10);
const release = pool.reserve(6);
assert.throws(() => pool.reserve(5), /memory is full/);
assert.equal(pool.getSnapshot().bytes, 6);
release();
release();
assert.equal(pool.getSnapshot().bytes, 0);
assert.equal(pool.getSnapshot().volumes, 0);
assert.throws(() => pool.reserve(NaN), /Invalid/);
const signal = new AbortController().signal;
let finish!: () => void;
let started = false;
const first = pool.parse(
  signal,
  () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
);
await Promise.resolve();
const abort = new AbortController();
const cancelled = pool.parse(abort.signal, async () => {
  throw new Error("must not run");
});
const next = pool.parse(signal, async () => {
  started = true;
  return 7;
});
assert.equal(pool.getSnapshot().queued, 2);
assert.equal(started, false);
abort.abort();
await assert.rejects(cancelled);
finish();
await first;
assert.equal(await next, 7);
assert.equal(pool.getSnapshot().parsing, false);
assert.equal(pool.getSnapshot().queued, 0);
await assert.rejects(
  pool.parse(signal, async () => {
    throw new Error("corrupt");
  }),
  /corrupt/,
);
assert.equal(await pool.parse(signal, async () => 9), 9);
const full = pool.reserve(10);
await assert.rejects(
  pool.parse(signal, async () => pool.reserve(1)),
  /memory is full/,
);
full();
const retry = await pool.parse(signal, async () => pool.reserve(1));
retry();
assert.equal(pool.getSnapshot().bytes, 0);
console.log(
  "PASS: aggregate decoded budget, idempotent release, serialized parsing, queue cancellation, failure recovery and retry after release.",
);
