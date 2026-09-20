import {
  describeRepositoryFile,
  recommendedFile,
} from "./repository-file-guide.ts";
import { downloadPublic, type RepositoryFile } from "./repositories.ts";
export type Study = {
  id: string;
  participant: string;
  session: string;
  files: RepositoryFile[];
  initialFile: string;
};
export type CaseDocumentation = {
  title: string;
  source: string;
  license: string;
  authors: string;
  sections: { title: string; text: string }[];
  links: { label: string; url: string }[];
  participants?: Record<string, string>[];
};
export type StudyCollection = {
  id: string;
  title: string;
  studies: Study[];
  documentation: CaseDocumentation;
};
export function groupStudies(files: RepositoryFile[]): Study[] {
  const groups = new Map<string, Study>();
  for (const file of files) {
    const info = describeRepositoryFile(file.name, "mri");
    if (!info.subject) continue;
    const session = file.name.match(/(?:^|[/_])(ses-[a-z0-9]+)/i)?.[1] || "";
    const id = `${info.subject}/${session}`;
    const study = groups.get(id) || {
      id,
      participant: info.subject,
      session,
      files: [],
      initialFile: "",
    };
    study.files.push(file);
    groups.set(id, study);
  }
  return [...groups.values()]
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((study) => ({
      ...study,
      initialFile: (recommendedFile(study.files, "mri") || study.files[0]).name,
    }));
}
export function parseParticipants(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/),
    headers = lines.shift()?.split("\t") || [];
  return lines
    .filter(Boolean)
    .map((line) =>
      Object.fromEntries(
        line.split("\t").map((value, i) => [headers[i] || String(i), value]),
      ),
    );
}
export async function loadCaseDocumentation(
  provider: string,
  id: string,
  basic: Omit<CaseDocumentation, "sections" | "links">,
  signal: AbortSignal,
): Promise<CaseDocumentation> {
  const doc: CaseDocumentation = { ...basic, sections: [], links: [] };
  if (provider === "zenodo") {
    const r = JSON.parse(
      await (
        await downloadPublic(
          `https://zenodo.org/api/records/${id}`,
          2 * 1024 * 1024,
          signal,
        )
      ).text(),
    );
    doc.sections.push({
      title: "Study description",
      text: String(
        r.metadata.description || "No case description supplied.",
      ).replace(/<[^>]*>/g, " "),
    });
    for (const file of r.files || [])
      if (/\.(pdf|txt|md|docx?|json)$/i.test(file.key))
        doc.links.push({
          label: file.key,
          url: `https://zenodo.org/api/records/${id}/files/${encodeURIComponent(file.key)}/content`,
        });
    return doc;
  }
  for (const name of [
    "README",
    "dataset_description.json",
    "participants.tsv",
    "participants.json",
  ]) {
    const url = `https://s3.amazonaws.com/openneuro.org/${id}/${name}`;
    try {
      const text = await (
        await downloadPublic(url, 4 * 1024 * 1024, signal)
      ).text();
      if (name === "participants.tsv")
        doc.participants = parseParticipants(text);
      else doc.sections.push({ title: name, text });
      doc.links.push({ label: name, url });
    } catch {
      signal.throwIfAborted();
      doc.sections.push({
        title: name,
        text: "Not available from the public repository.",
      });
    }
  }
  return doc;
}
