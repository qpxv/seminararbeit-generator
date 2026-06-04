import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  PageBreak,
  FootnoteReferenceRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import type { DocumentContent, LiteraturEintrag, LeitfadenRules, ContentBlock } from "./types";

const CM_TO_DXA = 567;

function cmToDxa(cm: number): number {
  return Math.round(cm * CM_TO_DXA);
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
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
    coverParagraph(env("STUDENT_SEMESTER", "Semester"), { size: 22, spacingAfter: 120 }),
    coverParagraph(env("STUDENT_EMAIL", ""), { size: 20, spacingAfter: 600 }),
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

function blockToParagraphs(
  block: ContentBlock,
  footnoteMap: Map<number, string>,
  fontFamily: string,
  fontSize: number
): Paragraph[] {
  if (block.type === "page_break") {
    return [new Paragraph({ children: [new PageBreak()] })];
  }

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

function formatBibliography(eintrag: LiteraturEintrag): string {
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

  const footnoteMap = new Map<number, string>();
  const contentParagraphs: Paragraph[] = [];

  for (const section of content.abschnitte) {
    for (const block of section.blocks) {
      contentParagraphs.push(
        ...blockToParagraphs(block, footnoteMap, fontFamily, fontSize)
      );
    }
  }

  contentParagraphs.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      children: [new TextRun({ text: "Literaturverzeichnis", bold: true })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 400 },
    })
  );

  for (const eintrag of content.literaturverzeichnis) {
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

  const footnotes: Record<number, { children: Paragraph[] }> = {};
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

  return new Document({
    footnotes,
    styles: {
      default: {
        document: {
          run: {
            font: fontFamily,
            size: fontSize,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: margins,
          },
        },
        children: [...coverParagraphs, ...contentParagraphs],
      },
    ],
  });
}
