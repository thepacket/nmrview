import { parseSpectrum, validateSession } from "./spectrum";

self.onmessage = async (
  event: MessageEvent<{
    kind: "spectra" | "session";
    files: { file: Blob; name: string; source?: string }[];
  }>,
) => {
  try {
    const { kind, files } = event.data;
    if (kind === "session") {
      self.postMessage({
        result: validateSession(JSON.parse(await files[0].file.text())),
      });
    } else {
      const result = [];
      let points = 0;
      for (const { file, name, source } of files) {
        const spectra = parseSpectrum(await file.text(), name, source);
        points += spectra.reduce((sum, s) => sum + s.x.length, 0);
        result.push(...spectra);
        if (result.length > 24 || points > 5000000)
          throw new Error(
            "A session supports up to 24 spectra / 5 million points.",
          );
      }
      self.postMessage({ result });
    }
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
