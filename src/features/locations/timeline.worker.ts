import { parseTimeline } from "./parse";
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const file = event.data;
    if (file.size > 100 * 1024 * 1024)
      throw new Error(
        "Divide el historial en archivos de hasta 100 MB para evitar agotar la memoria.",
      );
    const result = parseTimeline(JSON.parse(await file.text()), file.name);
    self.postMessage(result);
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "No se pudo leer el historial",
    });
  }
};
