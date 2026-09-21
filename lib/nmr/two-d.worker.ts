import { parse2D } from "./two-d";
self.onmessage = async ({ data }) => {
  try {
    if (data.file.size > 32 * 1024 * 1024)
      throw new Error("2D spectrum exceeds 32 MB.");
    self.postMessage({
      result: parse2D(await data.file.text(), data.name, data.source),
    });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
