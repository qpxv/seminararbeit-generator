import { readFileSync } from "fs";
import { join } from "path";
import { Packer } from "docx";
import { buildDocument } from "@/lib/docxAssembler";
import type { DocumentContent, LeitfadenRules } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      documentContent: DocumentContent;
      leitfadenRules: LeitfadenRules;
    };

    const { documentContent, leitfadenRules } = body;

    let logoBuffer: Buffer | null = null;
    try {
      logoBuffer = readFileSync(join(process.cwd(), "public", "fom-logo.png"));
    } catch {
      // Logo not found — proceed without it
    }

    const doc = buildDocument(documentContent, leitfadenRules, logoBuffer);
    const buffer = await Packer.toBuffer(doc);

    return new Response(new Blob([Uint8Array.from(buffer)]), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="Seminararbeit.docx"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("assemble-docx error:", error);
    return Response.json(
      { error: "Fehler beim Erstellen der DOCX-Datei" },
      { status: 500 }
    );
  }
}
