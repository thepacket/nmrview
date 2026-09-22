/** Kept in the URL so reloads and workspace switches remain empty after reset. */
export function isEmptySession(): boolean {
  return typeof window !== "undefined" &&
    new URL(window.location.href).searchParams.get("session") === "empty";
}

export function emptySessionURL(href: string): string {
  const url = new URL(href);
  url.searchParams.set("session", "empty");
  return url.href;
}

/** A document reload discards scan buffers, workers, WebGL contexts and module caches. */
export function resetSession(): void {
  const target = emptySessionURL(window.location.href);
  if (target === window.location.href) window.location.reload();
  else window.location.replace(target);
}
