import type { StudyCollection } from "./study-collection.ts";
import {
  parseCollectionSession,
  type CollectionSession,
} from "./collection-session.ts";

export const LIBRARY_KEY = "nmrview.library.v1";
export type LibraryEntry = {
  id: string;
  name: string;
  savedAt: string;
  session: CollectionSession;
};
export function parseLibrary(raw: string | null): LibraryEntry[] {
  if (!raw) return [];
  if (raw.length > 20 * 1024 * 1024)
    throw new Error("Collection library exceeds 20 MB.");
  const data = JSON.parse(raw);
  if (
    data.version !== 1 ||
    !Array.isArray(data.entries) ||
    data.entries.length > 30
  )
    throw new Error("Unsupported collection library.");
  const ids = new Set<string>();
  return data.entries.map((entry: LibraryEntry) => {
    if (
      typeof entry.id !== "string" ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      entry.name.length > 120 ||
      typeof entry.savedAt !== "string" ||
      !Number.isFinite(Date.parse(entry.savedAt))
    )
      throw new Error("Invalid saved collection.");
    ids.add(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      savedAt: entry.savedAt,
      session: parseCollectionSession(JSON.stringify(entry.session)),
    };
  });
}
export function saveLibrary(
  storage: Pick<Storage, "setItem">,
  entries: LibraryEntry[],
) {
  const raw = JSON.stringify({ version: 1, entries });
  parseLibrary(raw);
  // A single atomic write: quota errors leave the previous library intact.
  storage.setItem(LIBRARY_KEY, raw);
}

/** Never label a previously persisted collection as the currently displayed scans. */
export function matchingActiveCollection(
  saved: CollectionSession | null,
  active: StudyCollection | null,
): CollectionSession | null {
  if (!saved || !active) return null;
  try {
    const normalized = parseCollectionSession(
      JSON.stringify({ ...saved, collection: active }),
    );
    return JSON.stringify(saved.collection) ===
      JSON.stringify(normalized.collection)
      ? saved
      : null;
  } catch {
    return null;
  }
}
