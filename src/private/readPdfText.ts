import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
export type PdfLine = {
  page: number;
  line: number;
  text: string;
  y?: number;
  page_width?: number;
  narration?: string;
  source_context?: string;
  spans: { text: string; x: number; width: number }[];
};
export type PdfPageText = { number: number; text: string };

/** Local text-only parsing: no URL loader, remote fonts, OCR, storage or logging. */
export async function readPdfText(
  file: File,
  signal: AbortSignal,
  password?: string,
) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose a PDF no larger than 10 MiB.");
  const buffer = await file.arrayBuffer();
  if (signal.aborted) throw new Error("Document reading cancelled.");
  if (!new TextDecoder().decode(buffer.slice(0, 1024)).includes("%PDF-"))
    throw new Error("Choose a valid PDF document.");
  const bytes = new Uint8Array(buffer);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (signal.aborted) throw new Error("Document reading cancelled.");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const loading = pdfjs.getDocument({
    data: bytes,
    password,
    disableFontFace: true,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    verbosity: 0,
  });
  const cancel = () => {
    void loading.destroy().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 60000);
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 60)
      throw new Error("Import a document of at most 60 pages.");
    const pages: PdfPageText[] = [];
    const sourceLines: PdfLine[] = [];
    let characters = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      if (signal.aborted) throw new Error("Document reading cancelled.");
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      if (content.items.length > 100_000)
        throw new Error(
          "This page contains too many text fragments. Use a shorter statement or manual entry.",
        );
      const items = content.items
        .filter(
          (i): i is Extract<typeof i, { str: string }> =>
            "str" in i && i.str.trim().length > 0,
        )
        .map((i) => ({
          text: i.str,
          x: i.transform[4],
          y: i.transform[5],
          width: i.width,
        }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: { y: number; items: typeof items }[] = [];
      for (const item of items) {
        const line = lines.at(-1);
        if (line && Math.abs(line.y - item.y) <= 2) line.items.push(item);
        else lines.push({ y: item.y, items: [item] });
      }
      lines.forEach((l, index) =>
        sourceLines.push({
          page: n,
          line: index + 1,
          y: l.y,
          page_width: page.getViewport({ scale: 1 }).width,
          text: l.items
            .sort((a, b) => a.x - b.x)
            .map((i) => i.text)
            .join(" "),
          spans: l.items.map((i) => ({ text: i.text, x: i.x, width: i.width })),
        }),
      );
      const text = lines
        .sort((a, b) => b.y - a.y)
        .map((l) =>
          l.items
            .sort((a, b) => a.x - b.x)
            .map((i) => i.text)
            .join(" "),
        )
        .join("\n");
      characters += text.length;
      if (characters > 1_000_000)
        throw new Error(
          "This PDF contains too much text. Import a shorter statement.",
        );
      pages.push({ number: n, text });
      page.cleanup();
    }
    if (!pages.some((p) => p.text.length > 80))
      throw new Error(
        "This PDF has no readable text. Scanned-image OCR is not supported in this version; use a digital statement or manual entry.",
      );
    return { pages, lines: sourceLines, source_sha256: hash };
  } catch (failure) {
    if (signal.aborted) throw new Error("Document reading cancelled.");
    if (timedOut)
      throw new Error(
        "Reading took too long. Choose a shorter digital statement or use manual entry.",
      );
    if (failure instanceof Error && failure.name === "PasswordException")
      throw new Error(
        "This PDF needs the correct password. Enter it locally or unlock a copy on your device; no password is sent or stored.",
      );
    if (
      failure instanceof Error &&
      /^(This |Choose |Import |Reading |An |The |No |Scanned)/.test(
        failure.message,
      )
    )
      throw failure;
    throw new Error(
      "The PDF could not be read safely. Use an unlocked digital statement or use manual entry.",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    await loading.destroy().catch(() => {});
  }
}
