import { writeSection, getRelevantChunks } from "@/lib/agents";
import type {
  ExpandedOutline,
  ParsedSource,
  LeitfadenRules,
  SectionContent,
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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let runningSummary = "";
        const abschnitte: SectionContent[] = [];

        let keepaliveTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
          try {
            controller.enqueue(sseEvent({ type: "keepalive" }));
          } catch {
            if (keepaliveTimer) clearInterval(keepaliveTimer);
            keepaliveTimer = null;
          }
        }, 15000);

        for (const section of outline.abschnitte) {
          controller.enqueue(
            sseEvent({
              type: "phase",
              phase: "writing_section",
              sectionNummer: section.nummer,
              sectionTitel: section.titel,
            })
          );

          const relevantChunks = getRelevantChunks(sources, section);

          const sectionContent = await writeSection({
            section,
            relevantChunks,
            runningSummary,
            leitfadenRules,
          });

          abschnitte.push(sectionContent);
          runningSummary += `\nAbschnitt ${section.nummer} "${section.titel}": ${section.blueprint}`;

          controller.enqueue(sseEvent({ type: "section_done", section: sectionContent }));
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

        controller.enqueue(sseEvent({ type: "all_sections_done", document }));
        controller.close();
      } catch (error) {
        controller.enqueue(
          sseEvent({ type: "error", error: String(error) })
        );
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
