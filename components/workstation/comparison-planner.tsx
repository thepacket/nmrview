"use client";
import { useMemo, useState } from "react";
import type { StudyCollection } from "@/lib/study-collection";
import {
  planComparison,
  type ComparisonKind,
  type ComparisonArrangement,
} from "@/lib/comparison-plan";
import { scanDescriptor } from "@/lib/scan-selection";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
const labels = {
  participants: "Compare participants",
  sequences: "Compare sequences",
  visits: "Compare visits",
};
export function ComparisonPlanner({
  collection,
  kind,
  selected,
  choices,
  onClose,
  onApply,
}: {
  collection: StudyCollection;
  kind: ComparisonKind;
  selected: string[];
  choices: Record<string, string>;
  onClose: () => void;
  onApply: (value: ComparisonArrangement) => void;
}) {
  const [anchorId, setAnchorId] = useState(
    selected[0] || collection.studies[0].id,
  );
  const anchor = collection.studies.find((s) => s.id === anchorId)!;
  const [referenceName, setReferenceName] = useState(
    choices[anchorId] || anchor.initialFile,
  );
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const plan = useMemo(
    () => planComparison(collection, kind, anchorId, referenceName, selected),
    [collection, kind, anchorId, referenceName, selected],
  );
  const slots = plan.rows.flatMap((row, i) => {
    const name = overrides[i] ?? row.fileName;
    return name && row.candidates.some((f) => f.name === name)
      ? [{ studyId: row.studyId, fileName: name }]
      : [];
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="comparison-planner">
        <DialogTitle>{labels[kind]}</DialogTitle>
        <DialogDescription>
          Preview the arrangement before downloading. Up to four scans;
          unresolved matches are left out.
        </DialogDescription>
        <div className="dialog-body">
          <label>
            Reference participant / visit
            <select
              className="field"
              value={anchorId}
              onChange={(e) => {
                const study = collection.studies.find(
                  (s) => s.id === e.target.value,
                )!;
                setAnchorId(study.id);
                setReferenceName(choices[study.id] || study.initialFile);
                setOverrides({});
              }}
            >
              {collection.studies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.participant} {s.session}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reference scan
            <select
              className="field"
              value={referenceName}
              onChange={(e) => {
                setReferenceName(e.target.value);
                setOverrides({});
              }}
            >
              {anchor.files.map((f) => (
                <option key={f.name} value={f.name}>
                  {scanDescriptor(f).type} · {f.name.split("/").at(-1)}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">{plan.notice}</p>
          <div className="plan-rows">
            {plan.rows.map((row, i) => (
              <article key={`${row.studyId}:${row.label}`}>
                <strong>
                  {i + 1}. {row.label}
                </strong>
                <p>{row.reason}</p>
                <select
                  className="field"
                  aria-label={`Scan choice ${i + 1}`}
                  value={overrides[i] ?? row.fileName ?? ""}
                  onChange={(e) =>
                    setOverrides((current) => ({
                      ...current,
                      [i]: e.target.value,
                    }))
                  }
                >
                  <option value="">Do not display this scan</option>
                  {row.candidates.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name.split("/").at(-1)} ·{" "}
                      {(f.size / 1048576).toFixed(1)} MB
                    </option>
                  ))}
                </select>
              </article>
            ))}
          </div>
          {slots.length < 2 && (
            <p role="status">
              {kind === "visits" && plan.rows.length < 2
                ? "This participant has only one available visit. Select another participant or comparison mode."
                : "Choose at least two scans for a comparison."}
            </p>
          )}
          <button
            className="btn primary wide"
            disabled={slots.length < 2}
            onClick={() => onApply({ kind, slots })}
          >
            Display {slots.length} scans
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
