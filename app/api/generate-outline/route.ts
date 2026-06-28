import { generateOutline } from "@/lib/agents";
import { inferSectionType } from "@/lib/utils";
import { log, logRun } from "@/lib/logger";
import type { LeitfadenRules } from "@/lib/types";

export async function POST(request: Request) {
  logRun("generate-outline");
  try {
    const body = await request.json() as {
      forschungsfrage: string;
      gliederung: string;
      zielWortanzahl: number;
      quellenListe: string[];
      leitfadenRules: LeitfadenRules;
    };

    log("INFO", "generate-outline POST received", { forschungsfrage: body.forschungsfrage.slice(0, 80), zielWortanzahl: body.zielWortanzahl });

    const outline = await generateOutline(body);

    // Post-process: infer sectionType from titles (more reliable than asking Claude to classify)
    outline.abschnitte = outline.abschnitte.map((s) => ({
      ...s,
      sectionType: s.sectionType ?? inferSectionType(s.titel),
    }));

    log("INFO", "generate-outline POST done", {
      sections: outline.abschnitte.map((s) => ({ nummer: s.nummer, titel: s.titel, words: s.geschaetzteWorte, type: s.sectionType })),
    });

    return Response.json(outline);
  } catch (error) {
    log("ERROR", "generate-outline POST error", { error: String(error) });
    return Response.json(
      { error: "Fehler beim Erstellen der Gliederung" },
      { status: 500 }
    );
  }
}
