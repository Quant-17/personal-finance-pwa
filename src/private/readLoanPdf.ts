import { extractLoanDocument } from "./loanDocuments";
import { readPdfText } from "./readPdfText";
export async function readLoanPdf(file: File, signal: AbortSignal) {
  try {
    const result = await readPdfText(file, signal);
    return {
      ...extractLoanDocument(result.pages),
      source_sha256: result.source_sha256,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("This PDF needs the correct password")
    )
      throw new Error(
        "This PDF is password-protected. Unlock a copy on your device and select it; no password is sent or stored.",
      );
    throw error;
  }
}
