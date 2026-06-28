import { readFileSync } from "fs";
import { join } from "path";
import { Packer } from "docx";
import { buildDocument } from "@/lib/docxAssembler";
import { log, logRun } from "@/lib/logger";
import type { DocumentContent, LeitfadenRules } from "@/lib/types";

export async function POST(request: Request) {
  logRun("assemble-docx");
  try {
    const body = await request.json() as {
      documentContent: DocumentContent;
      leitfadenRules: LeitfadenRules;
      zielWortanzahl?: number;
    };

    const { documentContent, leitfadenRules } = body;
    log("INFO", "assemble-docx start", {
      sectionCount: documentContent.abschnitte.length,
      totalWordCount: documentContent.abschnitte.reduce((s, a) => s + (a.wordCount ?? 0), 0),
    });

    let logoBuffer: Buffer | null = null;
    try {
      logoBuffer = readFileSync(join(process.cwd(), "public", "fom-logo.png"));
    } catch {
      log("WARN", "assemble-docx: fom-logo.png not found, proceeding without logo");
    }

    const doc = buildDocument(documentContent, leitfadenRules, logoBuffer);
    const buffer = await Packer.toBuffer(doc);

    log("INFO", "assemble-docx done", { bufferBytes: buffer.length });

    return new Response(new Blob([Uint8Array.from(buffer)]), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="Seminararbeit.docx"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    log("ERROR", "assemble-docx error", { error: String(error) });
    console.error("assemble-docx error:", error);
    return Response.json(
      { error: "Fehler beim Erstellen der DOCX-Datei" },
      { status: 500 }
    );
  }
}
