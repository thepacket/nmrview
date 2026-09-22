// The OpenRouter key is saved in this browser's localStorage so it survives
// reloads, resets and new tabs on the same origin. Forget key removes it.
// Anything that can run script on this origin can read it; that is the
// trade-off of persistence in a client-only application.
export const ASSISTANT_KEY_STORAGE = "nmrview-assistant-key";
type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function storage(): KeyStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
export function readStoredKey(store = storage()): string {
  try {
    const value = store?.getItem(ASSISTANT_KEY_STORAGE) ?? "";
    return typeof value === "string" && value.length <= 512 ? value : "";
  } catch {
    return "";
  }
}
/** Returns false when the browser refused to persist the key. */
export function storeKey(value: string, store = storage()): boolean {
  try {
    if (!store) return false;
    if (value.trim()) store.setItem(ASSISTANT_KEY_STORAGE, value);
    else store.removeItem(ASSISTANT_KEY_STORAGE);
    return true;
  } catch {
    return false;
  }
}
