import type { AssistantAction } from "./protocol";
export type ViewerBridge = {
  context: () => unknown;
  openRecord: (provider: string, id: string) => void;
  apply: (action: AssistantAction) => () => void;
};
let bridge: ViewerBridge | undefined;
export function registerAssistantViewer(value: ViewerBridge) {
  bridge = value;
  return () => {
    if (bridge === value) bridge = undefined;
  };
}
export function assistantContext() {
  return bridge?.context() || { status: "MRI viewer unavailable" };
}
export function applyViewerAction(action: AssistantAction) {
  if (!bridge) throw new Error("MRI viewer is unavailable.");
  return bridge.apply(action);
}

export function openAssistantRecord(provider: string, id: string) {
  if (!bridge) throw new Error("MRI viewer is unavailable.");
  if (
    !["zenodo", "openneuro"].includes(provider) ||
    !/^(?:[0-9]+|ds[0-9]+)$/.test(id)
  )
    throw new Error("Invalid repository record.");
  bridge.openRecord(provider, id);
}
