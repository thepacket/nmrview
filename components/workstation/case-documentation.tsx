"use client";
import { useEffect, useMemo, useState } from "react";
import type { CaseDocumentation, Study } from "@/lib/study-collection";
import { type RepositoryFile } from "@/lib/repositories";
import {
  loadAcquisitionMetadata,
  type AcquisitionMetadata,
} from "@/lib/acquisition-metadata";

function ReferenceText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(https?:\/\/[^\s<>"\[\]]+|\b10\.\d{4,9}\/[^\s<>"\[\]]+)/g)
        .map((part, index) => {
          const clean = part.replace(/[.,;:)]+$/, "");
          const url = /^https?:\/\//.test(clean)
            ? clean
            : /^10\.\d{4,9}\//.test(clean)
              ? `https://doi.org/${clean}`
              : "";
          return url ? (
            <span key={index}>
              <a href={url} target="_blank" rel="noreferrer">
                {clean}
              </a>
              {part.slice(clean.length)}
            </span>
          ) : (
            part
          );
        })}
    </>
  );
}

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
      {typeof value === "boolean" ? (
        value ? (
          "Yes"
        ) : (
          "No"
        )
      ) : (
        <ReferenceText text={String(value) || "Not supplied"} />
      )}
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
    <pre>
      <ReferenceText text={text} />
    </pre>
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
  const [metadata, setMetadata] = useState<AcquisitionMetadata | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setAcquisition("");
    setMetadata(null);
    if (
      file?.url?.startsWith("https://s3.amazonaws.com/openneuro.org/") &&
      /\.nii(\.gz)?$/i.test(file.name)
    ) {
      setAcquisition("Reading shared and scan-specific acquisition notes…");
      loadAcquisitionMetadata(file.url, abort.signal)
        .then((result) => {
          if (!abort.signal.aborted) {
            setMetadata(result);
            setAcquisition(
              result.sources.length
                ? JSON.stringify(result.values)
                : "No applicable acquisition metadata was found in the public dataset.",
            );
          }
        })
        .catch((error) => {
          if (!abort.signal.aborted)
            setAcquisition(
              `Acquisition documentation could not be resolved: ${error instanceof Error ? error.message : "Repository request failed"}`,
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
          {!!metadata?.sources.length && (
            <details>
              <summary>Metadata sources and field origins</summary>
              <p>
                Shared fields are inherited; files lower in the hierarchy
                override fields with the same name.
              </p>
              <ul>
                {metadata.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.name}
                    </a>
                  </li>
                ))}
              </ul>
              <dl>
                {Object.entries(metadata.provenance).map(([key, source]) => (
                  <div key={key}>
                    <dt>{fieldLabel(key)}</dt>
                    <dd>{source}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
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
