import assert from "node:assert/strict";
import { completeAssistant } from "../lib/assistant/client.ts";
const original = globalThis.fetch;
const responses = [
  {
    message: {
      content: [
        { type: "text", text: "T2 candidate: sub-01_T2w.nii.gz" },
        { type: "reasoning", text: "private" },
      ],
    },
    finish_reason: "stop",
  },
  {
    message: {
      content: null,
      tool_calls: [
        {
          function: {
            name: "propose_action",
            arguments: JSON.stringify({
              kind: "open_import",
              provider: null,
              query: null,
              plane: null,
              mode: null,
            }),
          },
        },
      ],
    },
    finish_reason: "tool_calls",
  },
  { message: { content: null }, finish_reason: "length" },
  {
    message: {
      content: null,
      tool_calls: [{ function: { name: "find_t2", arguments: "{}" } }],
    },
    finish_reason: "tool_calls",
  },
  {
    message: {
      content: null,
      tool_calls: [
        {
          function: {
            name: "propose_action",
            arguments: JSON.stringify({
              kind: "search",
              provider: "zenodo",
              query: null,
            }),
          },
        },
      ],
    },
    finish_reason: "tool_calls",
  },
];
let calls = 0;
try {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/models"))
      return Response.json({
        data: [
          {
            id: "test/reasoning",
            name: "Test",
            architecture: {
              input_modalities: ["text"],
              output_modalities: ["text"],
            },
            supported_parameters: ["tools"],
            pricing: { prompt: "0", completion: "0" },
          },
        ],
      });
    return Response.json({
      choices: [responses[calls++]],
      usage: { prompt_tokens: 100, completion_tokens: 1600, cost: 0.01 },
    });
  };
  const request = () =>
    completeAssistant(
      {
        model: "test/reasoning",
        context: "Shared T2 filenames",
        messages: [{ role: "user", content: "Find T2 scans" }],
      },
      "test-key",
      new AbortController().signal,
    );
  assert.equal((await request()).content, "T2 candidate: sub-01_T2w.nii.gz");
  assert.deepEqual((await request()).actions, [{ kind: "open_import" }]);
  const limited = await request();
  assert.match(limited.content, /response limit/);
  assert.equal(
    limited.usage.cost,
    0.01,
    "empty answers retain reported billing",
  );
  assert.match((await request()).content, /unsupported or incomplete action/);
  const invalid = await request();
  assert.equal(
    invalid.actions.length,
    0,
    "required null arguments must not execute",
  );
  assert.match(invalid.content, /unsupported or incomplete action/);
  assert.equal(calls, 5, "no silent paid retries");
  console.log(
    "PASS: text blocks, nullable optional fields, truncation, unknown/invalid tools, usage retention and no retries",
  );
} finally {
  globalThis.fetch = original;
}
