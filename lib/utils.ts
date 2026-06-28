export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

const META_PATTERNS = [
  /dieser abschnitt (legt|beschreibt|erläutert|stellt|bespricht|untersucht|zeigt|fasst|analysiert|behandelt|widmet|bietet|gibt|thematisiert)/i,
  /dieses kapitel (legt|beschreibt|erläutert|stellt|zeigt|bespricht|untersucht|analysiert|behandelt|widmet|bietet)/i,
  /im folgenden (wird|werden|soll)/i,
  /das fazit fasst/i,
  /nachfolgend (wird|werden|soll)/i,
  /in diesem abschnitt (wird|werden|soll|erfolgt)/i,
  /der vorliegende abschnitt/i,
  /ziel dieses abschnitts? ist es/i,
  /wird in diesem (abschnitt|kapitel|teil)/i,
];

export function detectMetaLanguage(text: string): boolean {
  return META_PATTERNS.some((pattern) => pattern.test(text));
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function sanitizeHeadingTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

export function inferSectionType(
  titel: string
): "einleitung" | "fazit" | "hauptteil" {
  const t = titel.toLowerCase();
  if (t.includes("einleitung") || t.includes("einführung")) {
    return "einleitung";
  }
  if (
    t.includes("fazit") ||
    t.includes("schluss") ||
    t.includes("zusammenfassung") ||
    t.includes("schlussbetrachtung") ||
    t.includes("schlussfolgerung") ||
    t.includes("ausblick und")
  ) {
    return "fazit";
  }
  return "hauptteil";
}
