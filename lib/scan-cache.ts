/** Session-only, bounded LRU cache. Files are immutable; renderers receive independent images. */
type Progress = (message: string) => void;
type Loader = (signal: AbortSignal, progress: Progress) => Promise<File>;
type Consumer = {
  resolve: (file: File) => void;
  reject: (error: unknown) => void;
  progress: Progress;
};
type Job = {
  key: string;
  loader: Loader;
  controller: AbortController;
  consumers: Set<Consumer>;
  message: string;
  generation: number;
};
export class ScanCache {
  private entries = new Map<string, { file: File; expires: number }>();
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private active = 0;
  private bytes = 0;
  private generation = 0;
  private hits = 0;
  private listeners = new Set<() => void>();
  private snapshot = { bytes: 0, files: 0, active: 0, queued: 0, hits: 0 };
  readonly budget: number;
  private concurrency: number;
  private lifetime: number;
  constructor(
    budget = 192 * 1024 * 1024,
    concurrency = 2,
    lifetime = 15 * 60 * 1000,
  ) {
    this.budget = budget;
    this.concurrency = concurrency;
    this.lifetime = lifetime;
    if (budget < 0 || concurrency < 1)
      throw new Error("Invalid scan cache limits");
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private emit() {
    this.snapshot = {
      bytes: this.bytes,
      files: this.entries.size,
      active: this.active,
      queued: this.queue.length,
      hits: this.hits,
    };
    for (const listener of [...this.listeners]) listener();
  }
  clear() {
    this.generation++;
    this.entries.clear();
    this.bytes = 0;
    this.emit();
  }
  forget(key: string) {
    this.remove(key);
    this.emit();
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      this.bytes -= entry.file.size;
      this.entries.delete(key);
    }
  }
  get(
    key: string,
    loader: Loader,
    signal: AbortSignal,
    progress: Progress = () => {},
  ): Promise<File> {
    if (signal.aborted) return Promise.reject(signal.reason);
    for (const [id, entry] of this.entries)
      if (entry.expires <= Date.now()) this.remove(id);
    const cached = this.entries.get(key);
    if (cached) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, cached);
      this.emit();
      progress("Using scan from memory…");
      return Promise.resolve(cached.file);
    }
    let job = this.jobs.get(key);
    if (!job) {
      job = {
        key,
        loader,
        controller: new AbortController(),
        consumers: new Set(),
        message: "Queued for loading…",
        generation: this.generation,
      };
      this.jobs.set(key, job);
      this.queue.push(job);
    }
    const current = job;
    const promise = new Promise<File>((resolve, reject) => {
      const cleanup = () => signal.removeEventListener("abort", abort);
      const consumer: Consumer = {
        resolve: (file) => {
          cleanup();
          resolve(file);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
        progress,
      };
      const abort = () => {
        current.consumers.delete(consumer);
        consumer.reject(signal.reason);
        if (!current.consumers.size) {
          current.controller.abort();
          if (this.jobs.get(key) === current) this.jobs.delete(key);
          this.queue = this.queue.filter((item) => item !== current);
          this.emit();
        }
      };
      current.consumers.add(consumer);
      signal.addEventListener("abort", abort, { once: true });
      progress(current.message);
    });
    this.drain();
    return promise;
  }
  private drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      void this.run(job);
    }
    this.emit();
  }
  private async run(job: Job) {
    const progress = (message: string) => {
      job.message = message;
      for (const consumer of job.consumers) consumer.progress(message);
    };
    try {
      progress("Loading scan…");
      const file = await job.loader(job.controller.signal, progress);
      job.controller.signal.throwIfAborted();
      if (job.generation === this.generation && file.size <= this.budget) {
        this.remove(job.key);
        while (this.bytes + file.size > this.budget && this.entries.size)
          this.remove(this.entries.keys().next().value!);
        this.entries.set(job.key, {
          file,
          expires: Date.now() + this.lifetime,
        });
        this.bytes += file.size;
      }
      for (const consumer of job.consumers) consumer.resolve(file);
    } catch (error) {
      for (const consumer of job.consumers) consumer.reject(error);
    } finally {
      job.consumers.clear();
      if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
      this.active--;
      this.drain();
    }
  }
}
export const comparisonScanCache = new ScanCache();
