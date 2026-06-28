import { detectMetaLanguage, countWords } from "./utils";
import type { DocumentContent, LeitfadenRules, ValidationResult } from "./types";

export function validateDocument(
  doc: DocumentContent,
  rules: LeitfadenRules,
  zielWortanzahl: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Einleitung present and not too short
  const einleitung = doc.abschnitte.find((s) => {
    const t = s.sectionTitel.toLowerCase();
    return t.includes("einleitung") || t.includes("einführung");
  });
  if (!einleitung) {
    errors.push("Kein Einleitungsabschnitt gefunden (Titel muss 'Einleitung' oder 'Einführung' enthalten).");
  } else {
    const wc = countWords(
      einleitung.blocks.filter((b) => b.type === "paragraph").map((b) => b.text).join(" ")
    );
    if (wc < 100) {
      errors.push(`Einleitung zu kurz: ${wc} Wörter (mindestens 100 erforderlich).`);
    }
  }

  // 2. Fazit present and not too short
  const fazit = doc.abschnitte.find((s) => {
    const t = s.sectionTitel.toLowerCase();
    return (
      t.includes("fazit") ||
      t.includes("schluss") ||
      t.includes("zusammenfassung") ||
      t.includes("schlussbetrachtung") ||
      t.includes("schlussfolgerung")
    );
  });
  if (!fazit) {
    errors.push("Kein Fazit/Schlussabschnitt gefunden (Titel muss 'Fazit', 'Schluss' o.ä. enthalten).");
  } else {
    const wc = countWords(
      fazit.blocks.filter((b) => b.type === "paragraph").map((b) => b.text).join(" ")
    );
    if (wc < 100) {
      errors.push(`Fazit zu kurz: ${wc} Wörter (mindestens 100 erforderlich).`);
    }
  }

  // 3. Each section should have at least one citation
  for (const section of doc.abschnitte) {
    const hasCitation = section.blocks.some(
      (b) =>
        (b.type === "paragraph" && b.text.includes("[[CITE:")) ||
        b.type === "footnote_ref"
    );
    if (!hasCitation) {
      warnings.push(
        `Abschnitt ${section.sectionNummer} „${section.sectionTitel}" enthält keine Quellenangabe.`
      );
    }
  }

  // 4. Meta-language detection per section
  for (const section of doc.abschnitte) {
    const allText = section.blocks
      .filter((b) => b.type === "paragraph")
      .map((b) => b.text)
      .join(" ");
    if (detectMetaLanguage(allText)) {
      warnings.push(
        `Abschnitt ${section.sectionNummer} „${section.sectionTitel}" enthält möglicherweise Meta-Sprache (Selbstbeschreibung statt Inhalt).`
      );
    }
  }

  // 5. Total word count within ±20% of target
  const totalWords = doc.abschnitte.reduce((sum, s) => sum + (s.wordCount ?? 0), 0);
  const minTarget = Math.round(zielWortanzahl * 0.8);
  const maxTarget = Math.round(zielWortanzahl * 1.2);
  if (totalWords < minTarget) {
    warnings.push(
      `Gesamtwortanzahl zu niedrig: ${totalWords} Wörter (Ziel: ${zielWortanzahl}, Minimum: ${minTarget}).`
    );
  } else if (totalWords > maxTarget) {
    warnings.push(
      `Gesamtwortanzahl zu hoch: ${totalWords} Wörter (Ziel: ${zielWortanzahl}, Maximum: ${maxTarget}).`
    );
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
}
