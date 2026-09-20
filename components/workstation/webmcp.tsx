"use client";
import { useEffect, useRef } from "react";
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function useWorkspaceTools(mode: string, setMode: (m: string) => void) {
  const current = useRef(mode);
  current.current = mode;
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const tools: Tool[] = [
      {
        name: "read_workspace",
        title: "Read active workspace",
        description:
          "Return the active MRI or NMR workspace. Does not read scan contents.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({ workspace: current.current }),
      },
      {
        name: "set_workspace",
        title: "Switch imaging workspace",
        description:
          "Switch between the MRI volume viewer and the NMR spectroscopy viewer without discarding loaded data.",
        inputSchema: {
          type: "object",
          properties: { workspace: { type: "string", enum: ["mri", "nmr"] } },
          required: ["workspace"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input) => {
          const value = (input as { workspace?: unknown })?.workspace;
          if (value !== "mri" && value !== "nmr")
            throw new Error("workspace must be mri or nmr");
          setMode(value);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { workspace: value };
        },
      },
    ];
    for (const tool of tools)
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {});
      } catch {}
    return () => controller.abort();
  }, [setMode]);
}
