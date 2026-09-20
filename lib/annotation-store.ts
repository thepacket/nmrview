import { validateAnnotations, type AnnotationRecord } from "./annotations.ts";
type Entry = {
  record: AnnotationRecord;
  listeners: Set<(record: AnnotationRecord) => void>;

  refs: number;
  saved: boolean;
  writing: boolean;
  warning?: string;
  readFailed: boolean;
};
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("nmrview-annotations", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("scans");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
async function read(key: string) {
  const database = await db();
  return new Promise<AnnotationRecord | undefined>((resolve, reject) => {
    const request = database.transaction("scans").objectStore("scans").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function write(key: string, record: AnnotationRecord) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("scans", "readwrite");
    transaction.objectStore("scans").put(record, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export function createAnnotationStore(
  storage: {
    read: (key: string) => Promise<AnnotationRecord | undefined>;
    write: (key: string, record: AnnotationRecord) => Promise<void>;
  },
  limit = 128 * 1024 * 1024,
) {
  const entries = new Map<string, Entry>();
  const loads = new Map<string, Promise<Entry>>();
  async function openAnnotations(
    initial: AnnotationRecord,
    status: (message: string) => void,
  ) {
    const matches = (record: AnnotationRecord) => {
      if (record.source !== initial.source || record.grid !== initial.grid)
        throw new Error("Scan identity mismatch.");
      if (
        record.frames !== initial.frames ||
        record.dimensions.some((v, i) => v !== initial.dimensions[i])
      )
        throw new Error(
          "Annotation dimensions or frame count differ from the loaded scan.",
        );
    };
    const key = JSON.stringify([initial.source, initial.grid]);
    let entry = entries.get(key);
    if (!entry) {
      let pending = loads.get(key);
      if (!pending) {
        pending = (async () => {
          let record = validateAnnotations(initial, initial.bitmap);
          let warning: string | undefined;
          try {
            const stored = await storage.read(key);
            if (stored) {
              const valid = validateAnnotations(stored, stored.bitmap);
              matches(valid);
              record = valid;
            }
          } catch {
            warning =
              "Browser annotation storage unavailable. Export a package to retain your work.";
          }
          const retained = [...entries.values()].reduce(
            (sum, e) => sum + (e.record.bitmap?.byteLength || 0),
            0,
          );
          if (retained + (record.bitmap?.byteLength || 0) > limit)
            throw new Error(
              "Annotation memory is full. Close another scan before opening labels.",
            );
          const entry: Entry = {
            record,
            listeners: new Set(),
            refs: 0,
            saved: true,
            writing: false,
            warning,
            readFailed: !!warning,
          };
          entries.set(key, entry);
          return entry;
        })();
        loads.set(key, pending);
      }
      try {
        entry = await pending;
      } finally {
        loads.delete(key);
      }
    }
    const current = entry;
    current.refs++;
    status(
      current.warning || "Annotations ready. Changes save in this browser.",
    );
    let closed = false;
    return {
      get: () => current.record,
      subscribe: (listener: (record: AnnotationRecord) => void) => {
        current.listeners.add(listener);
        return () => {
          current.listeners.delete(listener);
        };
      },
      update: (record: AnnotationRecord) => {
        const valid = validateAnnotations(record, record.bitmap);
        matches(valid);
        const bytes =
          [...entries.values()].reduce(
            (sum, e) =>
              sum + (e === current ? 0 : e.record.bitmap?.byteLength || 0),
            0,
          ) + (valid.bitmap?.byteLength || 0);
        if (bytes > limit)
          throw new Error(
            "Annotation memory is full. Export your work and close other scan views.",
          );
        current.record = valid;
        current.saved = false;
        for (const listener of [...current.listeners]) listener(valid);
        if (current.readFailed) {
          status(
            "Previous annotations could not be read. Export this work; existing browser data will not be overwritten.",
          );
          return;
        }
        status("Saving annotations…");
        if (!current.writing) {
          current.writing = true;
          void (async () => {
            try {
              while (!current.saved) {
                const snapshot = current.record;
                await storage.write(key, snapshot);
                if (current.record === snapshot) {
                  current.saved = true;
                  current.warning = undefined;
                  status("Annotations saved in this browser.");
                }
              }
              if (!current.refs) entries.delete(key);
            } catch {
              current.warning =
                "Annotation saving failed. Export a package before leaving this page.";
              status(current.warning);
            } finally {
              current.writing = false;
            }
          })();
        }
      },
      close: () => {
        if (closed) return;
        closed = true;
        current.refs--;
        if (!current.refs && current.saved) entries.delete(key);
      },
    };
  }
  return { open: openAnnotations };
}
export const annotationStore = createAnnotationStore({ read, write });
export const openAnnotations = annotationStore.open;
export type AnnotationHandle = Awaited<ReturnType<typeof openAnnotations>>;
