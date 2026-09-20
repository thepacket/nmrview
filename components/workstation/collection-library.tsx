"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  LIBRARY_KEY,
  parseLibrary,
  saveLibrary,
  type LibraryEntry,
} from "@/lib/collection-library";
import {
  readSavedCollection,
  type CollectionSession,
} from "@/lib/collection-session";
import { downloadBlob } from "./controls";

export function CollectionLibrary({
  open,
  onClose,
  onOpen,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (session: CollectionSession) => void;
  onImport: () => void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [current, setCurrent] = useState<CollectionSession | null>(null);
  const [readable, setReadable] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  useEffect(() => {
    if (!open) return;
    setMessage("");
    setEditing(null);
    setReadable(false);
    try {
      setEntries(parseLibrary(localStorage.getItem(LIBRARY_KEY)));
      setReadable(true);
      const session = readSavedCollection();
      setCurrent(session);
      setName(session?.collection.title.slice(0, 120) || "");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Browser storage is unavailable.",
      );
    }
  }, [open]);
  function write(next: LibraryEntry[], success: string) {
    try {
      saveLibrary(localStorage, next);
      setEntries(next);
      setMessage(success);
      return true;
    } catch {
      setMessage(
        "Could not save the library. Browser storage may be full. Export a collection file to keep it.",
      );
      return false;
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Collection library</DialogTitle>
        <DialogDescription>
          Named snapshots of participants, scan choices, case notes and viewing
          positions. Images reload from their repositories; source availability
          and versions can change.
        </DialogDescription>
        <div className="dialog-body collection-library">
          <div className="library-save">
            <label>
              Collection name
              <input
                className="field"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              className="btn primary"
              disabled={
                !readable || !current || !name.trim() || entries.length >= 30
              }
              onClick={() => {
                if (current)
                  write(
                    [
                      {
                        id: crypto.randomUUID(),
                        name: name.trim(),
                        savedAt: new Date().toISOString(),
                        session: current,
                      },
                      ...entries,
                    ],
                    "Named snapshot saved. Later changes remain in your current collection until you save another snapshot.",
                  );
              }}
            >
              Save current snapshot
            </button>
            <button className="btn" onClick={onImport}>
              Import collection file
            </button>
          </div>
          {!current && (
            <p>
              Open a repository collection to save its participants and views
              here. Local MRI sessions use the separate MRI session export.
            </p>
          )}
          <p role="status">{message}</p>
          {!entries.length && <p>No named collections saved yet.</p>}
          {entries.map((entry) => (
            <article className="library-entry" key={entry.id}>
              {editing === entry.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      rename.trim() &&
                      write(
                        entries.map((item) =>
                          item.id === entry.id
                            ? { ...item, name: rename.trim() }
                            : item,
                        ),
                        "Collection renamed.",
                      )
                    )
                      setEditing(null);
                  }}
                >
                  <input
                    aria-label="New collection name"
                    className="field"
                    maxLength={120}
                    value={rename}
                    onChange={(e) => setRename(e.target.value)}
                    autoFocus
                  />
                  <button className="btn" disabled={!rename.trim()}>
                    Save name
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <strong>{entry.name}</strong>
              )}
              <p>
                {entry.session.collection.studies.length} participant/session
                studies · {new Date(entry.savedAt).toLocaleString()}
              </p>
              <div className="library-actions">
                <button
                  className="btn primary"
                  onClick={() => onOpen(entry.session)}
                >
                  Open collection
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setEditing(entry.id);
                    setRename(entry.name);
                  }}
                >
                  Rename
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    downloadBlob(
                      new Blob([JSON.stringify(entry.session)], {
                        type: "application/json",
                      }),
                      "nmrview-collection.json",
                    )
                  }
                >
                  Export
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    write(
                      entries.filter((item) => item.id !== entry.id),
                      "Snapshot deleted. The current study and repository data are unchanged.",
                    )
                  }
                >
                  Delete snapshot
                </button>
              </div>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
