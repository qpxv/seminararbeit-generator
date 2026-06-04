# KI Seminararbeiten-Generator

A fully automated German academic paper generator built for FOM students. Enter a research question, outline, and word count — optionally upload source PDFs — and the app runs a multi-agent Claude pipeline that produces a formatted, ready-to-submit `.docx` Seminararbeit.

## Getting Started

```bash
cp .env.local.example .env.local
# fill in your API key and personal details
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local` from `.env.local.example`:

```
ANTHROPIC_API_KEY=sk-ant-...

# Cover page
STUDENT_NAME=
STUDENT_MATRIKELNUMMER=
STUDENT_STUDIENGANG=
STUDENT_SEMESTER=
PROFESSOR_NAME=
MODUL_NAME=
HOCHSCHULE=
ABGABEDATUM=
STADT=

# Set to false to skip the AI review/rewrite step during testing
REVIEW_STEP=true
```

## User Flow

1. **`/`** — Enter Forschungsfrage, Gliederung, and Ziel-Wortanzahl. Optionally upload source PDFs. Form fields persist to `localStorage`.
2. **`/generator`** — Live pipeline dashboard. Pre-pipeline runs automatically (load Leitfaden rules → parse sources → generate expanded outline). User reviews and confirms the outline, then the writing pipeline starts (SSE-streamed section writing → AI review → redirect).
3. **`/output`** — Download `.docx`. Expand the Review-Protokoll to see which sections were critiqued (yellow) and how they were revised (green).

## Leitfaden Formatting

Formatting rules live in `lib/leitfaden-format.json` — no PDF upload needed. The file currently contains FOM-specific rules (4/2/4/2 cm margins, Times New Roman 12pt, 1.5× line spacing, footnote citations, bibliography titled "Literatur").

To update the rules for a different Leitfaden, use the prompt in `docs/leitfaden-extraction-prompt.md`: paste it into any AI along with your Leitfaden PDF text, save the JSON output as `lib/leitfaden-format.json`, and restart the dev server.

## Stack

- **Next.js 16.2.7** — App Router, Turbopack
- **Tailwind CSS v4** — tokens in `@theme {}` in `globals.css`, no `tailwind.config.ts`
- **Anthropic SDK** — `claude-sonnet-4-6`, streaming via `client.messages.stream()`
- **docx 9.7.1** — server-side DOCX assembly
- **pdf-parse 2.x** — server-side PDF text extraction (class-based API: `new PDFParse({ data: buffer }).getText()`)
- **lucide-react** — all icons
