"use client";
import { useMemo } from "react";
import type { Study } from "@/lib/study-collection";
import type { RepositoryFile } from "@/lib/repositories";
import { scanDescriptor } from "@/lib/scan-selection";
export function ScanPicker({
  study,
  file,
  onChange,
}: {
  study: Study;
  file: RepositoryFile;
  onChange: (name: string) => void;
}) {
  const groups = useMemo(() => {
    const result = new Map<string, RepositoryFile[]>();
    for (const scan of study.files) {
      const key = scanDescriptor(scan).group;
      result.set(key, [...(result.get(key) || []), scan]);
    }
    return [...result].sort(([a], [b]) => a.localeCompare(b));
  }, [study.files]);
  const info = scanDescriptor(file);
  return (
    <div className="scan-picker">
      <label>
        Scan · {study.session || "No session label"}
        <select
          className="field"
          aria-label={`Scan for ${study.id}`}
          value={file.name}
          onChange={(e) => onChange(e.target.value)}
        >
          {groups.map(([group, files]) => (
            <optgroup key={group} label={group}>
              {files.map((scan) => (
                <option key={scan.name} value={scan.name}>
                  {scanDescriptor(scan).details || scanDescriptor(scan).type} ·{" "}
                  {scan.name.split("/").at(-1)} ·{" "}
                  {(scan.size / 1048576).toFixed(1)} MB
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p>
        {info.type} · {info.processing}
        {info.details && ` · ${info.details}`}
      </p>
      <details>
        <summary>File details</summary>
        <p>{file.name}</p>
        <p>
          {(file.size / 1048576).toFixed(1)} MB · Types and acquisition labels
          inferred from filenames.
        </p>
      </details>
    </div>
  );
}
