import type { RepositoryFile } from "./repositories";
export const annotationSource = (file: RepositoryFile) =>
  JSON.stringify([file.url || "local", file.name, file.size]);
import { z } from "zod";
const vector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const slice = {
  sliceIndex: z.number().int().nonnegative(),
  sliceType: z.number().int().min(0).max(2),
  slicePosition: z.number().finite(),
};
const distance = z.object({
  ...slice,
  startMM: vector,
  endMM: vector,
  distance: z.number().finite().nonnegative(),
});
const angle = z.object({
  ...slice,
  firstLineMM: z.object({ start: vector, end: vector }),
  secondLineMM: z.object({ start: vector, end: vector }),
  angle: z.number().finite().min(0).max(180),
});
export const annotationSchema = z.object({
  format: z.literal("nmrview-annotations"),
  version: z.literal(1),
  source: z.string().min(1).max(8192),
  grid: z.string().min(1).max(8192),
  name: z.string().max(1024),
  dimensions: z.tuple([
    z.number().int().positive(),
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
  frames: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  notes: z.string().max(20000),
  labels: z
    .array(
      z.object({
        value: z.number().int().min(1).max(255),
        name: z.string().min(1).max(80),
      }),
    )
    .max(255),
  measurements: z
    .array(
      z.object({
        id: z.string().max(100),
        name: z.string().max(100),
        frame: z.number().int().nonnegative(),
        value: z.union([distance, angle]),
      }),
    )
    .max(2000),
});
export type AnnotationMetadata = z.infer<typeof annotationSchema>;
export type AnnotationRecord = AnnotationMetadata & {
  bitmap: Uint8Array | null;
};
export const MAX_LABEL_BYTES = 64 * 1024 * 1024;
export function validateAnnotations(
  input: unknown,
  bitmap: Uint8Array | null,
): AnnotationRecord {
  const record = annotationSchema.parse(input);
  const size = record.dimensions.reduce((a, b) => a * b, 1);
  if (
    record.measurements.some((m) => m.frame >= record.frames) ||
    new Set(record.measurements.map((m) => m.id)).size !==
      record.measurements.length
  )
    throw new Error("Invalid measurement identity or frame.");
  if (new Set(record.labels.map((l) => l.value)).size !== record.labels.length)
    throw new Error("Duplicate label value.");
  if (bitmap && (bitmap.byteLength !== size || size > MAX_LABEL_BYTES))
    throw new Error(
      "Label map does not match the scan dimensions or exceeds 64 MB.",
    );
  return { ...record, bitmap };
}
export function assertAnnotationTarget(
  record: AnnotationRecord,
  source: string,
  grid: string,
) {
  if (record.source !== source || record.grid !== grid)
    throw new Error(
      "Annotations belong to a different scan or voxel grid. Load their original scan first.",
    );
}
export function annotationMetadata(
  record: AnnotationRecord,
): AnnotationMetadata {
  const { bitmap: _bitmap, ...metadata } = record;
  return metadata;
}
/** Binary container: NMRA + little-endian JSON length + UTF-8 metadata + optional raw label bytes. */
export function exportAnnotations(record: AnnotationRecord): Blob {
  const metadata = new TextEncoder().encode(
    JSON.stringify(
      annotationMetadata(validateAnnotations(record, record.bitmap)),
    ),
  );
  const header = new Uint8Array(8);
  header.set([78, 77, 82, 65]);
  new DataView(header.buffer).setUint32(4, metadata.length, true);
  return new Blob(
    [
      header,
      metadata,
      ...(record.bitmap ? [record.bitmap.slice().buffer] : []),
    ],
    { type: "application/octet-stream" },
  );
}
export async function importAnnotations(blob: Blob): Promise<AnnotationRecord> {
  if (blob.size < 8 || blob.size > MAX_LABEL_BYTES + 2 * 1024 * 1024 + 8)
    throw new Error("Invalid annotation package size.");
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (header.slice(0, 4).join() !== "78,77,82,65")
    throw new Error("Not an NMRView annotation package.");
  const length = new DataView(header.buffer).getUint32(4, true);
  if (length > 2 * 1024 * 1024 || length + 8 > blob.size)
    throw new Error("Invalid annotation metadata size.");
  const metadata = JSON.parse(await blob.slice(8, 8 + length).text());
  const bitmap =
    blob.size > 8 + length
      ? new Uint8Array(await blob.slice(8 + length).arrayBuffer())
      : null;
  return validateAnnotations(metadata, bitmap);
}
