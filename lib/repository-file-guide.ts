import type { RepositoryFile } from "./repositories.ts";
export function describeRepositoryFile(name: string, mode: "mri" | "nmr") {
  const leaf = name.split("/").at(-1)!;
  const subject = name.match(/(?:^|[/_])(sub-[a-z0-9]+)/i)?.[1] || "";
  const session = name.match(/(?:^|[/_])(ses-[a-z0-9]+)/i)?.[1] || "";
  const context = [subject, session].filter(Boolean).join(" · ");
  const derived = /(?:^|\/)derivatives\//i.test(name);
  let label = "Volume",
    help = "Image volume. Acquisition type is not identified by its filename.",
    rank = 0;
  if (/\.zip$/i.test(name))
    return {
      label: "Spectrum collection",
      help: "Open this collection, then choose a spectrum to display.",
      rank: 0,
      context,
      subject,
    };
  if (mode === "nmr")
    return {
      label: leaf
        .replace(/\.(jdx|dx|jcamp|csv|tsv)$/i, "")
        .replaceAll("_", " "),
      help: "One processed spectrum. Load it alone to start; add others for comparison.",
      rank: 1,
      context,
      subject,
    };
  if (
    /(?:mask|dseg|probseg|aseg|aparc|ribbon|wmparc|segmentation)/i.test(leaf)
  ) {
    label = "Mask / segmentation";
    help =
      "Labels or a region mask. Usually an overlay, not the main anatomical image.";
  } else if (/(_bold|_dwi|_asl)(?:\.|_)/i.test(leaf)) {
    label = /_bold/i.test(leaf)
      ? "Functional time series"
      : /_dwi/i.test(leaf)
        ? "Diffusion series"
        : "Perfusion series";
    help =
      "Multiple measurements or frames; less suitable as a first anatomical image.";
  } else if (/(?:_T1w|^T1|normed_anat|_T1)(?:\.|_)/i.test(leaf)) {
    label = "T1 anatomical scan";
    help = "A good starting image for exploring anatomy.";
    rank = derived ? 60 : 100;
  } else if (/(?:_T2w|^T2|_T2)(?:\.|_)/i.test(leaf)) {
    label = "T2 anatomical scan";
    help = "An anatomical image with a different tissue contrast from T1.";
    rank = derived ? 50 : 90;
  } else if (/_FLAIR(?:\.|_)/i.test(leaf)) {
    label = "FLAIR anatomical scan";
    help = "An anatomical image with fluid-suppressed contrast.";
    rank = derived ? 40 : 80;
  }
  if (derived) help += " Processed derivative.";
  return { label, help, rank, context, subject };
}
export function recommendedFile(files: RepositoryFile[], mode: "mri" | "nmr") {
  return files
    .filter(
      (f) =>
        !/\.zip$/i.test(f.name) &&
        f.size <= (mode === "mri" ? 512 : 60) * 1024 * 1024,
    )
    .map((f) => ({ file: f, rank: describeRepositoryFile(f.name, mode).rank }))
    .filter((f) => f.rank > 0)
    .sort(
      (a, b) => b.rank - a.rank || a.file.name.localeCompare(b.file.name),
    )[0]?.file;
}
