// Bound gzip expansion before the image parser allocates its volume buffers.
export async function prepareComparisonFile(
  blob: Blob,
  name: string,
  signal: AbortSignal,
  limit = 256 * 1024 * 1024,
): Promise<File> {
  signal.throwIfAborted();
  if (!/\.nii\.gz$/i.test(name)) return new File([blob], name);
  const reader = blob
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit)
        throw new Error(
          "Expanded scan exceeds the 256 MB comparison limit. Use a smaller volume or the main viewer.",
        );
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
    return new File(chunks, name.replace(/\.gz$/i, ""));
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
