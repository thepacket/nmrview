import type { StudyCollection } from "./study-collection.ts";
import type { RepositoryFile } from "./repositories.ts";
import { scanDescriptor } from "./scan-selection.ts";

export type ComparisonKind = "participants" | "sequences" | "visits";
export type ScanSlot = { studyId: string; fileName: string };
export type ComparisonArrangement = { kind: ComparisonKind; slots: ScanSlot[] };
export type PlanRow = {
  studyId: string;
  label: string;
  candidates: RepositoryFile[];
  fileName?: string;
  reason: string;
};
const limit = 128 * 1024 * 1024;
export function planComparison(
  collection: StudyCollection,
  kind: ComparisonKind,
  anchorId: string,
  referenceName: string,
  selected: string[],
): { rows: PlanRow[]; notice: string } {
  const anchor = collection.studies.find((s) => s.id === anchorId);
  const reference = anchor?.files.find((f) => f.name === referenceName);
  if (!anchor || !reference)
    return { rows: [], notice: "Select a reference scan." };
  const descriptor = scanDescriptor(reference);
  const row = (
    studyId: string,
    label: string,
    candidates: RepositoryFile[],
  ): PlanRow => {
    const usable = candidates.filter((f) => f.size <= limit);
    return {
      studyId,
      label,
      candidates: usable,
      fileName: usable.length === 1 ? usable[0].name : undefined,
      reason:
        usable.length === 1
          ? "One matching scan"
          : usable.length
            ? `${usable.length} candidates — choose a scan`
            : candidates.length
              ? "Matching scan exceeds the 128 MB comparison limit"
              : "No matching acquisition",
    };
  };
  if (kind === "sequences") {
    const groups = new Map<string, RepositoryFile[]>();
    for (const file of anchor.files) {
      const d = scanDescriptor(file);
      if (!d.known || d.type === "Mask / segmentation") continue;
      groups.set(d.type, [...(groups.get(d.type) || []), file]);
    }
    const rows: PlanRow[] = [];
    if (descriptor.type !== "Mask / segmentation")
      rows.push(row(anchor.id, descriptor.type, [reference]));
    for (const [type, files] of groups) {
      if (type === descriptor.type) continue;
      const original = files.filter(
        (f) => scanDescriptor(f).processing === "Original",
      );
      rows.push(row(anchor.id, type, original.length ? original : files));
    }
    return {
      rows: rows.slice(0, 4),
      notice: `${rows.length > 4 ? "Showing the first four sequence types. " : ""}Different sequences from ${anchor.participant} ${anchor.session}. Original scans are preferred. Masks are excluded. Alignment is not assumed.`,
    };
  }
  let studies =
    kind === "visits"
      ? collection.studies
          .filter((s) => s.participant === anchor.participant)
          .sort((a, b) =>
            a.session.localeCompare(b.session, undefined, { numeric: true }),
          )
      : selected
          .map((id) => collection.studies.find((s) => s.id === id))
          .filter((s): s is NonNullable<typeof s> => !!s);
  if (kind === "participants") {
    // Respect an explicit selection; if only one study is selected, suggest another participant.
    if (studies.length < 2) {
      const next = collection.studies.find(
        (s) => s.participant !== anchor.participant,
      );
      studies = next ? [anchor, next] : [anchor];
    } else studies = [anchor, ...studies.filter((s) => s.id !== anchor.id)];
  }
  const rows = studies
    .slice(0, 4)
    .map((study) =>
      row(
        study.id,
        `${study.participant} ${study.session}`.trim(),
        study.id === anchor.id
          ? [reference]
          : descriptor.known
            ? study.files.filter(
                (f) => scanDescriptor(f).signature === descriptor.signature,
              )
            : [],
      ),
    );
  return {
    rows,
    notice:
      kind === "visits"
        ? `${studies.length} visit/session studies for ${anchor.participant}. ${studies.length > 4 ? "Showing the first four. " : ""}Session labels are not verified dates; no chronological or anatomical alignment is inferred.`
        : "Matches use scan type and filename acquisition entities. Review acquisition differences after loading; matching names do not prove identical acquisition or registration.",
  };
}
