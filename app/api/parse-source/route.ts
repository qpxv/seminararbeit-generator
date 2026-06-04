import { extractTextFromPDF, chunkText } from "@/lib/pdfParser";
import type { ParsedSource } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "Keine Datei übermittelt" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const volltext = await extractTextFromPDF(buffer);
    const chunks = chunkText(volltext);

    const result: ParsedSource = {
      dateiname: file.name,
      volltext,
      chunks,
    };

    return Response.json(result);
  } catch (error) {
    console.error("parse-source error:", error);
    return Response.json(
      { error: "Fehler beim Verarbeiten der Quelle" },
      { status: 500 }
    );
  }
}
