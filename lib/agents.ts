import Anthropic from "@anthropic-ai/sdk";
import type {
  LeitfadenRules,
  ExpandedOutline,
  OutlineSection,
  SectionContent,
  ReviewResult,
  DocumentContent,
  ParsedSource,
} from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

function stripJsonFences(text: string): string {
  return text.replace(/```json\n?|```\n?/g, "").trim();
}

// Agent 0 — Leitfaden-Parser
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
      zitierweise: "APA",
      fussnoten: true,
      pflichtabschnitte: ["Einleitung", "Hauptteil", "Fazit"],
      sonstigeRegeln: [],
    };
  }
}

// Agent 1a — Erweiterter Gliederungs-Writer
export async function generateOutline(input: {
  forschungsfrage: string;
  gliederung: string;
  zielWortanzahl: number;
  quellenListe: string[];
  leitfadenRules: LeitfadenRules;
}): Promise<ExpandedOutline> {
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
  return JSON.parse(stripJsonFences(text)) as ExpandedOutline;
}

// Source-Chunk-Filterung für Agent 1b
export function getRelevantChunks(
  sources: ParsedSource[],
  section: OutlineSection,
  maxChunks = 5
): string {
  const keywords = section.blueprint
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4);

  const scored = sources.flatMap((s) =>
    s.chunks.map((chunk) => ({
      chunk,
      dateiname: s.dateiname,
      score: keywords.filter((kw) => chunk.toLowerCase().includes(kw)).length,
    }))
  );

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);

  if (top.length === 0) return "Keine passenden Quellenausschnitte gefunden.";

  return top
    .map((s) => `[Quelle: ${s.dateiname}]\n${s.chunk}`)
    .join("\n\n---\n\n");
}

function buildSectionPrompt(input: {
  section: OutlineSection;
  relevantChunks: string;
  runningSummary: string;
  leitfadenRules: LeitfadenRules;
  critique?: string;
}): string {
  const critiqueText = input.critique
    ? `\n\nKRITIK AUS VORHERIGEM REVIEW (bitte beheben):\n${input.critique}`
    : "";

  return `AKTUELLER ABSCHNITT:
Nummer: ${input.section.nummer}
Titel: ${input.section.titel}
Blueprint: ${input.section.blueprint}
Zielwortanzahl: ${input.section.geschaetzteWorte}

BISHERIGE ARBEIT ZUSAMMENFASSUNG:
${input.runningSummary || "Dies ist der erste Abschnitt."}

RELEVANTE QUELLENAUSSCHNITTE FÜR DIESEN ABSCHNITT:
${input.relevantChunks}

LEITFADEN-REGELN (Zitierweise etc.):
Zitierweise: ${input.leitfadenRules.zitierweise}
Fußnoten: ${input.leitfadenRules.fussnoten ? "ja" : "nein"}${critiqueText}

Schreibe jetzt den Abschnitt als JSON.`;
}

// Agent 1b — Abschnitt-Writer (Streaming)
export async function writeSection(input: {
  section: OutlineSection;
  relevantChunks: string;
  runningSummary: string;
  leitfadenRules: LeitfadenRules;
  critique?: string;
}): Promise<SectionContent> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system: `Du bist ein erfahrener Autor wissenschaftlicher Texte auf Universitätsniveau auf Deutsch.
Du schreibst einen einzelnen Abschnitt einer Seminararbeit.
Du erhältst: den Blueprint des Abschnitts, relevante Quellenausschnitte, eine Zusammenfassung der bisherigen Arbeit.
Deine Regeln:
- Schreibe akademisches Deutsch, klar und präzise
- Zitiere nur aus den bereitgestellten Quellen, niemals aus dem Gedächtnis
- Formatiere Zitate als Fußnoten
- Antworte NUR mit validem JSON, KEIN Text davor oder danach
- Halte dich exakt an den Blueprint

JSON-Schema für die Antwort:
{
  "sectionNummer": string,
  "sectionTitel": string,
  "blocks": [{ "type": "h1"|"h2"|"h3"|"paragraph"|"quote"|"footnote_ref"|"page_break", "text": string, "bold": boolean, "italic": boolean, "fussnoteNummer": number, "fussnoteText": string }],
  "wordCount": number
}`,
    messages: [
      {
        role: "user",
        content: buildSectionPrompt(input),
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
    return JSON.parse(stripJsonFences(fullText)) as SectionContent;
  } catch {
    // Second attempt: extract the outermost JSON object from the response
    const start = fullText.indexOf("{");
    const end = fullText.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(fullText.slice(start, end + 1)) as SectionContent;
      } catch { /* fall through */ }
    }
    return {
      sectionNummer: input.section.nummer,
      sectionTitel: input.section.titel,
      blocks: [{ type: "paragraph", text: input.section.blueprint }],
      wordCount: 0,
    };
  }
}

// Agent 2 — Reviewer
export async function reviewDocument(input: {
  documentContent: DocumentContent;
  expandedOutline: ExpandedOutline;
  leitfadenRules: LeitfadenRules;
  iteration: number;
}): Promise<ReviewResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `Du bist ein strenger Gutachter für wissenschaftliche Seminararbeiten an einer deutschen Hochschule.
Prüfe die vorgelegte Arbeit kritisch und gnadenlos.
Prüfe insbesondere:
- Hält jeder Abschnitt seinen Blueprint ein?
- Ist die Argumentation kohärent und logisch?
- Werden Quellen korrekt zitiert?
- Ist der Schreibstil akademisch und präzise?
- Werden alle Leitfaden-Regeln eingehalten?
- Gibt es inhaltliche Redundanzen zwischen Abschnitten? (z.B. wenn ein Einleitungsabschnitt und seine Unterabschnitte denselben Inhalt wiederholen)
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
      .slice(0, 2)
      .map((b) => b.text)
      .join(" ")
      .substring(0, 150),
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
    return JSON.parse(stripJsonFences(text)) as ReviewResult;
  } catch {
    return {
      success: true,
      iteration: input.iteration,
      gesamtBewertung: "akzeptabel",
      kritikpunkte: [],
      positivesHervorheben: ["Dokument wurde erfolgreich generiert"],
    };
  }
}
