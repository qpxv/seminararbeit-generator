import {
  Document,
  Footer,
  Paragraph,
  TextRun,
  ImageRun,
  PageBreak,
  FootnoteReferenceRun,
  HeadingLevel,
  AlignmentType,
  PageNumber,
  LeaderType,
  TabStopType,
} from "docx";
import type { DocumentContent, LiteraturEintrag, LeitfadenRules, ContentBlock } from "./types";
import { CitationManager } from "./agents";

const CM_TO_DXA = 567;

function cmToDxa(cm: number): number {
  return Math.round(cm * CM_TO_DXA);
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// Parse [[CITE:shortRef:fullRef]] tags out of a text string.
// Returns segments: either plain text or a citation reference.
function parseCiteTags(
  text: string
): Array<{ text: string; cite?: { shortRef: string; fullRef: string } }> {
  const parts: Array<{ text: string; cite?: { shortRef: string; fullRef: string } }> = [];
  const regex = /\[\[CITE:([^:]+):([^\]]*)\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) parts.push({ text: before });
    parts.push({
      text: "",
      cite: { shortRef: match[1].trim(), fullRef: match[2].trim() },
    });
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining) parts.push({ text: remaining });

  return parts;
}

function coverParagraph(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    spacingAfter?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {}
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts.bold ?? false,
        size: opts.size ?? 24,
      }),
    ],
    alignment: opts.align ?? AlignmentType.CENTER,
    spacing: { after: opts.spacingAfter ?? 320 },
  });
}

function buildCoverPageParagraphs(logoBuffer: Buffer | null): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (logoBuffer) {
    paragraphs.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 280, height: 84 },
            type: "png",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 1400 },
      })
    );
  }

  paragraphs.push(
    coverParagraph(env("HOCHSCHULE", "FOM Hochschule für Oekonomie & Management"), {
      bold: true,
      size: 28,
      spacingAfter: 240,
    }),
    coverParagraph(env("MODUL_NAME", "Modul"), { size: 24, spacingAfter: 1200 }),
    coverParagraph("Seminararbeit", { bold: true, size: 36, spacingAfter: 900 }),
    coverParagraph("vorgelegt von", { size: 22, spacingAfter: 240 }),
    coverParagraph(env("STUDENT_NAME", "Vorname Nachname"), { bold: true, size: 28, spacingAfter: 200 }),
    coverParagraph(
      `Matrikelnummer: ${env("STUDENT_MATRIKELNUMMER", "000000")}`,
      { size: 22, spacingAfter: 120 }
    ),
    coverParagraph(env("STUDENT_STUDIENGANG", "Studiengang"), { size: 22, spacingAfter: 120 }),
    coverParagraph(env("STUDENT_SEMESTER", "Semester"), { size: 22, spacingAfter: 600 }),
    coverParagraph(`Betreuer: ${env("PROFESSOR_NAME", "Prof. Dr. Muster")}`, {
      size: 22,
      spacingAfter: 200,
    }),
    coverParagraph(
      `${env("STADT", "Köln")}, ${env("ABGABEDATUM", new Date().toLocaleDateString("de-DE"))}`,
      { size: 22, spacingAfter: 0 }
    )
  );

  paragraphs.push(new Paragraph({ children: [new PageBreak()] }));

  return paragraphs;
}

