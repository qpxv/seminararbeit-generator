import { generateOutline } from "@/lib/agents";
import type { LeitfadenRules } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      forschungsfrage: string;
      gliederung: string;
      zielWortanzahl: number;
      quellenListe: string[];
      leitfadenRules: LeitfadenRules;
    };

    const outline = await generateOutline(body);
    return Response.json(outline);
  } catch (error) {
    console.error("generate-outline error:", error);
    return Response.json(
      { error: "Fehler beim Erstellen der Gliederung" },
      { status: 500 }
    );
  }
}
