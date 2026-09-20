/** Tracks decoded voxel arrays, not total browser/GPU memory. Serial parsing limits overlapping allocations. */
export class ComparisonMemory {
  readonly limit: number;
  private bytes = 0;
  private volumes = 0;
  private parsing = false;
  private queue: {
    signal: AbortSignal;
    start: () => void;
    cancel: () => void;
  }[] = [];
  private listeners = new Set<() => void>();
  private snapshot = { bytes: 0, volumes: 0, parsing: false, queued: 0 };
  constructor(limit = 384 * 1024 * 1024) {
    this.limit = limit;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    this.snapshot = {
      bytes: this.bytes,
      volumes: this.volumes,
      parsing: this.parsing,
      queued: this.queue.length,
    };
    for (const listener of [...this.listeners]) listener();
  }
  reserve(bytes: number): () => void {
    if (!Number.isSafeInteger(bytes) || bytes <= 0)
      throw new Error("Invalid decoded scan size.");
    if (this.bytes + bytes > this.limit)
      throw new Error(
        "Comparison scan memory is full. Close another scan, then retry this scan.",
      );
    this.bytes += bytes;
    this.volumes++;
    this.emit();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.bytes -= bytes;
      this.volumes--;
      this.emit();
    };
  }
  async parse<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const item = {
        signal,
        start: () => {
          signal.removeEventListener("abort", item.cancel);
          this.parsing = true;
          resolve();
        },
        cancel: () => {
          this.queue = this.queue.filter((q) => q !== item);
          reject(signal.reason);
          this.emit();
        },
      };
      if (!this.parsing) item.start();
      else {
        this.queue.push(item);
        signal.addEventListener("abort", item.cancel, { once: true });
      }
      this.emit();
    });
    try {
      signal.throwIfAborted();
      return await operation();
    } finally {
      this.parsing = false;
      this.queue.shift()?.start();
      this.emit();
    }
  }
}
export const comparisonMemory = new ComparisonMemory();
