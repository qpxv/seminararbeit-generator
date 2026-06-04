// @ts-expect-error - pdf-parse uses CommonJS export=; loaded natively via serverExternalPackages
import pdfParse from "pdf-parse";

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // pdfParse is the callable function from the CJS module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await (pdfParse as any)(buffer) as { text: string };
  return data.text;
}

export function chunkText(text: string, chunkSize = 1000): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}
