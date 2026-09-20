"use client";
import { useEffect, useState } from "react";
import {
  loadAcquisitionMetadata,
  type AcquisitionMetadata,
} from "@/lib/acquisition-metadata";
import { scanDescriptor } from "@/lib/scan-selection";
import type { Study } from "@/lib/study-collection";
import type { RepositoryFile } from "@/lib/repositories";
const fields: [string, string][] = [
  ["Modality", "Modality"],
  ["Manufacturer", "Manufacturer"],
  ["ManufacturersModelName", "Scanner model"],
  ["MagneticFieldStrength", "Field strength (T)"],
  ["RepetitionTime", "Repetition time (s)"],
  ["EchoTime", "Echo time (s)"],
  ["InversionTime", "Inversion time (s)"],
  ["FlipAngle", "Flip angle (°)"],
  ["SliceThickness", "Slice thickness (mm)"],
  ["PhaseEncodingDirection", "Phase encoding"],
  ["TaskName", "Task"],
];
export function AcquisitionComparison({
  scans,
}: {
  scans: { study: Study; file: RepositoryFile }[];
}) {
  const [results, setResults] = useState<
    Record<string, { data?: AcquisitionMetadata; error?: string }>
  >({});
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const urls = JSON.stringify(scans.map((s) => s.file.url || ""));
  useEffect(() => {
    const abort = new AbortController();
    setResults({});
    const requested: string[] = JSON.parse(urls);
    for (const url of new Set(requested)) {
      if (!url) {
        setResults((current) => ({
          ...current,
          [url]: { error: "No online acquisition metadata" },
        }));
        continue;
      }
      loadAcquisitionMetadata(url, abort.signal)
        .then((data) => {
          if (!abort.signal.aborted)
            setResults((current) => ({ ...current, [url]: { data } }));
        })
        .catch((error) => {
          if (!abort.signal.aborted)
            setResults((current) => ({
              ...current,
              [url]: {
                error:
                  error instanceof Error
                    ? error.message
                    : "Metadata unavailable",
              },
            }));
        });
    }
    return () => abort.abort();
  }, [urls]);
  const rows = fields.map(([key, label]) => {
    const values = scans.map(
      (s) => results[s.file.url || ""]?.data?.values[key],
    );
    const available = values.filter((v) => v !== undefined);
    const differs = new Set(available.map((v) => JSON.stringify(v))).size > 1;
    return {
      key,
      label,
      values,
      differs,
      incomplete: available.length < scans.length,
    };
  });
  return (
    <section
      className="acquisition-comparison"
      aria-label="Acquisition differences"
    >
      <div className="acquisition-heading">
        <strong>Acquisition differences</strong>
        <label>
          <input
            type="checkbox"
            checked={differencesOnly}
            onChange={(e) => setDifferencesOnly(e.target.checked)}
          />{" "}
          Differences / missing values only
        </label>
      </div>
      <p>
        Reported acquisition values; matching values do not establish alignment
        or complete equivalence.
      </p>
      <table>
        <thead>
          <tr>
            <th>Property</th>
            {scans.map(({ study, file }) => (
              <th key={study.id + file.name}>
                {study.participant} {study.session}
                <br />
                {scanDescriptor(file).type}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((row) => !differencesOnly || row.differs || row.incomplete)
            .sort((a, b) => Number(b.differs) - Number(a.differs))
            .map((row) => (
              <tr
                key={row.key}
                className={row.differs ? "metadata-different" : ""}
              >
                <th>
                  {row.label}
                  {row.differs && <small> Different</small>}
                </th>
                {row.values.map((value, i) => (
                  <td
                    key={i}
                    title={
                      results[scans[i].file.url || ""]?.data?.provenance[
                        row.key
                      ] || undefined
                    }
                  >
                    {value === undefined
                      ? !results[scans[i].file.url || ""]
                        ? "Loading…"
                        : results[scans[i].file.url || ""]?.error
                          ? "Unavailable"
                          : "Not reported"
                      : typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                  </td>
                ))}
              </tr>
            ))}
          <tr>
            <th>Scan file</th>
            {scans.map(({ study, file }) => (
              <td key={study.id + file.name} title={file.name}>
                {file.name.split("/").at(-1)}
              </td>
            ))}
          </tr>
          <tr>
            <th>Processing</th>
            {scans.map(({ study, file }) => (
              <td key={study.id + file.name}>
                {scanDescriptor(file).processing}
              </td>
            ))}
          </tr>
          <tr>
            <th>Metadata sources</th>
            {scans.map(({ study, file }) => {
              const result = results[file.url || ""];
              return (
                <td key={study.id + file.name}>
                  {!result
                    ? "Loading metadata…"
                    : result.error
                      ? result.error
                      : !result.data?.sources.length
                        ? "No applicable sidecars found"
                        : result.data.sources.map((source) => (
                            <div key={source.url}>
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {source.name.split("/").at(-1)}
                              </a>
                            </div>
                          ))}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
