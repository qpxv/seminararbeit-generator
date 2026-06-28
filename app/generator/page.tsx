"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, AlertCircle, AlertTriangle } from "lucide-react";
import { HEADER, GENERATOR_PAGE, PIPELINE_STEPS } from "@/lib/data";
import { cn } from "@/lib/utils";
import type {
  SessionInput,
  SessionResult,
  LeitfadenRules,
  ExpandedOutline,
  ParsedSource,
  SectionContent,
  ReviewResult,
  ReviewChange,
  DocumentContent,
  GeneratorPhase,
  OutlineSection,
  ValidationResult,
} from "@/lib/types";

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

const PHASE_ORDER: GeneratorPhase[] = [
  "parsing_leitfaden",
  "parsing_sources",
  "generating_outline",
  "awaiting_user_confirmation",
  "writing_section",
  "reviewing",
  "complete",
];

function StepIndicator({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="w-6 h-6 rounded-full bg-fom-primary flex items-center justify-center shrink-0">
        <Check className="w-3.5 h-3.5 text-white" />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-fom-primary flex items-center justify-center shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-fom-primary animate-pulse" />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full border-2 border-fom-grey-200 shrink-0" />
  );
}

function PipelineStatus({
  phase,
  completedSections,
  totalSections,
  currentSectionTitel,
  reviewLog,
  reviewSkipped,
}: {
  phase: GeneratorPhase;
  completedSections: number;
  totalSections: number;
  currentSectionTitel: string;
  reviewLog: ReviewResult[];
  reviewSkipped: boolean;
}) {
  const currentIndex = PHASE_ORDER.indexOf(phase);

  return (
    <div className="bg-white border border-fom-grey-100 rounded-fom-md p-6 sticky top-24">
      <h2 className="text-sm font-medium text-fom-grey-700 mb-4">
        {GENERATOR_PAGE.pipelineTitle}
      </h2>
      <ul className="space-y-3">
        {PIPELINE_STEPS.map((step) => {
          const stepIndex = PHASE_ORDER.indexOf(step.id);
          const status =
            stepIndex < currentIndex
              ? "done"
              : stepIndex === currentIndex
                ? "active"
                : "pending";
          return (
            <li key={step.id} className="flex items-start gap-3">
              <StepIndicator status={status} />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm",
                    reviewSkipped && step.id === "reviewing"
                      ? "line-through text-fom-grey-400"
                      : status === "pending"
                        ? "text-fom-grey-400"
                        : "text-fom-grey-800"
                  )}
                >
                  {step.label}
                </p>
                {status === "active" &&
                  step.id === "writing_section" &&
                  currentSectionTitel && (
                    <p className="text-xs text-fom-grey-600 mt-0.5 truncate">
                      {currentSectionTitel}
                    </p>
                  )}
              </div>
            </li>
          );
        })}
      </ul>

      {phase === "writing_section" && totalSections > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-fom-grey-600 mb-1">
            <span>
              {completedSections} / {totalSections}{" "}
              {GENERATOR_PAGE.sectionsOf}
            </span>
            <span>
              {Math.round((completedSections / totalSections) * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-fom-primary-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-fom-primary rounded-full transition-all duration-500"
              style={{
                width: `${(completedSections / totalSections) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {reviewLog.length > 0 && (
        <div className="mt-4 pt-4 border-t border-fom-grey-100">
          {reviewLog.map((log) => (
            <p key={log.iteration} className="text-xs text-fom-grey-600">
              {GENERATOR_PAGE.reviewLabel} {log.iteration}{" "}
              {GENERATOR_PAGE.von} 3 — {log.gesamtBewertung}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function OutlineCard({
  section,
  isExpanded,
  onToggle,
}: {
  section: OutlineSection;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="group border border-fom-grey-100 rounded-fom-sm overflow-hidden hover:border-fom-primary transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-fom-grey-97 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-fom-grey-400 shrink-0">
            {section.nummer}
          </span>
          <span className="text-sm font-medium text-fom-grey-800 truncate">
            {section.titel}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="bg-fom-grey-50 text-fom-grey-600 text-xs rounded-fom-sm px-2 py-0.5">
            ~{section.geschaetzteWorte} {GENERATOR_PAGE.estimatedWords}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-fom-grey-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-fom-grey-400" />
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-fom-grey-100 bg-fom-grey-97">
          <p className="text-sm text-fom-grey-600 leading-relaxed mt-3">
            {section.blueprint}
          </p>
        </div>
      )}
    </div>
  );
}

// Strip [[CITE:shortRef:fullRef]] tags to [shortRef] for display
function stripCiteTags(text: string): string {
  return text.replace(/\[\[CITE:([^:]+):[^\]]*\]\]/g, "[$1]");
}

function SectionPreview({ section }: { section: SectionContent }) {
  return (
    <div className="animate-fade-in">
      {section.blocks.map((block, i) => {
        if (block.type === "h1")
          return (
            <h1
              key={i}
              className="text-xl font-bold text-fom-black mt-4 mb-2 first:mt-0"
            >
              {block.text}
            </h1>
          );
        if (block.type === "h2")
          return (
            <h2
              key={i}
              className="text-lg font-medium text-fom-grey-800 mt-3 mb-1.5"
            >
              {block.text}
            </h2>
          );
        if (block.type === "h3")
          return (
            <h3
              key={i}
              className="text-base font-medium text-fom-grey-700 mt-2 mb-1"
            >
              {block.text}
            </h3>
          );
        if (block.type === "quote")
          return (
            <blockquote
              key={i}
              className="border-l-2 border-fom-grey-200 pl-4 my-3 text-fom-grey-600 text-sm italic"
            >
              {stripCiteTags(block.text)}
            </blockquote>
          );
        if (block.type === "page_break")
          return <hr key={i} className="my-4 border-fom-grey-100" />;
        if (block.type === "footnote_ref")
          return (
            <p key={i} className={cn("text-fom-grey-700 text-sm leading-relaxed mb-3", block.bold && "font-bold", block.italic && "italic")}>
              {block.text}
              {block.fussnoteNummer !== undefined && (
                <sup className="text-fom-primary text-xs ml-0.5">[{block.fussnoteNummer}]</sup>
              )}
            </p>
          );
        return (
          <p
            key={i}
            className={cn(
              "text-fom-grey-700 text-sm leading-relaxed mb-3",
              block.bold && "font-bold",
              block.italic && "italic"
            )}
          >
            {stripCiteTags(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function ValidationBanner({ result }: { result: ValidationResult }) {
  if (result.errors.length === 0 && result.warnings.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {result.errors.length > 0 && (
        <div className="bg-red-50 border border-fom-red rounded-fom-sm p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-fom-red shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-fom-red mb-1">Validierungsfehler</p>
              <ul className="space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-fom-red">{e}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="bg-fom-yellow/10 border border-fom-yellow/40 rounded-fom-sm p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-fom-grey-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-fom-grey-700 mb-1">Qualitätshinweise</p>
              <ul className="space-y-0.5">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-fom-grey-600">{w}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GeneratorPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<GeneratorPhase>("idle");
  const [leitfadenRules, setLeitfadenRules] = useState<LeitfadenRules | null>(null);
  const [sources, setSources] = useState<ParsedSource[]>([]);
  const [outline, setOutline] = useState<ExpandedOutline | null>(null);
  const [sections, setSections] = useState<SectionContent[]>([]);
  const [currentSectionTitel, setCurrentSectionTitel] = useState("");
  const [reviewLog, setReviewLog] = useState<ReviewResult[]>([]);
  const [reviewChanges, setReviewChanges] = useState<ReviewChange[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [reviewSkipped, setReviewSkipped] = useState(false);
  const [metaLanguageWarnings, setMetaLanguageWarnings] = useState<string[]>([]);
  const [wordCountWarnings, setWordCountWarnings] = useState<
    Array<{ sectionNummer: string; target: number; actual: number; deviation: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [pipelineInput, setPipelineInput] = useState<SessionInput | null>(null);
  const pipelineStarted = useRef(false);

  const totalSections = outline?.abschnitte.length ?? 0;
  const completedSections = sections.length;

  const runWritingPipeline = useCallback(
    async (
      ol: ExpandedOutline,
      src: ParsedSource[],
      rules: LeitfadenRules
    ) => {
      try {
        setPhase("writing_section");

        const response = await fetch("/api/generate-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outline: ol,
            sources: src,
            leitfadenRules: rules,
          }),
        });

        if (!response.ok) throw new Error("Fehler beim Schreiben der Kapitel");
        if (!response.body) throw new Error("Kein Stream erhalten");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let finalDocument: DocumentContent | null = null;
        let finalSectionSummaries: import("@/lib/types").SectionSummary[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "keepalive") continue;
              if (event.type === "phase") {
                setCurrentSectionTitel(event.sectionTitel ?? "");
              }
              if (event.type === "section_done") {
                setSections((prev) => [...prev, event.section]);
              }
              if (event.type === "all_sections_done") {
                finalDocument = event.document;
                finalSectionSummaries = event.sectionSummaries ?? [];
              }
              if (event.type === "meta_language_warning") {
                setMetaLanguageWarnings((prev) => [
                  ...prev,
                  `${event.sectionNummer} „${event.sectionTitel}"`,
                ]);
              }
              if (event.type === "word_count_warning") {
                setWordCountWarnings((prev) => [
                  ...prev,
                  {
                    sectionNummer: event.sectionNummer,
                    target: event.target,
                    actual: event.actual,
                    deviation: event.deviation,
                  },
                ]);
              }
              if (event.type === "error") {
                throw new Error(event.error);
              }
            } catch {
              // Incomplete JSON chunk — skip
            }
          }
        }

        if (!finalDocument) throw new Error("Kein Dokument empfangen");

        setPhase("reviewing");
        const reviewRes = await fetch("/api/review-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentContent: finalDocument,
            expandedOutline: ol,
            leitfadenRules: rules,
            sources: src,
            sectionSummaries: finalSectionSummaries,
          }),
        });

        if (!reviewRes.ok) throw new Error("Fehler beim Review");

        const {
          finalDocument: reviewedDoc,
          reviewLog: log,
          reviewChanges: changes,
          validationResult: valResult,
        } = (await reviewRes.json()) as {
          finalDocument: DocumentContent;
          reviewLog: ReviewResult[];
          reviewChanges: ReviewChange[];
          validationResult: ValidationResult;
        };

        setReviewLog(log);
        setReviewChanges(changes ?? []);
        setValidationResult(valResult ?? null);

        const result: SessionResult = {
          finalDocument: reviewedDoc,
          reviewLog: log,
          reviewChanges: changes ?? [],
          leitfadenRules: rules,
        };
        sessionStorage.setItem("generatorResult", JSON.stringify(result));

        setPhase("complete");
        setTimeout(() => router.push("/output"), 1500);
      } catch (err) {
        setError(String(err));
        setPhase("error");
      }
    },
    [router]
  );

  const handleConfirmOutline = useCallback(() => {
    if (!outline || !leitfadenRules) return;
    runWritingPipeline(outline, sources, leitfadenRules);
  }, [outline, sources, leitfadenRules, runWritingPipeline]);

  useEffect(() => {
    if (pipelineStarted.current) return;
    pipelineStarted.current = true;

    const raw = sessionStorage.getItem("generatorInput");
    if (!raw) {
      router.replace("/");
      return;
    }

    const input = JSON.parse(raw) as SessionInput;
    setPipelineInput(input);

    async function runPrePipeline() {
      try {
        setPhase("parsing_leitfaden");
        const rulesRes = await fetch("/api/leitfaden-rules");
        if (!rulesRes.ok) throw new Error("Fehler beim Laden der Leitfaden-Regeln");
        const rulesData = (await rulesRes.json()) as LeitfadenRules & { reviewStepEnabled?: boolean };
        if (rulesData.reviewStepEnabled === false) setReviewSkipped(true);
        const rules: LeitfadenRules = rulesData;
        setLeitfadenRules(rules);

        setPhase("parsing_sources");
        const parsedSources: ParsedSource[] = [];
        for (const quelleFile of input.quellenFiles) {
          const blob = base64ToBlob(quelleFile.base64);
          const fd = new FormData();
          fd.append("file", blob, quelleFile.name);
          const res = await fetch("/api/parse-source", {
            method: "POST",
            body: fd,
          });
          if (!res.ok) throw new Error(`Fehler beim Lesen: ${quelleFile.name}`);
          parsedSources.push((await res.json()) as ParsedSource);
        }
        setSources(parsedSources);

        setPhase("generating_outline");
        const outlineRes = await fetch("/api/generate-outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            forschungsfrage: input.forschungsfrage,
            gliederung: input.gliederung,
            zielWortanzahl: input.zielWortanzahl,
            quellenListe: parsedSources.map((s) => s.dateiname),
            leitfadenRules: rules,
          }),
        });
        if (!outlineRes.ok) throw new Error("Fehler beim Erstellen der Gliederung");
        const ol = (await outlineRes.json()) as ExpandedOutline;
        setOutline(ol);

        setPhase("awaiting_user_confirmation");
      } catch (err) {
        setError(String(err));
        setPhase("error");
      }
    }

    runPrePipeline();
  }, [router]);

  const rightContent = () => {
    if (phase === "error") {
      return (
        <div className="bg-red-50 border border-fom-red rounded-fom-md p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-fom-red shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-fom-red mb-1">
                {GENERATOR_PAGE.errorTitle}
              </h3>
              <p className="text-sm text-fom-grey-700">{error}</p>
              <button
                onClick={() => router.push("/")}
                className="mt-3 text-sm text-fom-red border border-fom-red rounded-fom-sm px-3 py-1.5 hover:bg-fom-red/5 transition-colors"
              >
                {GENERATOR_PAGE.retryButton}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (phase === "awaiting_user_confirmation" && outline) {
      return (
        <div className="bg-white border border-fom-grey-100 rounded-fom-md overflow-hidden">
          <div className="p-6 border-b border-fom-grey-100">
            <h2 className="text-lg font-bold text-fom-black mb-1">
              {GENERATOR_PAGE.outlineTitle}
            </h2>
            <p className="text-sm text-fom-grey-600">
              {GENERATOR_PAGE.outlineSubtitle}
            </p>
          </div>
          <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
            {outline.abschnitte.map((section) => (
              <OutlineCard
                key={section.nummer}
                section={section}
                isExpanded={expandedSectionId === section.nummer}
                onToggle={() =>
                  setExpandedSectionId((prev) =>
                    prev === section.nummer ? null : section.nummer
                  )
                }
              />
            ))}
          </div>
          <div className="p-4 border-t border-fom-grey-100 flex gap-3">
            <button
              onClick={handleConfirmOutline}
              className="flex-1 bg-fom-primary text-white font-bold rounded-fom-sm py-2.5 text-sm hover:bg-fom-primary-dark transition-colors"
            >
              {GENERATOR_PAGE.confirmButton}
            </button>
            <button
              onClick={() => router.push("/")}
              className="border border-fom-grey-200 text-fom-grey-700 rounded-fom-sm px-4 py-2.5 text-sm hover:bg-fom-grey-97 transition-colors"
            >
              {GENERATOR_PAGE.backButton}
            </button>
          </div>
        </div>
      );
    }

    // Live preview: writing, reviewing, complete
    if (sections.length > 0 || phase === "writing_section") {
      return (
        <div className="bg-white border border-fom-grey-100 rounded-fom-md overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b border-fom-grey-100">
            <h2 className="text-sm font-medium text-fom-grey-700">
              {GENERATOR_PAGE.previewTitle}
            </h2>
            {currentSectionTitel && phase === "writing_section" && (
              <span className="bg-fom-primary-bg text-fom-primary-darker text-xs rounded-fom-sm px-2 py-1">
                {currentSectionTitel}
              </span>
            )}
            {phase === "reviewing" && (
              <span className="bg-fom-yellow/20 text-fom-grey-700 text-xs rounded-fom-sm px-2 py-1">
                Reviewing...
              </span>
            )}
            {phase === "complete" && (
              <span className="bg-fom-primary-bg text-fom-primary-darker text-xs rounded-fom-sm px-2 py-1">
                Fertig
              </span>
            )}
          </div>
          <div className="bg-fom-grey-97 h-[calc(100vh-10rem)] overflow-y-auto p-8 font-fom space-y-1">
            {/* Validation banners */}
            {validationResult && (
              <ValidationBanner result={validationResult} />
            )}

            {/* Meta-language / word count warnings */}
            {(metaLanguageWarnings.length > 0 || wordCountWarnings.length > 0) && (
              <div className="bg-fom-yellow/10 border border-fom-yellow/40 rounded-fom-sm p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-fom-grey-700 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-fom-grey-600 space-y-0.5">
                    {metaLanguageWarnings.map((w, i) => (
                      <p key={i}>⚠ Meta-Sprache erkannt in {w} — Retry-Versuch gestartet.</p>
                    ))}
                    {wordCountWarnings.map((w, i) => (
                      <p key={i}>
                        ⚠ Wortanzahl {w.sectionNummer}: {w.actual} statt {w.target} Wörter
                        ({w.deviation > 0 ? "+" : ""}{w.deviation}%)
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {pipelineInput && (
              <h1 className="text-2xl font-bold text-fom-black mb-6 pb-4 border-b border-fom-grey-200">
                {pipelineInput.forschungsfrage}
              </h1>
            )}
            {sections.map((section) => (
              <SectionPreview key={section.sectionNummer} section={section} />
            ))}
            {phase === "writing_section" && (
              <div className="flex items-center gap-2 text-fom-grey-400 text-sm mt-4">
                <div className="w-2 h-4 bg-fom-primary animate-pulse rounded-sm" />
              </div>
            )}
            {reviewChanges.length > 0 && (
              <div className="mt-8 pt-6 border-t-2 border-fom-grey-200 space-y-4">
                <p className="text-xs font-semibold text-fom-grey-500 uppercase tracking-widest">
                  KI-Überarbeitung — {reviewChanges.length} Abschnitt{reviewChanges.length !== 1 ? "e" : ""} überarbeitet
                </p>
                {reviewChanges.map((change, i) => (
                  <div key={i} className="rounded-fom-sm overflow-hidden border border-fom-grey-100 text-xs">
                    <div className="bg-fom-grey-50 px-3 py-2 flex items-center gap-2 border-b border-fom-grey-100">
                      <span className="font-mono text-fom-grey-400">{change.sectionNummer}</span>
                      <span className="font-medium text-fom-grey-700">{change.sectionTitel}</span>
                    </div>
                    <div className="bg-fom-yellow/10 border-b border-fom-yellow/30 px-3 py-2 space-y-1">
                      <span className="inline-block bg-fom-yellow/40 text-fom-grey-800 font-semibold rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide mb-1">Kritik</span>
                      <p className="text-fom-grey-700 font-medium">{change.problem}</p>
                      <p className="text-fom-grey-600">{change.verbesserungsvorschlag}</p>
                      {change.originalPreview && (
                        <p className="text-fom-grey-400 italic mt-1 line-clamp-2">{change.originalPreview}…</p>
                      )}
                    </div>
                    <div className="bg-fom-primary-bg px-3 py-2 space-y-1">
                      <span className="inline-block bg-fom-primary/20 text-fom-primary-darker font-semibold rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide mb-1">KI-Revision</span>
                      {change.revisedPreview ? (
                        <p className="text-fom-grey-700 line-clamp-2">{change.revisedPreview}…</p>
                      ) : (
                        <p className="text-fom-grey-400 italic">Abschnitt wurde überarbeitet.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white border border-fom-grey-100 rounded-fom-md p-12 flex items-center justify-center">
        <p className="text-fom-grey-400 text-sm">{GENERATOR_PAGE.waitingText}</p>
      </div>
    );
  };

  return (
    <div className="h-screen bg-fom-grey-97 flex flex-col overflow-hidden">
      <header className="bg-fom-primary h-16 flex items-center px-6 shrink-0">
        <img src="/fom-logo.png" alt={HEADER.logoAlt} className="h-8 mr-4" />
        <span className="text-white font-medium text-base">{HEADER.appName}</span>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="w-full md:w-72 shrink-0">
              <PipelineStatus
                phase={phase}
                completedSections={completedSections}
                totalSections={totalSections}
                currentSectionTitel={currentSectionTitel}
                reviewLog={reviewLog}
                reviewSkipped={reviewSkipped}
              />
            </div>
            <div className="flex-1 min-w-0">{rightContent()}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
