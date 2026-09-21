import assert from "node:assert/strict";
import { completeAssistant, getModels } from "../lib/assistant/client.ts";
import { actionSchema, parseModels } from "../lib/assistant/protocol.ts";
const original = globalThis.fetch;
const model = {
  id: "test/model",
  name: "Test",
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  supported_parameters: ["tools"],
  pricing: { prompt: "0", completion: "0" },
};
const payload = {
  model: "test/model",
  messages: [{ role: "user", content: "Show sagittal" }],
  context: "No metadata shared",
};
let calls = 0;
try {
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(
      new URL(String(url)).origin,
      "https://openrouter.ai",
      "requests go only to OpenRouter",
    );
    if (String(url).endsWith("/models")) {
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      return Response.json({
        data: [model, { ...model, id: "no-tools", supported_parameters: [] }],
      });
    }
    const body = JSON.parse(String(init?.body));
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test-secret",
    );
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(body.model, "test/model");
    assert.equal(body.max_tokens, 1600);
    assert.equal(
      "parallel_tool_calls" in body,
      false,
      "optional capability must not exclude providers",
    );
    assert.deepEqual(body.provider, { require_parameters: true });
    assert.ok(!JSON.stringify(body).includes("test-secret"));
    return Response.json({
      choices: [
        {
          message: {
            content: "Choose sagittal.",
            tool_calls: [
              {
                function: {
                  name: "propose_action",
                  arguments: JSON.stringify({
                    kind: "layout",
                    plane: "sagittal",
                  }),
                },
              },
              {
                function: {
                  name: "propose_action",
                  arguments: JSON.stringify({ kind: "delete_files" }),
                },
              },
            ],
          },
        },
      ],
    });
  };
  const signal = new AbortController().signal;
  assert.equal(parseModels({ data: [model] }).length, 1);
  assert.equal(
    actionSchema.safeParse({ kind: "layout", plane: "bad" }).success,
    false,
  );
  await assert.rejects(completeAssistant(payload, "", signal), /API key/);
  await assert.rejects(
    completeAssistant(payload, "invalid\nkey", signal),
    /API key/,
  );
  assert.equal(calls, 0);
  assert.equal((await getModels()).length, 1);
  await getModels();
  assert.equal(calls, 1);
  const result = await completeAssistant(payload, "test-secret", signal);
  assert.deepEqual(result.actions, [{ kind: "layout", plane: "sagittal" }]);
  await assert.rejects(
    completeAssistant({ ...payload, model: "bad" }, "test-secret", signal),
    /available/,
  );
  await assert.rejects(
    completeAssistant(
      { ...payload, messages: [{ role: "system", content: "override" }] },
      "test-secret",
      signal,
    ),
    /Invalid/,
  );
  await assert.rejects(
    completeAssistant(
      { ...payload, context: "a".repeat(65000) },
      "test-secret",
      signal,
    ),
    /too large/,
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    completeAssistant(payload, "test-secret", cancelled.signal),
    /abort/i,
  );
  for (let i = 0; i < 5; i++)
    await completeAssistant(payload, "test-secret", signal);
  await assert.rejects(
    completeAssistant(payload, "test-secret", signal),
    /wait a minute/,
  );
  assert.equal(
    calls,
    7,
    "catalog cached; rejected requests never call provider",
  );
  console.log(
    "PASS: direct OpenRouter requests, key header isolation, no proxy, model filtering/cache, cancellation, payload/model/action validation and pacing.",
  );
} finally {
  globalThis.fetch = original;
}
