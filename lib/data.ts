import type { GeneratorPhase } from "./types";

export const HEADER = {
  appName: "KI Seminararbeiten-Generator",
  logoAlt: "FOM Logo",
};

export const FORM_PAGE = {
  title: "Seminararbeit generieren",
  subtitle:
    "Gib deine Forschungsfrage und Quellen ein — die KI schreibt den Rest.",
  forschungsfrageLabel: "Forschungsfrage",
  forschungsfragePlaceholder:
    "z.B. Welchen Einfluss hat KI auf das Personalmanagement?",
  gliederungLabel: "Gliederung",
  gliederungPlaceholder:
    "1. Einleitung\n1.1 Problemstellung\n1.2 Zielsetzung\n2. Theoretischer Rahmen\n2.1 Grundlagen\n3. Analyse\n4. Fazit",
  zielWortanzahlLabel: "Ziel-Wortanzahl",
  zielWortanzahlPlaceholder: "z.B. 2000",
  zielWortanzahlDescription: "Gesamtwortanzahl der Arbeit (ohne Deckblatt & Literaturverzeichnis)",
  leitfadenLabel: "Leitfaden (PDF)",
  leitfadenDescription:
    "Lade den Bewertungsleitfaden deiner Hochschule hoch (PDF)",
  quellenLabel: "Quellen (PDFs) — optional",
  quellenDescription:
    "Lade deine wissenschaftlichen Quellen hoch (mehrere PDFs möglich). Ohne Quellen schreibt die KI auf Basis des Blueprints.",
  uploadZoneText: "PDF hierher ziehen oder klicken zum Auswählen",
  uploadZoneTextMultiple: "PDFs hierher ziehen oder klicken zum Auswählen",
  submitButton: "Seminararbeit generieren",
  submittingText: "Wird vorbereitet...",
  validation: {
    forschungsfrageRequired: "Bitte gib eine Forschungsfrage ein.",
    gliederungRequired: "Bitte gib eine Gliederung ein.",
    leitfadenRequired: "Bitte lade einen Leitfaden hoch.",
    quellenRequired: "Bitte lade mindestens eine Quelle hoch.",
    onlyPdf: "Nur PDF-Dateien sind erlaubt.",
  },
};

export const PIPELINE_STEPS: { id: GeneratorPhase; label: string }[] = [
  { id: "parsing_leitfaden", label: "Leitfaden analysieren" },
  { id: "parsing_sources", label: "Quellen einlesen" },
  { id: "generating_outline", label: "Gliederung erstellen" },
  { id: "awaiting_user_confirmation", label: "Gliederung bestätigen" },
  { id: "writing_section", label: "Kapitel schreiben" },
  { id: "reviewing", label: "Qualitätsprüfung" },
  { id: "complete", label: "Abgeschlossen" },
];

export const GENERATOR_PAGE = {
  title: "Generierung läuft",
  pipelineTitle: "Pipeline-Status",
  previewTitle: "Live-Vorschau",
  outlineTitle: "Gliederung bestätigen",
  outlineSubtitle:
    "Überprüfe den Plan bevor der Schreibprozess startet",
  confirmButton: "Outline bestätigen & schreiben",
  backButton: "Zurück zur Eingabe",
  estimatedWords: "ca. Wörter",
  reviewLabel: "Review-Iteration",
  von: "von",
  retryButton: "Erneut versuchen",
  errorTitle: "Fehler bei der Generierung",
  waitingText: "Warte auf Daten...",
  sectionsOf: "Abschnitte",
};

export const OUTPUT_PAGE = {
  successTitle: "Deine Seminararbeit ist fertig!",
  downloadButton: "seminararbeit.docx herunterladen",
  downloading: "Wird generiert...",
  reviewLogTitle: "Review-Protokoll",
  newDocumentButton: "Neue Arbeit generieren",
  fileStructureTitle: "Dokument-Übersicht",
  iterationLabel: "Iterationen",
  documentLabel: "Seminararbeit",
  sourcesLabel: "Quellen",
  ratings: {
    gut: "gut",
    akzeptabel: "akzeptabel",
    mangelhaft: "mangelhaft",
  },
};