// Convert a content block to DOCX Paragraph(s).
// citationManager handles new [[CITE:...]] tags.
// footnoteMap handles legacy footnote_ref blocks for backward compatibility.
function blockToParagraphs(
  block: ContentBlock,
  citationManager: CitationManager,
  sectionId: string,
  footnoteMap: Map<number, string>,
  fontFamily: string,
  fontSize: number
): Paragraph[] {
  if (block.type === "page_break") {
    return [new Paragraph({ children: [new PageBreak()] })];
  }

  // Legacy footnote_ref block (backward compat with old sessions)
  if (block.type === "footnote_ref") {
    if (block.fussnoteNummer !== undefined && block.fussnoteText) {
      footnoteMap.set(block.fussnoteNummer, block.fussnoteText);
    }
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: block.text,
            font: fontFamily,
            size: fontSize,
            bold: block.bold,
            italics: block.italic,
          }),
          ...(block.fussnoteNummer !== undefined
            ? [new FootnoteReferenceRun(block.fussnoteNummer)]
            : []),
        ],
        spacing: { line: 360, lineRule: "auto", after: 280 },
      }),
    ];
  }

  const headingMap: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
  };

  if (block.type in headingMap) {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: block.text,
            bold: block.bold,
            italics: block.italic,
          }),
        ],
        heading: headingMap[block.type],
        spacing: { before: 480, after: 160 },
      }),
    ];
  }

  // paragraph and quote blocks — parse [[CITE:...]] tags inline
  const segments = parseCiteTags(block.text);
  const hasCitations = segments.some((s) => s.cite);

  if (!hasCitations) {
    // No citations: render as before
    if (block.type === "quote") {
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: block.text,
              italics: true,
              font: fontFamily,
              size: fontSize,
            }),
          ],
          indent: { left: 720 },
          spacing: { line: 360, lineRule: "auto", before: 280, after: 280 },
        }),
      ];
    }
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: block.text,
            bold: block.bold,
            italics: block.italic,
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { line: 360, lineRule: "auto", after: 280 },
      }),
    ];
  }

  // Build children array with inline FootnoteReferenceRun
  const children: (TextRun | FootnoteReferenceRun)[] = [];
  for (const seg of segments) {
    if (seg.cite) {
      const id = citationManager.addCitation(seg.cite.shortRef, seg.cite.fullRef);
      children.push(new FootnoteReferenceRun(id));
    } else if (seg.text) {
      children.push(
        new TextRun({
          text: seg.text,
          bold: block.type === "quote" ? undefined : block.bold,
          italics: block.type === "quote" ? true : block.italic,
          font: fontFamily,
          size: fontSize,
        })
      );
    }
  }

  const paraOpts =
    block.type === "quote"
      ? {
          indent: { left: 720 },
          spacing: { line: 360, lineRule: "auto" as const, before: 280, after: 280 },
        }
      : {
          spacing: { line: 360, lineRule: "auto" as const, after: 280 },
        };

  return [new Paragraph({ children, ...paraOpts })];
}

