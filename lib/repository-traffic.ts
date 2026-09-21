/** Per-page provider pacing. No automatic retries, including after throttling. */
export class RepositoryRateLimitError extends Error {}
export function createRepositoryTraffic(interval = 1000, now = Date.now) {
  const states = new Map<
    string,
    { tail: Promise<void>; next: number; blocked: number }
  >();
  const provider = (url: string | URL) => {
    const u = new URL(url);
    if (
      u.hostname === "api.imaging.datacommons.cancer.gov" ||
      (u.hostname === "s3.amazonaws.com" &&
        u.pathname.startsWith("/idc-open-data"))
    )
      return "IDC";
    return u.hostname === "zenodo.org" ? "Zenodo" : "OpenNeuro";
  };
  async function fetchRepository(url: string | URL, init: RequestInit = {}) {
    const name = provider(url);
    let state = states.get(name);
    if (!state) {
      state = { tail: Promise.resolve(), next: 0, blocked: 0 };
      states.set(name, state);
    }
    const previous = state.tail;
    let release!: () => void;
    state.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const signal = init.signal;
        const abort = () =>
          reject(signal?.reason || new DOMException("Cancelled", "AbortError"));
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        previous.then(() => {
          signal?.removeEventListener("abort", abort);
          resolve();
        });
      });
      init.signal?.throwIfAborted();
      const check = () => {
        if (state!.blocked > now())
          throw new RepositoryRateLimitError(
            `${name} has asked us to pause requests. Try again in ${Math.ceil((state!.blocked - now()) / 1000)} seconds.`,
          );
      };
      check();
      const delay = state.next - now();
      if (delay > 0)
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(
              init.signal?.reason ||
                new DOMException("Cancelled", "AbortError"),
            );
          };
          const timer = setTimeout(() => {
            init.signal?.removeEventListener("abort", abort);
            resolve();
          }, delay);
          init.signal?.addEventListener("abort", abort, { once: true });
        });
      init.signal?.throwIfAborted();
      check();
      state.next = now() + interval;
      const response = await fetch(url, init);
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers.get("retry-after");
        const seconds =
          retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) : NaN;
        const until = Number.isFinite(seconds)
          ? now() + seconds * 1000
          : retry
            ? Date.parse(retry)
            : NaN;
        state.blocked = Math.max(
          now() + 60000,
          Number.isFinite(until) ? until : 0,
        );
        await response.body?.cancel();
        check();
      }
      return response;
    } finally {
      // A cancelled waiter returns promptly without letting later requests jump the queue.
      void previous.then(release);
    }
  }
  return { fetch: fetchRepository };
}
export const repositoryTraffic = createRepositoryTraffic();
