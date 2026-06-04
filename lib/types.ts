export interface LeitfadenRules {
  seitenanzahl: { min: number; max: number };
  schriftart: string;
  schriftgroesse: number;
  zeilenabstand: number;
  seitenraender: {
    oben: number;
    unten: number;
    links: number;
    rechts: number;
  };
  zitierweise: string;
  fussnoten: boolean;
  bibliographieTitel?: string;
  pflichtabschnitte: string[];
  sonstigeRegeln: string[];
}

export interface OutlineSection {
  nummer: string;
  titel: string;
  ebene: 1 | 2 | 3;
  blueprint: string;
  geschaetzteWorte: number;
  verwendeteQuellen: string[];
}

export interface ExpandedOutline {
  forschungsfrage: string;
  hauptthese: string;
  abschnitte: OutlineSection[];
  gesamtWortanzahlZiel: number;
}

export type BlockType =
  | "h1"
  | "h2"
  | "h3"
  | "paragraph"
  | "quote"
  | "footnote_ref"
  | "page_break";

export interface ContentBlock {
  type: BlockType;
  text: string;
  bold?: boolean;
  italic?: boolean;
  fussnoteNummer?: number;
  fussnoteText?: string;
}

export interface SectionContent {
  sectionNummer: string;
  sectionTitel: string;
  blocks: ContentBlock[];
  wordCount: number;
}

export interface LiteraturEintrag {
  id: string;
  autor: string;
  jahr: number;
  titel: string;
  verlag?: string;
  zeitschrift?: string;
  seiten?: string;
  url?: string;
  zugegriffen?: string;
}

export interface DocumentContent {
  metadata: {
    titel: string;
    forschungsfrage: string;
    generatedAt: string;
  };
  abschnitte: SectionContent[];
  literaturverzeichnis: LiteraturEintrag[];
}

export interface ReviewResult {
  success: boolean;
  iteration: number;
  gesamtBewertung: "gut" | "akzeptabel" | "mangelhaft";
  kritikpunkte: {
    sectionNummer: string;
    problem: string;
    verbesserungsvorschlag: string;
  }[];
  positivesHervorheben: string[];
}

export type GeneratorPhase =
  | "idle"
  | "parsing_leitfaden"
  | "parsing_sources"
  | "generating_outline"
  | "awaiting_user_confirmation"
  | "writing_section"
  | "reviewing"
  | "refining"
  | "complete"
  | "error";

export interface GeneratorState {
  phase: GeneratorPhase;
  currentSection?: string;
  iteration?: number;
  totalSections?: number;
  completedSections?: number;
  outline?: ExpandedOutline;
  document?: DocumentContent;
  reviewLog?: ReviewResult[];
  error?: string;
}

export interface ParsedSource {
  dateiname: string;
  volltext: string;
  chunks: string[];
}

export interface SessionInput {
  forschungsfrage: string;
  gliederung: string;
  zielWortanzahl: number;
  quellenFiles: { name: string; base64: string }[];
}

export interface ReviewChange {
  sectionNummer: string;
  sectionTitel: string;
  problem: string;
  verbesserungsvorschlag: string;
  originalPreview: string;
  revisedPreview: string;
}

export interface SessionResult {
  finalDocument: DocumentContent;
  reviewLog: ReviewResult[];
  reviewChanges: ReviewChange[];
  leitfadenRules: LeitfadenRules;
}
