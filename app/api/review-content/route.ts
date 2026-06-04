import { reviewDocument, writeSection, getRelevantChunks } from "@/lib/agents";
import type {
  DocumentContent,
  ExpandedOutline,
  LeitfadenRules,
  ReviewResult,
  ReviewChange,
  ParsedSource,
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

    for (let iteration = 1; iteration <= 3; iteration++) {
      const result = await reviewDocument({
        documentContent: currentDoc,
        expandedOutline,
        leitfadenRules,
        iteration,
      });

      reviewLog.push(result);

      if (result.success || iteration === 3) break;

      for (const kritik of result.kritikpunkte) {
        const sectionIndex = currentDoc.abschnitte.findIndex(
          (s) => s.sectionNummer === kritik.sectionNummer
        );
        if (sectionIndex === -1) continue;

        const outlineSection = expandedOutline.abschnitte.find(
          (s) => s.nummer === kritik.sectionNummer
        );
        if (!outlineSection) continue;

        const relevantChunks = getRelevantChunks(sources, outlineSection);
        const runningSummary = currentDoc.abschnitte
          .slice(0, sectionIndex)
          .map((s) => `Abschnitt ${s.sectionNummer} "${s.sectionTitel}"`)
          .join(", ");

        const original = currentDoc.abschnitte[sectionIndex];
        const revised = await writeSection({
          section: outlineSection,
          relevantChunks,
          runningSummary,
          leitfadenRules,
          critique: kritik.verbesserungsvorschlag,
        });

        reviewChanges.push({
          sectionNummer: kritik.sectionNummer,
          sectionTitel: original.sectionTitel,
          problem: kritik.problem,
          verbesserungsvorschlag: kritik.verbesserungsvorschlag,
          originalPreview: original.blocks.find((b) => b.type === "paragraph")?.text.slice(0, 300) ?? "",
          revisedPreview: revised.blocks.find((b) => b.type === "paragraph")?.text.slice(0, 300) ?? "",
        });
        currentDoc.abschnitte[sectionIndex] = revised;
      }
    }

    return Response.json({ finalDocument: currentDoc, reviewLog, reviewChanges });
  } catch (error) {
    console.error("review-content error:", error);
    return Response.json(
      { error: "Fehler beim Review" },
      { status: 500 }
    );
  }
}
