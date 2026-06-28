import {
  writeSection,
  getRelevantChunks,
  extractSectionSummary,
  extendSection,
} from "@/lib/agents";
import { countWords } from "@/lib/utils";
import { log, logRun } from "@/lib/logger";
import type {
  ExpandedOutline,
  ParsedSource,
  LeitfadenRules,
  SectionContent,
  SectionSummary,
  DocumentContent,
} from "@/lib/types";

const encoder = new TextEncoder();

function sseEvent(data: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  const body = await request.json() as {
    outline: ExpandedOutline;
    sources: ParsedSource[];
    leitfadenRules: LeitfadenRules;
  };

  const { outline, sources, leitfadenRules } = body;

  logRun("generate-content");
  log("INFO", "generate-content POST received", { sectionCount: outline.abschnitte.length });

  const topLevelChapterCount = outline.abschnitte.filter((s) => !s.nummer.includes(".")).length;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let runningSummary = "";
        const abschnitte: SectionContent[] = [];
        const previousSectionSummaries: SectionSummary[] = [];

        let keepaliveTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
          try {
            controller.enqueue(sseEvent({ type: "keepalive" }));
          } catch {
            if (keepaliveTimer) clearInterval(keepaliveTimer);
            keepaliveTimer = null;
          }
        }, 15000);

        const total = outline.abschnitte.length;
        let idx = 0;
        for (const section of outline.abschnitte) {
          idx++;
          log("INFO", `writing section ${idx}/${total}`, { nummer: section.nummer, titel: section.titel, target: section.geschaetzteWorte });
          controller.enqueue(
            sseEvent({
              type: "phase",
              phase: "writing_section",
              sectionNummer: section.nummer,
              sectionTitel: section.titel,
            })
          );

          const relevantChunks = getRelevantChunks(sources, section);

          // Write section with built-in meta-language retry
          const { section: sectionContent, metaLanguageWarning } = await writeSection({
            section,
            relevantChunks,
            runningSummary,
            leitfadenRules,
            topLevelChapterCount,
            previousSectionSummaries,
          });

          if (metaLanguageWarning) {
            controller.enqueue(
              sseEvent({
                type: "meta_language_warning",
                sectionNummer: section.nummer,
                sectionTitel: section.titel,
              })
            );
          }

          // Word count check — strip [[CITE:...]] tags so we count only prose words,
          // matching what Claude counted when deciding its own word limit.
          const allParaText = sectionContent.blocks
            .filter((b) => b.type === "paragraph")
            .map((b) => b.text.replace(/\[\[CITE:[^\]]*\]\]/g, ""))
            .join(" ");
          const actualWords = countWords(allParaText);
          const target = section.geschaetzteWorte;
          const deviation = target > 0 ? (actualWords - target) / target : 0;

          let finalSection = sectionContent;

          // Auto-extend if too short (>20% below target)
          let extended = false;
          if (deviation < -0.2) {
            const delta = target - actualWords;
            finalSection = await extendSection({
              section: sectionContent,
              delta,
              outlineSection: section,
              relevantChunks,
              runningSummary,
              leitfadenRules,
            });
            extended = true;
          }

          log("INFO", "word count result", {
            nummer: section.nummer,
            actual: actualWords,
            target,
            deviationPct: Math.round(deviation * 100),
            extended,
          });

          // Emit word count warning for significant deviations
          if (Math.abs(deviation) > 0.2) {
            controller.enqueue(
              sseEvent({
                type: "word_count_warning",
                sectionNummer: section.nummer,
                target,
                actual: actualWords,
                deviation: Math.round(deviation * 100),
              })
            );
          }

          abschnitte.push(finalSection);

          // Redundancy check: extract key findings for subsequent sections
          if (process.env.REDUNDANCY_CHECK !== "false") {
            try {
              const summary = await extractSectionSummary(finalSection, section.nummer);
              previousSectionSummaries.push(summary);
              runningSummary = previousSectionSummaries
                .map((s) => `Abschnitt ${s.sectionId}: ${s.keyFindings.join("; ")}`)
                .join("\n");
            } catch {
              // Fallback to blueprint-based summary
              runningSummary += `\nAbschnitt ${section.nummer} „${section.titel}": ${section.blueprint}`;
            }
          } else {
            runningSummary += `\nAbschnitt ${section.nummer} „${section.titel}": ${section.blueprint}`;
          }

          controller.enqueue(sseEvent({ type: "section_done", section: finalSection }));
        }

        if (keepaliveTimer) clearInterval(keepaliveTimer);

        const document: DocumentContent = {
          metadata: {
            titel: outline.forschungsfrage,
            forschungsfrage: outline.forschungsfrage,
            generatedAt: new Date().toISOString(),
          },
          abschnitte,
          literaturverzeichnis: [],
        };

        const totalWords = abschnitte.reduce((sum, s) => sum + (s.wordCount ?? 0), 0);
        log("INFO", "generate-content done", { totalSections: abschnitte.length, totalWords });

        controller.enqueue(sseEvent({ type: "all_sections_done", document, sectionSummaries: previousSectionSummaries }));
        controller.close();
      } catch (error) {
        log("ERROR", "generate-content stream error", { error: String(error) });
        controller.enqueue(sseEvent({ type: "error", error: String(error) }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
