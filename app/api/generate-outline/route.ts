import { generateOutline } from "@/lib/agents";
import { inferSectionType, sanitizeHeadingTitle } from "@/lib/utils";
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

    // Post-process: sanitize titles, then infer sectionType
    outline.abschnitte = outline.abschnitte.map((s) => ({
      ...s,
      titel: sanitizeHeadingTitle(s.titel),
      sectionType: s.sectionType ?? inferSectionType(s.titel),
    }));

    // Second pass: detect chapter-header sections (ebene 1 with small target and subsections)
    // These should write only a 1-2 sentence intro, not full content.
    outline.abschnitte = outline.abschnitte.map((s, idx, arr) => {
      if (s.sectionType !== "hauptteil") return s;
      const nextSection = arr[idx + 1];
      const hasSubsections = nextSection?.nummer.startsWith(s.nummer + ".");
      if (s.ebene === 1 && s.geschaetzteWorte <= 60 && hasSubsections) {
        return { ...s, sectionType: "kapitelkopf" as const };
      }
      return s;
    });

    // Scale section word targets to sum exactly to gesamtWortanzahlZiel.
    // Claude consistently over-distributes (e.g. 2330 for a 2000-word goal).
    const rawTotal = outline.abschnitte.reduce((s, a) => s + a.geschaetzteWorte, 0);
    if (rawTotal > 0 && Math.abs(rawTotal - outline.gesamtWortanzahlZiel) / outline.gesamtWortanzahlZiel > 0.02) {
      const scale = outline.gesamtWortanzahlZiel / rawTotal;
      outline.abschnitte = outline.abschnitte.map((s) => ({
        ...s,
        geschaetzteWorte: Math.max(20, Math.round(s.geschaetzteWorte * scale)),
      }));
    }

    log("INFO", "generate-outline POST done", {
      sections: outline.abschnitte.map((s) => ({ nummer: s.nummer, titel: s.titel, words: s.geschaetzteWorte, type: s.sectionType })),
      rawTotal,
      scaledTotal: outline.abschnitte.reduce((s, a) => s + a.geschaetzteWorte, 0),
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
