import { extractTextFromPDF } from "@/lib/pdfParser";
import { parseLeitfaden } from "@/lib/agents";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "Keine Datei übermittelt" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractTextFromPDF(buffer);
    const rules = await parseLeitfaden(text);

    return Response.json(rules);
  } catch (error) {
    console.error("parse-leitfaden error:", error);
    return Response.json(
      { error: "Fehler beim Verarbeiten des Leitfadens" },
      { status: 500 }
    );
  }
}
