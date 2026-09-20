import assert from "node:assert/strict";
import {
  createRepositoryTraffic,
  RepositoryRateLimitError,
} from "../lib/repository-traffic.ts";
const original = globalThis.fetch;
try {
  const starts: number[] = [];
  globalThis.fetch = async () => {
    starts.push(Date.now());
    return new Response("ok");
  };
  const paced = createRepositoryTraffic(25);
  await Promise.all([
    paced.fetch("https://zenodo.org/a"),
    paced.fetch("https://zenodo.org/b"),
    paced.fetch("https://zenodo.org/c"),
  ]);
  assert.equal(starts.length, 3);
  assert.ok(
    starts[1] - starts[0] >= 20 && starts[2] - starts[1] >= 20,
    "request starts are paced",
  );
  let now = 100000,
    calls = 0;
  const cooldown = createRepositoryTraffic(0, () => now);
  globalThis.fetch = async () => {
    calls++;
    return new Response("", { status: 429, headers: { "Retry-After": "120" } });
  };
  await assert.rejects(
    cooldown.fetch("https://zenodo.org/a"),
    RepositoryRateLimitError,
  );
  await assert.rejects(
    cooldown.fetch("https://zenodo.org/b"),
    RepositoryRateLimitError,
  );
  assert.equal(calls, 1, "cooldown must not send a second request");
  now += 120001;
  globalThis.fetch = async () => {
    calls++;
    return new Response("ok");
  };
  await cooldown.fetch("https://zenodo.org/c");
  assert.equal(calls, 2);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    cooldown.fetch("https://zenodo.org/d", { signal: abort.signal }),
    /abort/i,
  );
  assert.equal(calls, 2, "cancelled requests never reach the repository");
  const unavailable = createRepositoryTraffic(0, () => now);
  globalThis.fetch = async () =>
    new Response("", {
      status: 503,
      headers: { "Retry-After": new Date(now + 180000).toUTCString() },
    });
  await assert.rejects(
    unavailable.fetch("https://openneuro.org/a"),
    /180 seconds/,
  );
  await assert.rejects(
    unavailable.fetch("https://s3.amazonaws.com/openneuro.org/a"),
    RepositoryRateLimitError,
  );
  console.log(
    "PASS: pacing, cancellation, Retry-After seconds/date, 429/503 cooldown and shared OpenNeuro/S3 policy.",
  );
} finally {
  globalThis.fetch = original;
}
