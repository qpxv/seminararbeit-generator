import { readFileSync } from "fs";
import { join } from "path";
import type { LeitfadenRules } from "@/lib/types";

export async function GET() {
  try {
    const raw = readFileSync(join(process.cwd(), "lib", "leitfaden-format.json"), "utf-8");
    const fmt = JSON.parse(raw);

    const rules: LeitfadenRules = {
      seitenanzahl: { min: 10, max: 20 },
      schriftart: fmt.schrift?.art ?? "Times New Roman",
      schriftgroesse: fmt.schrift?.groesse ?? 12,
      zeilenabstand: fmt.schrift?.zeilenabstand ?? 1.5,
      seitenraender: {
        oben: fmt.seitenraender?.oben ?? 2.5,
        unten: fmt.seitenraender?.unten ?? 2.0,
        links: fmt.seitenraender?.links ?? 4.0,
        rechts: fmt.seitenraender?.rechts ?? 2.0,
      },
      zitierweise: fmt.zitierung?.stileErlaubt?.[0] ?? "APA",
      fussnoten: fmt.zitierung?.fussnoten ?? true,
      bibliographieTitel: fmt.literaturverzeichnis?.ueberschrift ?? "Literaturverzeichnis",
      pflichtabschnitte: ["Einleitung", "Hauptteil", "Fazit", fmt.literaturverzeichnis?.ueberschrift ?? "Literaturverzeichnis"],
      sonstigeRegeln: [
        fmt.textgestaltung?.ausrichtung ? `Textausrichtung: ${fmt.textgestaltung.ausrichtung}` : null,
        fmt.textgestaltung?.keinIchWir ? "Kein Ich/Wir — sachlicher Schreibstil" : null,
        fmt.zitierung?.stilMussEinheitlichSein ? "Einheitlicher Zitierstil im gesamten Dokument" : null,
        fmt.zitierung?.seitenzahlImmerErforderlich ? "Seitenzahl bei jedem Zitat erforderlich" : null,
        fmt.sonstiges?.eigenstaendigkeitserklaerungErforderlich ? "Eigenständigkeitserklärung erforderlich" : null,
      ].filter(Boolean) as string[],
    };

    return Response.json({ ...rules, reviewStepEnabled: process.env.REVIEW_STEP !== "false" });
  } catch (error) {
    console.error("leitfaden-rules error:", error);
    return Response.json(
      { error: "leitfaden-format.json nicht gefunden oder ungültig" },
      { status: 500 }
    );
  }
}
