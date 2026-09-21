import assert from "node:assert/strict";
import { completeAssistant } from "../lib/assistant/client.ts";
const original = globalThis.fetch;
const input = {
  model: "test/tools",
  messages: [{ role: "user", content: "Hello" }],
  context: "",
};
let status = 404,
  calls = 0,
  catalogCalls = 0;
try {
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/models")) {
      catalogCalls++;
      return Response.json({
        data: [
          {
            id: "test/tools",
            name: "Tools only",
            architecture: {
              input_modalities: ["text"],
              output_modalities: ["text"],
            },
            supported_parameters: ["tools"],
            pricing: { prompt: "0", completion: "0" },
          },
        ],
      });
    }
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.parallel_tool_calls, undefined);
    assert.ok(body.tools.length);
    if (status === 200)
      return Response.json({ choices: [{ message: { content: "Hello" } }] });
    return Response.json(
      {
        error: {
          message: "No endpoints found matching your data policy. test-secret",
          metadata: { raw: "private provider metadata" },
        },
      },
      { status },
    );
  };
  const signal = new AbortController().signal;
  await assert.rejects(
    completeAssistant(input, "test-secret", signal),
    (error: Error) =>
      error.message.includes("data policy") &&
      error.message.includes("[redacted]") &&
      !error.message.includes("test-secret") &&
      !error.message.includes("private provider"),
  );
  assert.equal(calls, 1, "no automatic paid retries");
  status = 200;
  assert.equal(
    (await completeAssistant(input, "test-secret", signal)).content,
    "Hello",
  );
  assert.equal(catalogCalls, 2, "404 invalidates stale catalog");
  status = 502;
  await assert.rejects(
    completeAssistant(input, "test-secret", signal),
    /data policy/,
  );
  console.log(
    "PASS: tool-only provider compatibility, actionable redacted routing errors, stale catalog invalidation and no automatic retries.",
  );
} finally {
  globalThis.fetch = original;
}
