import { z } from "zod";

export const COLLECTION_STORAGE_KEY = "nmrview.collection.v1";
const text = z.string().max(4 * 1024 * 1024);
const webUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });
const scanUrl = webUrl.refine((value) =>
  ["s3.amazonaws.com", "zenodo.org", "openneuro.org"].includes(
    new URL(value).hostname,
  ),
);
const file = z.object({
  name: text,
  size: z.number().nonnegative(),
  url: scanUrl,
});
const collection = z.object({
  id: text,
  title: text,
  studies: z
    .array(
      z.object({
        id: text,
        participant: text,
        session: text,
        initialFile: text,
        files: z.array(file).min(1).max(100000),
      }),
    )
    .min(1)
    .max(10000),
  documentation: z.object({
    title: text,
    source: webUrl,
    license: text,
    authors: text,
    sections: z.array(z.object({ title: text, text })),
    links: z.array(z.object({ label: text, url: webUrl })),
    participants: z.array(z.record(z.string(), text)).optional(),
  }),
});
const schema = z.object({
  format: z.literal("nmrview-collection"),
  version: z.literal(1),
  collection,
  view: z.object({
    selected: z.array(text).max(4),
    choices: z.record(z.string(), text),
    layout: z.enum(["0", "1", "2", "3"]),
    linked: z.boolean(),
    filter: text,
    notes: text.nullable(),
  }),
});
export type CollectionSession = z.infer<typeof schema>;
export function parseCollectionSession(input: string): CollectionSession {
  if (input.length > 20 * 1024 * 1024)
    throw new Error("Collection file exceeds 20 MB.");
  const result = schema.safeParse(JSON.parse(input));
  if (!result.success)
    throw new Error("This is not a supported NMRView collection file.");
  const session = result.data,
    studies = session.collection.studies;
  const ids = new Set(studies.map((s) => s.id));
  if (
    ids.size !== studies.length ||
    new Set(session.view.selected).size !== session.view.selected.length ||
    session.view.selected.some((id) => !ids.has(id))
  )
    throw new Error("Invalid participant selection.");
  for (const study of studies) {
    if (!study.files.some((f) => f.name === study.initialFile))
      throw new Error("Missing default scan.");
  }
  for (const [id, name] of Object.entries(session.view.choices)) {
    if (!studies.find((s) => s.id === id)?.files.some((f) => f.name === name))
      throw new Error("Missing selected scan.");
  }
  if (
    session.view.notes &&
    session.view.notes !== "dataset" &&
    !ids.has(session.view.notes)
  )
    throw new Error("Invalid documentation selection.");
  return session;
}
export function readSavedCollection(): CollectionSession | null {
  const raw = localStorage.getItem(COLLECTION_STORAGE_KEY);
  return raw ? parseCollectionSession(raw) : null;
}
