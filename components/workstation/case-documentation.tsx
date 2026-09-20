"use client";
import { useEffect, useMemo, useState } from "react";
import type { CaseDocumentation, Study } from "@/lib/study-collection";
import { downloadPublic, type RepositoryFile } from "@/lib/repositories";

function fieldLabel(key: string) {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
}

function MetadataValue({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  if (value === null)
    return <span className="metadata-empty">Not supplied</span>;
  if (Array.isArray(value)) {
    if (!value.length)
      return <span className="metadata-empty">None listed</span>;
    return (
      <ol className="metadata-list">
        {value.map((item, index) => (
          <li key={index}>
            <MetadataValue value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length)
      return <span className="metadata-empty">No fields supplied</span>;
    return (
      <dl className="metadata-fields">
        {entries.map(([key, item]) => (
          <div key={key}>
            <dt title={key}>{fieldLabel(key)}</dt>
            <dd>
              {item !== null && typeof item === "object" ? (
                <details open={depth < 1}>
                  <summary>
                    {Array.isArray(item) ? `${item.length} items` : "Details"}
                  </summary>
                  <MetadataValue value={item} depth={depth + 1} />
                </details>
              ) : (
                <MetadataValue value={item} depth={depth + 1} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <span>
      {typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value) || "Not supplied"}
    </span>
  );
}

function DocumentationContent({ text }: { text: string }) {
  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(text) as unknown };
    } catch {
      return null;
    }
  }, [text]);
  return parsed ? (
    <div className="formatted-metadata">
      <MetadataValue value={parsed.value} />
    </div>
  ) : (
    <pre>{text}</pre>
  );
}

const sectionLabels: Record<string, string> = {
  "dataset_description.json": "Dataset description",
  "participants.json": "Participant field descriptions",
};
export function CaseNotes({
  doc,
  study,
  file,
}: {
  doc: CaseDocumentation;
  study?: Study;
  file?: RepositoryFile;
}) {
  const [acquisition, setAcquisition] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    setAcquisition("");
    if (
      file?.url?.startsWith("https://s3.amazonaws.com/openneuro.org/") &&
      /\.nii(\.gz)?$/i.test(file.name)
    ) {
      const url = file.url.replace(/\.nii(\.gz)?$/i, ".json");
      setAcquisition("Reading acquisition notes…");
      downloadPublic(url, 1024 * 1024, abort.signal)
        .then((b) => b.text())
        .then((text) => {
          if (!abort.signal.aborted) setAcquisition(text);
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setAcquisition(
              "No individual acquisition sidecar is available for this file. Shared acquisition notes may be listed on the source site.",
            );
        });
    }
    return () => abort.abort();
  }, [file?.url]);
  const participant = doc.participants?.find(
    (p) => p.participant_id === study?.participant,
  );
  return (
    <div className="case-notes">
      <h3>{doc.title}</h3>
      <p>{doc.authors}</p>
      <p>
        License: {doc.license} ·{" "}
        <a href={doc.source} target="_blank" rel="noreferrer">
          Original study and citation ↗
        </a>
      </p>
      {study && (
        <>
          <h4>
            {study.participant} {study.session}
          </h4>
          {participant ? (
            <dl>
              {Object.entries(participant).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>
              No participant-specific case notes were supplied in the available
              metadata.
            </p>
          )}
        </>
      )}
      {acquisition && (
        <details open>
          <summary>Selected scan acquisition notes</summary>
          <DocumentationContent text={acquisition} />
        </details>
      )}
      {doc.sections.map((section) => (
        <details key={section.title}>
          <summary>{sectionLabels[section.title] || section.title}</summary>
          <DocumentationContent text={section.text} />
        </details>
      ))}
      {!!doc.links.length && (
        <>
          <h4>Source documents</h4>
          <ul>
            {doc.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
