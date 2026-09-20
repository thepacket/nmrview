import assert from "node:assert/strict";
import { ScanCache } from "../lib/scan-cache.ts";
const signal = new AbortController().signal;
const file = (size: number) => new File([new Uint8Array(size)], "scan.nii");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
let calls = 0;
const loader = async () => {
  calls++;
  return file(4);
};
const cache = new ScanCache(8, 1);
await cache.get("a", loader, signal);
await cache.get("b", loader, signal);
await cache.get("a", loader, signal);
assert.equal(calls, 2, "cache hit avoids repeat work");
await cache.get("c", loader, signal);
await cache.get("b", loader, signal);
assert.equal(calls, 4, "least recently used scan evicted");
assert.equal(cache.getSnapshot().bytes, 8);
await cache.get("large", async () => file(9), signal);
assert.equal(cache.getSnapshot().bytes, 8, "oversized files not retained");
let finish!: (value: File) => void;
let underlying!: AbortSignal;
const sharedLoader = (s: AbortSignal) => {
  underlying = s;
  return new Promise<File>((r) => {
    finish = r;
  });
};
const a = new AbortController();
const b = new AbortController();
const first = cache.get("shared", sharedLoader, a.signal);
const second = cache.get("shared", sharedLoader, b.signal);
const queuedAbort = new AbortController();
let queuedStarted = false;
const queued = cache.get(
  "queued",
  async () => {
    queuedStarted = true;
    return file(1);
  },
  queuedAbort.signal,
);
assert.equal(cache.getSnapshot().active, 1);
assert.equal(cache.getSnapshot().queued, 1);
queuedAbort.abort();
await assert.rejects(queued);
assert.equal(queuedStarted, false);
a.abort();
await assert.rejects(first);
assert.equal(underlying.aborted, false, "one consumer does not cancel another");
finish(file(4));
await second;
const cancelled = new AbortController();
const last = cache.get("last", sharedLoader, cancelled.signal);
cancelled.abort();
await assert.rejects(last);
assert.equal(underlying.aborted, true, "last consumer cancels underlying load");
finish(file(4));
await tick();
assert.equal(cache.getSnapshot().active, 0);
const clearing = cache.get("clearing", sharedLoader, signal);
cache.clear();
finish(file(4));
await clearing;
assert.equal(
  cache.getSnapshot().files,
  0,
  "clear prevents in-flight work repopulating cache",
);
await assert.rejects(
  cache.get(
    "failed",
    async () => {
      throw new Error("offline");
    },
    signal,
  ),
  /offline/,
);
await cache.get("failed", loader, signal);
assert.equal(cache.getSnapshot().files, 1, "failed work can retry");
const expiring = new ScanCache(8, 1, -1);
let refreshes = 0;
const refresh = async () => {
  refreshes++;
  return file(1);
};
await expiring.get("x", refresh, signal);
await expiring.get("x", refresh, signal);
assert.equal(refreshes, 2, "expired scans reloaded");
const aborted = new AbortController();
aborted.abort();
await assert.rejects(cache.get("unused", loader, aborted.signal));
const serial = new ScanCache(8, 1);
let release!: (value: File) => void;
let startedSecond = false;
const running = serial.get('one', () => new Promise<File>((resolve) => { release = resolve; }), signal);
const waiting = serial.get('two', async () => { startedSecond = true; return file(2); }, signal);
assert.equal(startedSecond, false, 'second loader waits for capacity');
release(file(2));
await Promise.all([running, waiting]);
assert.equal(startedSecond, true, 'queue drains when a slot is freed');
assert.equal(serial.getSnapshot().active, 0);
serial.forget('one');
assert.equal(serial.getSnapshot().files, 1, 'retry can discard one scan without clearing others');
console.log(
  "PASS: LRU budget, oversized files, shared loads, queue limits, independent cancellation, clearing, retry and expiry.",
);
