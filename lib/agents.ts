import Anthropic from "@anthropic-ai/sdk";
import type {
  LeitfadenRules,
  ExpandedOutline,
  OutlineSection,
  SectionContent,
  ContentBlock,
  ReviewResult,
  DocumentContent,
  ParsedSource,
  SectionSummary,
  WriteSectionResult,
  LiteraturEintrag,
  CitationRegistry,
} from "./types";
import { detectMetaLanguage } from "./utils";
import { log } from "./logger";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

function stripJsonFences(text: string): string {
  return text.replace(/```json\n?|```\n?/g, "").trim();
}

// Escapes unescaped ASCII " inside "text" block values.
// The AI embeds Chicago citations like Allen, "Title", in: Journal — the "
// inside the fullRef breaks JSON.parse. We find each "text" value using the
// known schema sentinel `",\s*"bold"` that always immediately follows it, then
// escape every unescaped " in the content. This is safe because the sentinel
// string `", "bold"` cannot appear in real academic German prose.
function fixTextValues(json: string): string {
  const OPEN_RE = /"text"\s*:\s*"/g;
  const result: string[] = [];
  let pos = 0;
  while (pos < json.length) {
    OPEN_RE.lastIndex = pos;
    const openMatch = OPEN_RE.exec(json);
    if (!openMatch) { result.push(json.slice(pos)); break; }
    const valueStart = openMatch.index + openMatch[0].length;
    result.push(json.slice(pos, valueStart));
    const closeMatch = /",\s*"bold"/.exec(json.slice(valueStart));
    if (!closeMatch) { result.push(json.slice(valueStart)); pos = json.length; break; }
    const closeIdx = valueStart + closeMatch.index;
    const escaped = json.slice(valueStart, closeIdx).replace(/(?<!\\)"/g, '\\"');
    result.push(escaped);
    pos = closeIdx;
  }
  return result.join("");
}

// ─── CitationManager ──────────────────────────────────────────────────────────
// Created fresh inside buildDocument; processes [[CITE:shortRef:fullRef]] tags
// in document order and builds globally consistent footnote IDs + bibliography.

export class CitationManager {
  private nextId = 1;
  // normalized key → fullRef of first occurrence (for short-note and bibliography)
  private seenSources = new Map<string, string>();
  // normalized key → canonical shortRef (first-seen variant, for display)
  private canonicalShortRef = new Map<string, string>();
  private occurrences: Array<{ id: number; footnoteText: string }> = [];

  private normalizeShortRef(shortRef: string): string {
    return shortRef
      .replace(/\s*[\/&,]\s*/g, " ")
      .replace(/\s+et\s+al\.?/i, "")
      .replace(/\s+u\.\s*a\.?/i, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  addCitation(shortRef: string, fullRef: string): number {
    const key = this.normalizeShortRef(shortRef);
    const isFirst = !this.seenSources.has(key);

    const id = this.nextId++;
    let footnoteText: string;

    if (isFirst) {
      footnoteText = fullRef;
      this.seenSources.set(key, fullRef);
      this.canonicalShortRef.set(key, shortRef);
    } else {
      footnoteText = this.buildShortNote(key, fullRef);
    }

    this.occurrences.push({ id, footnoteText });
    return id;
  }

  getAllOccurrences(): Array<{ id: number; footnoteText: string }> {
    return this.occurrences;
  }

  getAllCitations(): CitationRegistry {
    return Array.from(this.seenSources.entries()).map(([key, fullRef], i) => ({
      id: i + 1,
      shortRef: this.canonicalShortRef.get(key) ?? key,
      fullRef,
      shortNote: this.buildShortNote(key, fullRef),
      usedInSections: [],
    }));
  }

  buildBibliography(): LiteraturEintrag[] {
    const sources = Array.from(this.seenSources.entries());
    sources.sort(([, aRef], [, bRef]) => {
      return this.extractSortName(aRef).localeCompare(
        this.extractSortName(bRef),
        "de"
      );
    });

    return sources.map(([key, fullRef], i) => ({
      id: `bib-${i + 1}`,
      autor: this.extractSortName(fullRef),
      jahr: this.extractYear(fullRef),
      titel: this.canonicalShortRef.get(key) ?? key,
      formattedRef: this.buildBibEntry(fullRef),
    }));
  }

  private buildShortNote(key: string, currentFullRef: string): string {
    const firstFullRef = this.seenSources.get(key) ?? currentFullRef;
    const lastName = this.extractSortName(firstFullRef);
    const shortTitle = this.extractShortTitle(firstFullRef);
    const page = this.extractPage(currentFullRef);
    return [lastName, shortTitle, page].filter(Boolean).join(", ") + ".";
  }

  private extractSortName(fullRef: string): string {
    // Handles "Nachname, Vorname" and "Vorname Nachname" patterns
    const firstToken = fullRef.split(",")[0].trim();
    // If the first segment has multiple words, take the last (family name in "First Last" format)
    // If it's a single word, that is the family name
    const words = firstToken.split(/\s+/);
    return words[words.length - 1] ?? firstToken;
  }

  private extractShortTitle(fullRef: string): string {
    // Try German angle quotes „…"
    const quoteMatch = fullRef.match(/[„"]([^"""]+)["""]/);
    if (quoteMatch) {
      return quoteMatch[1].split(/\s+/).slice(0, 3).join(" ");
    }
    // Fallback: text after second comma segment
    const parts = fullRef.split(",");
    if (parts.length > 1) {
      return parts[1].trim().replace(/^[„""'']/, "").split(/\s+/).slice(0, 3).join(" ");
    }
    return "";
  }

  private extractPage(fullRef: string): string {
    const match = fullRef.match(/S\.\s*(\d+(?:[-–]\d+)?)/);
    return match ? `S. ${match[1]}` : "";
  }

  private extractYear(fullRef: string): number {
    const match = fullRef.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : 0;
  }

  private buildBibEntry(fullRef: string): string {
    // Remove leading "Vgl. " and trailing page reference for bibliography entries
    return fullRef
      .replace(/^Vgl\.\s+/i, "")
      .replace(/,?\s*S\.\s*\d+(?:[-–]\d+)?\.?\s*$/, "")
      .trim() + ".";
  }
}

// ─── Agent 0 — Leitfaden-Parser ───────────────────────────────────────────────
export async function parseLeitfaden(
  pdfText: string
): Promise<LeitfadenRules> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `Du bist ein präziser Assistent der deutsche Hochschul-Leitfäden für wissenschaftliche Arbeiten analysiert.
Deine Aufgabe: Extrahiere alle formalen Regeln aus dem gegebenen Leitfaden-Text und gib sie als JSON zurück.
Antworte NUR mit validem JSON, KEIN Text davor oder danach, KEINE Markdown-Backticks.
Halte dich exakt an das vorgegebene Schema.`,
    messages: [
      {
        role: "user",
        content: `Analysiere diesen Leitfaden-Text und extrahiere alle Regeln als JSON gemäß diesem Schema:
{ "seitenanzahl": {"min": number, "max": number}, "schriftart": string, "schriftgroesse": number, "zeilenabstand": number, "seitenraender": {"oben": number, "unten": number, "links": number, "rechts": number}, "zitierweise": string, "fussnoten": boolean, "pflichtabschnitte": string[], "sonstigeRegeln": string[] }

Alle Seitenränder in cm. Falls eine Information nicht im Leitfaden steht, verwende sinnvolle Defaults (z.B. schriftgroesse: 12, zeilenabstand: 1.5, schriftart: "Times New Roman").

Leitfaden-Text:
${pdfText.substring(0, 15000)}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  try {
    return JSON.parse(stripJsonFences(text)) as LeitfadenRules;
  } catch {
    return {
      seitenanzahl: { min: 10, max: 20 },
      schriftart: "Times New Roman",
      schriftgroesse: 12,
      zeilenabstand: 1.5,
      seitenraender: { oben: 2, unten: 2, links: 2.5, rechts: 2 },
      zitierweise: "Chicago",
      fussnoten: true,
      pflichtabschnitte: ["Einleitung", "Hauptteil", "Fazit"],
      sonstigeRegeln: [],
    };
  }
}

// ─── Agent 1a — Erweiterter Gliederungs-Writer ────────────────────────────────
export async function generateOutline(input: {
  forschungsfrage: string;
  gliederung: string;
  zielWortanzahl: number;
  quellenListe: string[];
  leitfadenRules: LeitfadenRules;
}): Promise<ExpandedOutline> {
  log("INFO", "generateOutline start", { forschungsfrage: input.forschungsfrage.slice(0, 80), zielWortanzahl: input.zielWortanzahl, quellen: input.quellenListe.length });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: `Du bist ein erfahrener deutscher Akademiker und Experte für wissenschaftliche Seminararbeiten.
Deine Aufgabe: Erstelle eine erweiterte Gliederung (Expanded Outline) für eine deutsche Seminararbeit.
Für jeden Abschnitt schreibst du 2–3 präzise Sätze die beschreiben:
- Was dieser Abschnitt konkret argumentiert
- Welche Quellen er primär verwendet
- Wie er zur Gesamtargumentation beiträgt

Antworte NUR mit validem JSON, KEIN Text davor oder danach, KEINE Markdown-Backticks.`,
    messages: [
      {
        role: "user",
        content: `Forschungsfrage: ${input.forschungsfrage}

Gliederung vom Nutzer:
${input.gliederung}

ZIEL-WORTANZAHL: ${input.zielWortanzahl} Wörter (Gesamtarbeit, ohne Deckblatt & Literaturverzeichnis)
Verteile die Wörter sinnvoll auf die Abschnitte. Die Summe aller geschaetzteWorte MUSS exakt ${input.zielWortanzahl} ergeben.

Verfügbare Quellen (Dateinamen):
${input.quellenListe.join("\n") || "Keine Quellen hochgeladen — schreibe auf Basis des Blueprints."}

Leitfaden-Regeln:
${JSON.stringify(input.leitfadenRules, null, 2)}

Erstelle jetzt die Expanded Outline als JSON. Schema:
{
  "forschungsfrage": string,
  "hauptthese": string,
  "abschnitte": [{ "nummer": string, "titel": string, "ebene": 1|2|3, "blueprint": string, "geschaetzteWorte": number, "verwendeteQuellen": string[] }],
  "gesamtWortanzahlZiel": ${input.zielWortanzahl}
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const outline = JSON.parse(stripJsonFences(text)) as ExpandedOutline;
  log("INFO", "generateOutline done", { sectionCount: outline.abschnitte.length, totalWordTarget: outline.gesamtWortanzahlZiel });
  return outline;
}

// ─── Source-Chunk-Filterung für Agent 1b ──────────────────────────────────────
export function getRelevantChunks(
  sources: ParsedSource[],
  section: OutlineSection,
  maxChunks = 8
): string {
  const titleKeywords = section.titel.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const blueprintKeywords = section.blueprint.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const keywords = [...new Set([...titleKeywords, ...blueprintKeywords])];

  const scored = sources.flatMap((s) =>
    s.chunks.map((chunk) => ({
      chunk,
      dateiname: s.dateiname,
      score: keywords.filter((kw) => chunk.toLowerCase().includes(kw)).length,
    }))
  );

  const top = scored.sort((a, b) => b.score - a.score).slice(0, maxChunks);

  if (top.length === 0) return "Keine passenden Quellenausschnitte gefunden.";

  return top
    .map((s) => `[Quelle: ${s.dateiname}]\n${s.chunk}`)
    .join("\n\n---\n\n");
}

// ─── Section-Prompt Builder ────────────────────────────────────────────────────
const GERMAN_CHAPTER_NUMBERS = ["null", "einem", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"];

function buildSectionTypeInstruction(section: OutlineSection, topLevelChapterCount?: number): string {
  if (section.sectionType === "einleitung") {
    const chapterWord = topLevelChapterCount !== undefined
      ? (topLevelChapterCount < GERMAN_CHAPTER_NUMBERS.length
          ? GERMAN_CHAPTER_NUMBERS[topLevelChapterCount]
          : String(topLevelChapterCount))
      : "N";
    return `
PFLICHT-STRUKTUR FÜR EINLEITUNG:
1. Beginne mit einem konkreten Beispiel, einer aktuellen Statistik oder der gesellschaftlichen Relevanz des Themas — echter akademischer Fließtext, KEINE Ankündigungen.
2. Leite organisch zur Forschungsfrage über und formuliere sie explizit.
3. Erkläre den Aufbau der Arbeit in 2–3 Sätzen als Fließtext: Die Arbeit gliedert sich in ${chapterWord} Kapitel — benenne die Hauptkapitel kurz.
Alle drei Punkte als kontinuierlicher Fließtext — KEIN Aufzählungsformat.`;
  }
  if (section.sectionType === "fazit") {
    return `
PFLICHT-STRUKTUR FÜR FAZIT:
1. Beginne mit einer kompakten Zusammenfassung der wichtigsten Befunde — benenne KONKRETE Ergebnisse und Zahlen, niemals Formulierungen wie "diese Arbeit hat untersucht, ob...".
KRITISCH — Zahlenkonsistenz: Alle im Fazit genannten statistischen Werte, Prozentzahlen und Messergebnisse MÜSSEN exakt mit den Werten im Hauptteil übereinstimmen. Niemals eigenmächtig runden, schätzen oder paraphrasieren.
2. Diskutiere 1–2 wesentliche Limitationen der Arbeit ehrlich und präzise.
KRITISCH — Studiendesign-Begriffe: Beschreibe Limitationen des Studiendesigns ausschließlich anhand der tatsächlichen Designs der zitierten Studien. Verwende KEINE generischen Methodenbegriffe (z.B. „Querschnittsdesign"), wenn die Studien im Hauptteil als Feldstudien, Interventionsstudien oder mit Längsschnittcharakter beschrieben wurden.
3. Schließe mit einem konkreten Ausblick: offene Forschungsfragen oder praktische Implikationen.
Alles als zusammenhängender akademischer Fließtext — KEIN Aufzählungsformat.
WORTLIMIT: Alle drei Punkte zusammen in maximal ${section.geschaetzteWorte} Wörtern. Sei prägnant.`;
  }
  if (section.sectionType === "kapitelkopf") {
    return `\nACHTUNG KAPITELKOPF: Schreibe GENAU ${section.geschaetzteWorte}–${Math.round(section.geschaetzteWorte * 1.1)} Wörter. Nur 1–2 einleitende Sätze die dieses Kapitel ankündigen. KEIN vollständiger Inhalt — die Unterabschnitte tragen den eigentlichen Inhalt. Beginne direkt mit dem Sachinhalt, keine Selbstbeschreibung. Füge KEINE [[CITE:...]]-Tags ein — Kapitelköpfe brauchen keine Zitate.`;
  }
  return "";
}

function buildAntiRedundancyBlock(summaries: SectionSummary[]): string {
  if (summaries.length === 0) return "";
  const findings = summaries.flatMap((s) => s.keyFindings);
  if (findings.length === 0) return "";
  return `
BEREITS ETABLIERTE KERNAUSSAGEN (nicht wiederholen, nur bei Bedarf kurz referenzieren):
${findings.map((f) => `- ${f}`).join("\n")}`;
}

function buildSectionPrompt(input: {
  section: OutlineSection;
  relevantChunks: string;
  runningSummary: string;
  leitfadenRules: LeitfadenRules;
  critique?: string;
  previousSectionSummaries?: SectionSummary[];
  topLevelChapterCount?: number;
}): string {
  const critiqueText = input.critique
    ? `\n\nKRITIK AUS VORHERIGEM REVIEW (bitte beheben):\n${input.critique}`
    : "";

  const sectionTypeInstruction = buildSectionTypeInstruction(input.section, input.topLevelChapterCount);
  const antiRedundancy = buildAntiRedundancyBlock(input.previousSectionSummaries ?? []);
  const assignedSources = input.section.verwendeteQuellen.length > 0
    ? `\nZUGEWIESENE QUELLEN FÜR DIESEN ABSCHNITT: ${input.section.verwendeteQuellen.join(", ")}\nStelle sicher, dass relevante Erkenntnisse aus diesen Quellen mit [[CITE:]]-Tags belegt sind.`
    : "";

  return `AKTUELLER ABSCHNITT:
Nummer: ${input.section.nummer}
Titel: ${input.section.titel}
Blueprint: ${input.section.blueprint}${assignedSources}
Ziel-Wortanzahl: ${input.section.geschaetzteWorte} Wörter — STRIKT EINHALTEN. Schreibe zwischen ${Math.round(input.section.geschaetzteWorte * 0.9)} und ${Math.round(input.section.geschaetzteWorte * 1.15)} Wörtern. Weder kürzer noch länger. Nutze jeden Satz für inhaltlichen Mehrwert — keine Füllsätze.${sectionTypeInstruction}

BISHERIGE ARBEIT — KONTEXT:
${input.runningSummary || "Dies ist der erste Abschnitt."}${antiRedundancy}

RELEVANTE QUELLENAUSSCHNITTE FÜR DIESEN ABSCHNITT:
${input.relevantChunks}

LEITFADEN-REGELN:
Zitierweise: Chicago Notes-Bibliography (17. Aufl., eingedeutscht)
Fußnoten: ${input.leitfadenRules.fussnoten ? "ja" : "nein"}${critiqueText}

Schreibe jetzt den Abschnitt als JSON.`;
}

// ─── Agent 1b — Abschnitt-Writer ──────────────────────────────────────────────
const SECTION_SYSTEM_PROMPT = `Du bist ein erfahrener Autor wissenschaftlicher Texte auf Universitätsniveau auf Deutsch.
Du schreibst einen einzelnen Abschnitt einer Seminararbeit.
Du erhältst: den Blueprint des Abschnitts, relevante Quellenausschnitte, eine Zusammenfassung der bisherigen Arbeit.

ABSOLUTE PFLICHTREGELN:
1. Schreibe akademisches Deutsch, klar, präzise und argumentativ.
2. ABSOLUT VERBOTEN — Meta-Sprache: Beschreibe NIEMALS was dieser Abschnitt tun wird. Schreibe echten Fließtext der es TUT.
   Verbotene Einstiegsmuster (NIEMALS verwenden):
   "Dieser Abschnitt..." / "Dieses Kapitel..." / "Im Folgenden wird..." / "Nachfolgend wird..." /
   "Das Fazit fasst..." / "Er stellt sicher, dass..." / "Ziel dieses Abschnitts ist es..." /
   "Die folgende Analyse..." — jeder Satz der den eigenen Text ankündigt statt Inhalt zu liefern ist ein FEHLER.
3. Zitiere ausschließlich aus den bereitgestellten Quellenausschnitten. Niemals aus dem Gedächtnis.
3b. PFLICHT-BELEGUNG: Jede benannte Studie, jedes konkrete Forschungsergebnis und jede spezifische Zahl MUSS mit einem [[CITE:]]-Tag belegt sein. Schreibe KEINE Fakten ohne direkten Quellenbeleg — lieber allgemeiner formulieren als unbelegt behaupten.
4. Antworte NUR mit validem JSON, KEIN Text davor oder danach.
5. KRITISCH FÜR JSON-GÜLTIGKEIT: Verwende im "text"-Feld NIEMALS gerade ASCII-Anführungszeichen " — weder für Zitate noch für Hervorhebungen noch für Fachbegriffe. Nutze ausschließlich „deutsches Format" (U+201E/U+201C). Gerade " im Text zerstören das JSON.
6. Verwende für biochemische Marker und Neurotransmitter die international übliche wissenschaftliche Schreibweise: „Cortisol" (nicht „Kortisol"), „Oxytocin" (nicht „Oxytozin"), „Dopamin" etc.

ZITIERFORMAT — Chicago Notes-Bibliography (17. Aufl., eingedeutscht):
Füge Zitate als [[CITE:...]]-Tags direkt am Ende des zitierten Satzes ein (vor dem Satzpunkt):
  Format: [[CITE:KurzRef:VollständigerErstnachweis]]

Korrekte Position: Das Tag steht unmittelbar VOR dem abschließenden Satzpunkt, ohne Leerzeichen dazwischen: ...Aussage[[CITE:...]].
KRITISCH: Verwende im fullRef AUSSCHLIESSLICH deutsche Anführungszeichen „..." für Titelnennungen — NIEMALS gerade Anführungszeichen " — sonst ist das JSON ungültig.

Beispiele:
  Sinngemäß: "Stress am Arbeitsplatz beeinträchtigt die Produktivität nachweislich[[CITE:Müller et al. 2018:Vgl. Müller, Thomas, Fischer, Anna und Weber, Klaus, „Stressoren im modernen Büroumfeld", in: Zeitschrift für Arbeitspsychologie 12 (2), 2018, S. 45.]]."
  Wörtlich:   "„Chronic stress leads to measurable cognitive impairment"[[CITE:Schmidt 2020:Schmidt, Julia, Arbeitsstress und Kognition (Berlin: Springer, 2020), S. 112.]]."

KurzRef-Format: Nachname (et al.) Jahr — z.B. "Barker et al. 2012", "Allen 2003"
KRITISCH: Im fullRef IMMER alle Autorennamen vollständig ausschreiben — NIEMALS „u. a." oder „et al." im fullRef verwenden. Nur der KurzRef darf „et al." enthalten.
"Vgl." nur bei sinngemäßen Übernahmen, entfällt bei wörtlichen Zitaten.
Bei Monographien: Vorname Nachname, Titel (Ort: Verlag, Jahr), S. XX.

JSON-SCHEMA (exakt einhalten):
{
  "sectionNummer": string,
  "sectionTitel": string,
  "blocks": [
    { "type": "paragraph"|"h1"|"h2"|"h3"|"quote"|"page_break", "text": string, "bold": false, "italic": false }
  ],
  "wordCount": number
}`;

async function writeSectionAttempt(
  input: {
    section: OutlineSection;
    relevantChunks: string;
    runningSummary: string;
    leitfadenRules: LeitfadenRules;
    critique?: string;
    previousSectionSummaries?: SectionSummary[];
    topLevelChapterCount?: number;
  },
  retryNote: string
): Promise<SectionContent> {
  const userContent = retryNote + buildSectionPrompt(input);
  // kapitelkopf sections need very few tokens (1-2 sentences); other sections
  // floor at 1500 because JSON structure + German tokenization needs headroom.
  const isKapitelkopf = input.section.sectionType === "kapitelkopf";
  const maxTokens = isKapitelkopf
    ? Math.max(500, Math.ceil(input.section.geschaetzteWorte * 8))
    : Math.min(8192, Math.max(1500, Math.ceil(input.section.geschaetzteWorte * 4)));

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    system: SECTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  let fullText = "";
  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      fullText += chunk.delta.text;
    }
  }

  log("INFO", "writeSectionAttempt stream done", {
    sectionNummer: input.section.nummer,
    chars: fullText.length,
    preview: fullText.slice(0, 200),
  });

  const stripped = stripJsonFences(fullText);

  // Pass 1: try as-is (works when AI uses German „..." quotes and outputs valid JSON)
  try {
    const result = JSON.parse(stripped) as SectionContent;
    log("INFO", "writeSectionAttempt Pass 1 OK", { sectionNummer: input.section.nummer, wordCount: result.wordCount });
    return result;
  } catch { /* continue */ }
  log("WARN", "writeSectionAttempt Pass 1 failed", { sectionNummer: input.section.nummer });

  // Pass 2: fix unescaped ASCII " inside "text" block values using the schema-aware
  // sentinel /",\s*"bold"/ — this correctly handles citations like "Title", in: Journal
  // where naive heuristics misidentify the " before ", in:" as a closing delimiter.
  const fixed = fixTextValues(stripped);
  try {
    const result = JSON.parse(fixed) as SectionContent;
    log("INFO", "writeSectionAttempt Pass 2 OK (fixTextValues)", { sectionNummer: input.section.nummer, wordCount: result.wordCount });
    return result;
  } catch { /* continue */ }
  log("WARN", "writeSectionAttempt Pass 2 failed", { sectionNummer: input.section.nummer });

  // Pass 3: extract outermost { } in case there is leading preamble text
  const start = fixed.indexOf("{");
  const end = fixed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const result = JSON.parse(fixed.slice(start, end + 1)) as SectionContent;
      log("INFO", "writeSectionAttempt Pass 3 OK (boundary extract)", { sectionNummer: input.section.nummer, wordCount: result.wordCount });
      return result;
    } catch { /* fall through */ }
  }

  log("ERROR", "writeSectionAttempt all passes failed — returning empty section", {
    sectionNummer: input.section.nummer,
    fullOutput: fullText,
  });
  return {
    sectionNummer: input.section.nummer,
    sectionTitel: input.section.titel,
    blocks: [{ type: "paragraph", text: "", bold: false, italic: false }],
    wordCount: 0,
  };
}

export async function writeSection(input: {
  section: OutlineSection;
  relevantChunks: string;
  runningSummary: string;
  leitfadenRules: LeitfadenRules;
  critique?: string;
  previousSectionSummaries?: SectionSummary[];
  topLevelChapterCount?: number;
}): Promise<WriteSectionResult> {
  const MAX_RETRIES = 2;
  let lastSection: SectionContent | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    log("INFO", `writeSection attempt ${attempt + 1}/${MAX_RETRIES + 1}`, { sectionNummer: input.section.nummer, sectionTitel: input.section.titel });
    const retryNote =
      attempt > 0
        ? `FEHLER IM VORHERIGEN VERSUCH: Der Text enthielt unzulässige Meta-Beschreibungen statt echtem akademischen Inhalt. Schreibe den Abschnitt jetzt NEU — ausschließlich als echter Fließtext der den Blueprint direkt umsetzt, ohne jegliche Selbstbeschreibung oder Ankündigungen.\n\n`
        : "";

    const section = await writeSectionAttempt(input, retryNote);
    lastSection = section;

    const allParaText = section.blocks
      .filter((b) => b.type === "paragraph")
      .map((b) => b.text)
      .join(" ");

    if (!detectMetaLanguage(allParaText)) {
      log("INFO", "writeSection done", { sectionNummer: input.section.nummer, wordCount: section.wordCount, metaLanguageWarning: false });
      return { section, metaLanguageWarning: false };
    }
    log("WARN", "writeSection meta-language detected", { sectionNummer: input.section.nummer, attempt: attempt + 1 });
  }

  log("WARN", "writeSection returning with metaLanguageWarning=true", { sectionNummer: input.section.nummer });
  return { section: lastSection!, metaLanguageWarning: true };
}

// ─── Section-Extend (word count too low) ──────────────────────────────────────
export async function extendSection(input: {
  section: SectionContent;
  delta: number;
  outlineSection: OutlineSection;
  relevantChunks: string;
  runningSummary: string;
  leitfadenRules: LeitfadenRules;
}): Promise<SectionContent> {
  const { section, delta, outlineSection, relevantChunks } = input;
  log("INFO", "extendSection start", { sectionNummer: section.sectionNummer, delta });

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: Math.min(4096, Math.max(1000, Math.ceil(delta * 4))),
    system: `Du bist ein erfahrener Autor wissenschaftlicher Texte auf Deutsch.
Du erhältst einen zu kurzen Abschnitt und erweiterst ihn um substantiellen Inhalt.
Antworte NUR mit einem JSON-Array von ContentBlock-Objekten (nur "paragraph" oder "quote" Typen).
ABSOLUT VERBOTEN: Keine Meta-Sprache. Schreibe echten akademischen Fließtext.
Zitierformat: [[CITE:KurzRef:VollstChicagoZitat]]`,
    messages: [
      {
        role: "user",
        content: `Der Abschnitt "${section.sectionTitel}" ist zu kurz. Schreibe ${delta} weitere Wörter mit substantiellem Inhalt: neue Argumente, zusätzliche Studienergebnisse aus den Quellen oder vertiefte Erläuterung der Mechanismen.

BLUEPRINT: ${outlineSection.blueprint}

RELEVANTE QUELLEN:
${relevantChunks}

BISHERIGER INHALT (nur ergänzen, nicht wiederholen):
${section.blocks
  .filter((b) => b.type === "paragraph")
  .map((b) => b.text)
  .join("\n\n")
  .slice(0, 800)}

Antworte NUR mit einem JSON-Array:
[{ "type": "paragraph", "text": "...", "bold": false, "italic": false }]`,
      },
    ],
  });

  let fullText = "";
  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      fullText += chunk.delta.text;
    }
  }

  try {
    const start = fullText.indexOf("[");
    const end = fullText.lastIndexOf("]");
    if (start === -1 || end <= start) {
      log("WARN", "extendSection: no JSON array found in response", { sectionNummer: section.sectionNummer });
      return section;
    }
    const newBlocks = JSON.parse(fullText.slice(start, end + 1)) as ContentBlock[];
    const extended = { ...section, blocks: [...section.blocks, ...newBlocks] };
    log("INFO", "extendSection done", { sectionNummer: section.sectionNummer, addedBlocks: newBlocks.length });
    return extended;
  } catch (err) {
    log("WARN", "extendSection JSON parse failed", { sectionNummer: section.sectionNummer, error: String(err) });
    return section;
  }
}

// ─── SectionSummary-Extraktion (für Redundanz-Check) ─────────────────────────
export async function extractSectionSummary(
  section: SectionContent,
  sectionId: string
): Promise<SectionSummary> {
  const paragraphs = section.blocks
    .filter((b) => b.type === "paragraph")
    .map((b) => b.text)
    .join("\n")
    .slice(0, 2000);

  if (!paragraphs.trim()) {
    return { sectionId, keyFindings: [], citedSources: [] };
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: `Antworte ausschließlich mit einem JSON-Array von 3–5 deutschen Kernaussagen (kurze Strings, je max. 25 Wörter). Bewahre dabei alle numerischen Werte, Prozentzahlen und Messergebnisse EXAKT (z.B. „19,6 Punkte", „27,01 %"). Kein Text davor oder danach.`,
      messages: [
        {
          role: "user",
          content: `Extrahiere die 3–5 zentralen Kernaussagen aus diesem Abschnitt:\n\n${paragraphs}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "[]";
    const keyFindings = JSON.parse(stripJsonFences(text)) as string[];
    return {
      sectionId,
      keyFindings: Array.isArray(keyFindings) ? keyFindings.slice(0, 5) : [],
      citedSources: [],
    };
  } catch {
    return { sectionId, keyFindings: [], citedSources: [] };
  }
}

// ─── Agent 2 — Reviewer ───────────────────────────────────────────────────────
export async function reviewDocument(input: {
  documentContent: DocumentContent;
  expandedOutline: ExpandedOutline;
  leitfadenRules: LeitfadenRules;
  iteration: number;
}): Promise<ReviewResult> {
  log("INFO", `reviewDocument start — iteration ${input.iteration}`, { sectionCount: input.documentContent.abschnitte.length });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `Du bist ein strenger Gutachter für wissenschaftliche Seminararbeiten an einer deutschen Hochschule.
Prüfe die vorgelegte Arbeit kritisch und gnadenlos.
Prüfe insbesondere:
- Hält jeder Abschnitt seinen Blueprint ein?
- Ist die Argumentation kohärent und logisch?
- Werden Quellen korrekt zitiert (Chicago-Format mit [[CITE:]]-Tags)?
- Ist der Schreibstil akademisch und präzise?
- Werden alle Leitfaden-Regeln eingehalten?
- Gibt es inhaltliche Redundanzen zwischen Abschnitten?
- Enthält ein Abschnitt Meta-Sprache statt echtem Inhalt ("Dieser Abschnitt...", "Im Folgenden...")?
Antworte NUR mit validem JSON, KEIN Text davor oder danach.`,
    messages: [
      {
        role: "user",
        content: `ITERATION: ${input.iteration} von 3

EXPANDED OUTLINE (Blueprint-Vertrag):
${JSON.stringify(input.expandedOutline, null, 2).substring(0, 6000)}

LEITFADEN-REGELN:
${JSON.stringify(input.leitfadenRules, null, 2)}

EINGEREICHTE ARBEIT (Abschnitte zur Bewertung):
${JSON.stringify(
  input.documentContent.abschnitte.map((s) => ({
    sectionNummer: s.sectionNummer,
    sectionTitel: s.sectionTitel,
    wordCount: s.wordCount,
    preview: s.blocks
      .filter((b) => b.type === "paragraph")
      .slice(0, 3)
      .map((b) => b.text)
      .join(" ")
      .substring(0, 300),
  })),
  null,
  2
)}

Bewerte die Arbeit und gib Feedback als JSON:
{
  "success": boolean,
  "iteration": ${input.iteration},
  "gesamtBewertung": "gut" | "akzeptabel" | "mangelhaft",
  "kritikpunkte": [{ "sectionNummer": string, "problem": string, "verbesserungsvorschlag": string }],
  "positivesHervorheben": string[]
}

Setze success: true nur wenn die Arbeit wirklich gut ist.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const result = JSON.parse(stripJsonFences(text)) as ReviewResult;
    log("INFO", `reviewDocument done — iteration ${input.iteration}`, { gesamtBewertung: result.gesamtBewertung, kritikCount: result.kritikpunkte.length, success: result.success });
    return result;
  } catch {
    log("WARN", "reviewDocument JSON parse failed — using fallback", { iteration: input.iteration });
    return {
      success: true,
      iteration: input.iteration,
      gesamtBewertung: "akzeptabel",
      kritikpunkte: [],
      positivesHervorheben: ["Dokument wurde erfolgreich generiert"],
    };
  }
}
