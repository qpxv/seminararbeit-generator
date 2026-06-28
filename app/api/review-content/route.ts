import { reviewDocument, writeSection, getRelevantChunks } from "@/lib/agents";
import { validateDocument } from "@/lib/validation";
import { log, logRun } from "@/lib/logger";
import type {
  DocumentContent,
  ExpandedOutline,
  LeitfadenRules,
  ReviewResult,
  ReviewChange,
  ParsedSource,
  ValidationResult,
} from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      documentContent: DocumentContent;
      expandedOutline: ExpandedOutline;
      leitfadenRules: LeitfadenRules;
      sources: ParsedSource[];
    };

    const { documentContent, expandedOutline, leitfadenRules, sources } = body;
    const reviewLog: ReviewResult[] = [];
    const reviewChanges: ReviewChange[] = [];
    let currentDoc = { ...documentContent, abschnitte: [...documentContent.abschnitte] };

    logRun("review-content");
    log("INFO", "review-content POST received", { REVIEW_STEP: process.env.REVIEW_STEP ?? "true", sectionCount: currentDoc.abschnitte.length });

    if (process.env.REVIEW_STEP === "false") {
      const validationResult = validateDocument(
        currentDoc,
        leitfadenRules,
        expandedOutline.gesamtWortanzahlZiel
      );
      return Response.json({ finalDocument: currentDoc, reviewLog, reviewChanges, validationResult, reviewSkipped: true });
    }

    for (let iteration = 1; iteration <= 3; iteration++) {
      const result = await reviewDocument({
        documentContent: currentDoc,
        expandedOutline,
        leitfadenRules,
        iteration,
      });

      reviewLog.push(result);

      // Aggregate multiple critiques per section before rewriting
      const kritikBySection = new Map<string, { problems: string[]; vorschlaege: string[] }>();
      for (const kritik of result.kritikpunkte) {
        const existing = kritikBySection.get(kritik.sectionNummer) ?? {
          problems: [],
          vorschlaege: [],
        };
        kritikBySection.set(kritik.sectionNummer, {
          problems: [...existing.problems, kritik.problem],
          vorschlaege: [...existing.vorschlaege, kritik.verbesserungsvorschlag],
        });
      }

      for (const [sectionNummer, { problems, vorschlaege }] of kritikBySection) {
        const sectionIndex = currentDoc.abschnitte.findIndex(
          (s) => s.sectionNummer === sectionNummer
        );
        if (sectionIndex === -1) continue;

        const outlineSection = expandedOutline.abschnitte.find(
          (s) => s.nummer === sectionNummer
        );
        if (!outlineSection) continue;

        const relevantChunks = getRelevantChunks(sources, outlineSection);

        // Build running summary from preceding sections
        const runningSummary = currentDoc.abschnitte
          .slice(0, sectionIndex)
          .map((s) => {
            const firstPara = s.blocks
              .find((b) => b.type === "paragraph")
              ?.text.slice(0, 200) ?? "";
            return `Abschnitt ${s.sectionNummer} „${s.sectionTitel}": ${firstPara}`;
          })
          .join("\n\n");

        const original = currentDoc.abschnitte[sectionIndex];
        log("INFO", "rewriting section after critique", { sectionNummer, problems: problems.join(" / ").slice(0, 120) });
        const { section: revised } = await writeSection({
          section: outlineSection,
          relevantChunks,
          runningSummary,
          leitfadenRules,
          critique: `- ${vorschlaege.join("\n- ")}`,
          previousSectionSummaries: [],
        });

        reviewChanges.push({
          sectionNummer,
          sectionTitel: original.sectionTitel,
          problem: problems.join(" / "),
          verbesserungsvorschlag: vorschlaege.join(" / "),
          originalPreview:
            original.blocks.find((b) => b.type === "paragraph")?.text.slice(0, 300) ?? "",
          revisedPreview:
            revised.blocks.find((b) => b.type === "paragraph")?.text.slice(0, 300) ?? "",
        });
        currentDoc.abschnitte[sectionIndex] = revised;
      }

      if (result.success || iteration === 3) break;
    }

    const validationResult: ValidationResult = validateDocument(
      currentDoc,
      leitfadenRules,
      expandedOutline.gesamtWortanzahlZiel
    );

    log("INFO", "review-content done", { iterations: reviewLog.length, rewrites: reviewChanges.length, validationErrors: validationResult.errors.length, validationWarnings: validationResult.warnings.length });

    return Response.json({
      finalDocument: currentDoc,
      reviewLog,
      reviewChanges,
      validationResult,
    });
  } catch (error) {
    log("ERROR", "review-content POST error", { error: String(error) });
    console.error("review-content error:", error);
    return Response.json(
      { error: "Fehler beim Review" },
      { status: 500 }
    );
  }
}