function buildManualToc(
  content: DocumentContent,
  bibTitel: string,
  fontFamily: string,
  fontSize: number
): Paragraph[] {
  const WORDS_PER_PAGE = 380;
  const DOT_TAB = [{ position: 8500, type: TabStopType.RIGHT, leader: LeaderType.DOT }];
  const tocTabs = (numPos: number) => [
    { position: numPos, type: TabStopType.LEFT },
    ...DOT_TAB,
  ];

  const paras: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "Inhaltsverzeichnis", bold: true })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 480 },
    }),
  ];

  let page = 3;

  for (const section of content.abschnitte) {
    const dots = (section.sectionNummer.match(/\./g) ?? []).length;
    const tocStyle = dots === 0 ? "TOC1" : dots === 1 ? "TOC2" : "TOC3";
    const titleTab = dots === 0 ? 720 : dots === 1 ? 900 : 1080;

    paras.push(
      new Paragraph({
        style: tocStyle,
        tabStops: tocTabs(titleTab),
        children: [
          new TextRun({ text: section.sectionNummer, font: fontFamily, size: fontSize }),
          new TextRun({ text: "\t" + section.sectionTitel, font: fontFamily, size: fontSize }),
          new TextRun({ text: "\t" + page, font: fontFamily, size: fontSize }),
        ],
      })
    );

    page += Math.max(1, Math.round((section.wordCount || 300) / WORDS_PER_PAGE));
  }

  paras.push(
    new Paragraph({
      style: "TOC1",
      tabStops: DOT_TAB,
      children: [
        new TextRun({ text: bibTitel, font: fontFamily, size: fontSize }),
        new TextRun({ text: "\t" + page, font: fontFamily, size: fontSize }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  return paras;
}

function buildPageFooter(fontFamily: string, fontSize: number): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [new TextRun({ children: [PageNumber.CURRENT], font: fontFamily, size: fontSize })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

function formatBibliography(eintrag: LiteraturEintrag): string {
  // Use pre-formatted Chicago entry if available
  if (eintrag.formattedRef) return eintrag.formattedRef;
  // Fallback for legacy entries
  const parts = [eintrag.autor, `(${eintrag.jahr})`, eintrag.titel];
  if (eintrag.zeitschrift) parts.push(eintrag.zeitschrift);
  if (eintrag.verlag) parts.push(eintrag.verlag);
  if (eintrag.seiten) parts.push(`S. ${eintrag.seiten}`);
  if (eintrag.url) parts.push(`Verfügbar unter: ${eintrag.url}`);
  if (eintrag.zugegriffen) parts.push(`[Zugegriffen: ${eintrag.zugegriffen}]`);
  return parts.filter(Boolean).join(". ");
}

export function buildDocument(
  content: DocumentContent,
  rules: LeitfadenRules,
  logoBuffer: Buffer | null
): Document {
  const fontSize = (rules.schriftgroesse ?? 12) * 2;
  const fontFamily = rules.schriftart ?? "Times New Roman";

  const margins = {
    top: cmToDxa(rules.seitenraender?.oben ?? 2),
    bottom: cmToDxa(rules.seitenraender?.unten ?? 2),
    left: cmToDxa(rules.seitenraender?.links ?? 2.5),
    right: cmToDxa(rules.seitenraender?.rechts ?? 2),
  };

  // Citation manager processes [[CITE:...]] tags in document order
  const citationManager = new CitationManager();
  // Legacy footnote map for old footnote_ref blocks
  const footnoteMap = new Map<number, string>();
  const contentParagraphs: Paragraph[] = [];

  const HEADING_TYPES = new Set(["h1", "h2", "h3"]);

  for (const section of content.abschnitte) {
    const dots = (section.sectionNummer.match(/\./g) ?? []).length;
    const headingType = (["h1", "h2", "h3"][Math.min(dots, 2)]) as ContentBlock["type"];

    // Always inject heading from section metadata — never trust AI to include it
    contentParagraphs.push(
      ...blockToParagraphs(
        { type: headingType, text: `${section.sectionNummer}  ${section.sectionTitel}` },
        citationManager,
        section.sectionNummer,
        footnoteMap,
        fontFamily,
        fontSize
      )
    );

    // Skip any leading heading block the AI may have included
    const blocks = HEADING_TYPES.has(section.blocks[0]?.type ?? "")
      ? section.blocks.slice(1)
      : section.blocks;

    for (const block of blocks) {
      contentParagraphs.push(
        ...blockToParagraphs(block, citationManager, section.sectionNummer, footnoteMap, fontFamily, fontSize)
      );
    }
  }

  // Bibliography: prefer CitationManager output (new sessions), fall back to stored literaturverzeichnis
  const bibliography =
    citationManager.getAllCitations().length > 0
      ? citationManager.buildBibliography()
      : content.literaturverzeichnis;

  const bibTitel = rules.bibliographieTitel ?? "Literaturverzeichnis";

  contentParagraphs.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      children: [new TextRun({ text: bibTitel, bold: true })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 400 },
    })
  );

  for (const eintrag of bibliography) {
    contentParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: formatBibliography(eintrag),
            font: fontFamily,
            size: fontSize,
          }),
        ],
        spacing: { after: 120 },
        indent: { left: 720, hanging: 720 },
      })
    );
  }

  // Build footnotes record from CitationManager occurrences + legacy footnoteMap
  const footnotes: Record<number, { children: Paragraph[] }> = {};

  for (const occ of citationManager.getAllOccurrences()) {
    footnotes[occ.id] = {
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: occ.footnoteText,
              font: fontFamily,
              size: Math.max(fontSize - 4, 16),
            }),
          ],
        }),
      ],
    };
  }

  // Merge legacy footnotes (no-op if there are none)
  for (const [id, text] of footnoteMap) {
    footnotes[id] = {
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text,
              font: fontFamily,
              size: Math.max(fontSize - 4, 16),
            }),
          ],
        }),
      ],
    };
  }

  const coverParagraphs = buildCoverPageParagraphs(logoBuffer);
  const tocParagraphs = buildManualToc(content, bibTitel, fontFamily, fontSize);

  return new Document({
    footnotes,
    features: { updateFields: true },
    styles: {
      default: {
        document: {
          run: { font: fontFamily, size: fontSize },
        },
        heading1: {
          run: { color: "121212", bold: true, size: fontSize + 4 },
          paragraph: { spacing: { before: 480, after: 160 } },
        },
        heading2: {
          run: { color: "121212", bold: true, size: fontSize + 2 },
          paragraph: { spacing: { before: 400, after: 120 } },
        },
        heading3: {
          run: { color: "121212", bold: false, size: fontSize },
          paragraph: { spacing: { before: 320, after: 100 } },
        },
      },
      paragraphStyles: [
        {
          id: "TOC1",
          name: "TOC 1",
          run: { font: fontFamily, size: fontSize, bold: true },
          paragraph: { spacing: { before: 120, after: 120 } },
        },
        {
          id: "TOC2",
          name: "TOC 2",
          run: { font: fontFamily, size: fontSize },
          paragraph: { indent: { left: 360 }, spacing: { after: 80 } },
        },
        {
          id: "TOC3",
          name: "TOC 3",
          run: { font: fontFamily, size: fontSize },
          paragraph: { indent: { left: 720 }, spacing: { after: 80 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: margins,
          },
          titlePage: true,
        },
        footers: {
          default: buildPageFooter(fontFamily, fontSize),
          first: new Footer({ children: [new Paragraph({ children: [] })] }),
        },
        children: [
          ...coverParagraphs,
          ...tocParagraphs,
          ...contentParagraphs,
        ],
      },
    ],
  });
}
