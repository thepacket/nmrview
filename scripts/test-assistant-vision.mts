import assert from "node:assert/strict";
import { completeAssistant } from "../lib/assistant/client.ts";
import {
  localizationSchema,
  parseModels,
  requestSchema,
} from "../lib/assistant/protocol.ts";
import {
  registerScanSource,
  availableScanSources,
  captureScanSource,
} from "../lib/assistant/scan.ts";
const original = globalThis.fetch;
const snapshot = {
  image: "data:image/jpeg;base64,/9j/AA==",
  label: "Main MRI view",
  capturedAt: new Date().toISOString(),
  metadata: '{"frame":2}',
};
const base = {
  model: "test/vision",
  messages: [{ role: "user", content: "Explain this view" }],
  context: "",
};
let calls = 0;
try {
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/models"))
      return Response.json({
        data: [true, false].map((vision) => ({
          id: vision ? "test/vision" : "test/text",
          name: vision ? "Vision" : "Text",
          architecture: {
            input_modalities: vision ? ["text", "image"] : ["text"],
            output_modalities: ["text"],
          },
          supported_parameters: ["tools"],
          pricing: { prompt: "0", completion: "0" },
        })),
      });
    calls++;
    const body = JSON.parse(String(init?.body));
    if (calls === 1) {
      const message = body.messages.at(-1);
      assert.equal(message.role, "user");
      assert.equal(message.content[1].type, "image_url");
      assert.equal(message.content[1].image_url.url, snapshot.image);
      assert.match(message.content[0].text, /frame/);
    } else
      assert.equal(
        typeof body.messages.at(-1).content,
        "string",
        "text follow-up has no old image",
      );
    return Response.json({
      usage: { prompt_tokens: 450, completion_tokens: 85, cost: 0.003 },
      choices: [
        {
          message: {
            content: "This is a viewport snapshot.",
            tool_calls: [
              {
                function: {
                  name: "locate_structures",
                  arguments: JSON.stringify({
                    dots: [{ label: "Example structure", x: 0.4, y: 0.6 }],
                  }),
                },
              },
            ],
          },
        },
      ],
    });
  };
  const signal = new AbortController().signal;
  await assert.rejects(
    completeAssistant(
      { ...base, model: "test/text", snapshot },
      "test-key",
      signal,
    ),
    /image-capable/,
  );
  assert.equal(calls, 0);
  const annotated = await completeAssistant(
    { ...base, snapshot },
    "test-key",
    signal,
  );
  assert.deepEqual(annotated.dots, [
    { label: "Example structure", x: 0.4, y: 0.6 },
  ]);
  assert.deepEqual(annotated.usage, { input: 450, output: 85, cost: 0.003 });
  const textOnly = await completeAssistant(base, "test-key", signal);
  assert.deepEqual(
    textOnly.dots,
    [],
    "no localization accepted without a snapshot",
  );
  assert.equal(
    localizationSchema.safeParse({ dots: [{ label: "Bad", x: 1.1, y: 0.5 }] })
      .success,
    false,
  );
  assert.equal(
    localizationSchema.safeParse({ dots: [{ label: "Bad", x: 0.5, y: NaN }] })
      .success,
    false,
  );
  assert.equal(
    localizationSchema.safeParse({
      dots: Array(13).fill({ label: "Overflow", x: 0, y: 0 }),
    }).success,
    false,
  );
  assert.equal(
    requestSchema.safeParse({
      ...base,
      snapshot: { ...snapshot, image: "https://example.com/patient.jpg" },
    }).success,
    false,
  );
  assert.equal(
    requestSchema.safeParse({
      ...base,
      snapshot: {
        ...snapshot,
        image: "data:image/jpeg;base64," + "A".repeat(3000000),
      },
    }).success,
    false,
  );
  let visible = true;
  const cleanup = registerScanSource("test", {
    label: "Test pane",
    available: () => visible,
    capture: () => snapshot,
  });
  assert.equal(availableScanSources().length, 1);
  assert.equal(captureScanSource("test"), snapshot);
  visible = false;
  assert.equal(availableScanSources().length, 0);
  assert.throws(() => captureScanSource("test"), /no longer available/);
  cleanup();
  console.log(
    "PASS: image model guard, multimodal request, frozen capture metadata, no automatic image resend, image limits and hidden-pane rejection.",
  );
} finally {
  globalThis.fetch = original;
}
