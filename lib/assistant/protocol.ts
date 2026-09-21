import { z } from "zod";
export const actionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("search"),
      provider: z.enum(["zenodo", "openneuro"]),
      query: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal("layout"),
      plane: z.enum(["axial", "coronal", "sagittal", "multiplanar", "volume"]),
    })
    .strict(),
  z
    .object({ kind: z.literal("sampling"), mode: z.enum(["native", "smooth"]) })
    .strict(),
  z.object({ kind: z.enum(["fit", "open_import", "case_notes"]) }).strict(),
]);
export type AssistantAction = z.infer<typeof actionSchema>;
export const requestSchema = z
  .object({
    model: z.string().min(1).max(200),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(12000),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    context: z.string().max(16000),
  })
  .strict();
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AssistantModel = {
  id: string;
  name: string;
  context: number;
  input: string;
  output: string;
};
export const assistantTools = [
  {
    type: "function",
    function: {
      name: "propose_action",
      description:
        "Offer an NMRView action for the operator to apply. Nothing executes until the operator clicks. Never claim an action has completed.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "search",
              "layout",
              "sampling",
              "fit",
              "open_import",
              "case_notes",
            ],
          },
          provider: { type: "string", enum: ["zenodo", "openneuro"] },
          query: { type: "string" },
          plane: {
            type: "string",
            enum: ["axial", "coronal", "sagittal", "multiplanar", "volume"],
          },
          mode: { type: "string", enum: ["native", "smooth"] },
        },
        required: ["kind"],
        additionalProperties: false,
      },
    },
  },
];
export function actionLabel(a: AssistantAction) {
  switch (a.kind) {
    case "search":
      return `Search ${a.provider}: ${a.query}`;
    case "layout":
      return `Main MRI view: ${a.plane}`;
    case "sampling":
      return `Main MRI sampling: ${a.mode}`;
    case "fit":
      return "Fit main MRI images";
    case "open_import":
      return "Open scan importer";
    case "case_notes":
      return "Open case notes";
  }
}
export function parseModels(data: unknown): AssistantModel[] {
  const row = z.object({
    id: z.string(),
    name: z.string(),
    context_length: z.number().optional(),
    supported_parameters: z.array(z.string()).optional(),
    architecture: z
      .object({
        input_modalities: z.array(z.string()),
        output_modalities: z.array(z.string()),
      })
      .optional(),
    pricing: z.object({ prompt: z.string(), completion: z.string() }),
  });
  const root = z.object({ data: z.array(z.unknown()) }).parse(data);
  return root.data
    .flatMap((value) => {
      const parsed = row.safeParse(value);
      if (!parsed.success) return [];
      const m = parsed.data;
      if (
        !m.supported_parameters?.includes("tools") ||
        !m.architecture?.input_modalities.includes("text") ||
        !m.architecture.output_modalities.includes("text")
      )
        return [];
      return [
        {
          id: m.id,
          name: m.name,
          context: m.context_length || 0,
          input: m.pricing.prompt,
          output: m.pricing.completion,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
