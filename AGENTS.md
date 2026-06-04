@AGENTS.md

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

# What has been built

## KI Seminararbeiten-Generator — Full Stack AI Pipeline

A fully automated German academic paper generator. User enters a research question, outline, and word count target; optionally uploads source PDFs; the app runs a multi-agent Claude pipeline and produces a formatted `.docx` Seminararbeit.

### Stack
- **Next.js 16.2.7** (App Router, Turbopack)
- **Tailwind CSS v4** — all tokens in `@theme {}` in `globals.css`, no `tailwind.config.ts`
- **Anthropic SDK 0.100.1** — model `claude-sonnet-4-6`
- **docx 9.7.1** — server-side DOCX assembly
- **pdf-parse 2.x** — server-side PDF text extraction (class-based API, not the v1 function)
- **lucide-react** — all icons

### Pages
| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Form: Forschungsfrage, Gliederung, Ziel-Wortanzahl (number input), source PDFs (optional locally, required in production). Text fields persist to `localStorage`. Converts files to base64, stores everything in `sessionStorage`, navigates to `/generator`. |
| `/generator` | `app/generator/page.tsx` | `h-screen` two-column dashboard (no page-level scroll). Left: sticky pipeline status with step indicators and progress bar. Right: outline confirmation accordion → live section preview → review diff panel (yellow critique / green revision) after review completes. |
| `/output` | `app/output/page.tsx` | Success card, DOCX download button, file structure display, collapsible Review-Protokoll with per-section yellow/green diff visualization. |

### API Routes
| Route | File | Description |
|-------|------|-------------|
| `GET /api/leitfaden-rules` | `app/api/leitfaden-rules/route.ts` | Reads `lib/leitfaden-format.json`, maps to `LeitfadenRules`, returns JSON. Replaces the old PDF-upload-based parse flow. |
| `POST /api/parse-source` | `app/api/parse-source/route.ts` | Receives source PDF as `FormData`, extracts text with pdf-parse v2, chunks into ~1000-word segments, returns `ParsedSource` JSON. |
| `POST /api/generate-outline` | `app/api/generate-outline/route.ts` | Calls Agent 1a (Claude) with Forschungsfrage, Gliederung, `zielWortanzahl`, source filenames, and Leitfaden rules. Returns `ExpandedOutline` with per-section blueprints and word targets summing to `zielWortanzahl`. |
| `POST /api/generate-content` | `app/api/generate-content/route.ts` | **SSE streaming.** Writes each section via Agent 1b (streaming Claude call). Sends `phase`, `section_done`, `all_sections_done`, `keepalive` events. Client reads via `fetch` + `body.getReader()`. |
| `POST /api/review-content` | `app/api/review-content/route.ts` | Runs Agent 2 review loop (max 3 iterations). Skipped entirely if `REVIEW_STEP=false`. Captures original section before each rewrite and returns `{ finalDocument, reviewLog, reviewChanges }`. |
| `POST /api/assemble-docx` | `app/api/assemble-docx/route.ts` | Builds A4 Word document: cover page (FOM logo + env vars), manual TOC with dot leaders, content sections, bibliography, footnotes, page numbers. Returns `.docx` as `application/octet-stream`. |

### Library Files
| File | Description |
|------|-------------|
| `lib/types.ts` | All shared TypeScript interfaces: `LeitfadenRules` (incl. `bibliographieTitel?`), `ExpandedOutline`, `OutlineSection`, `ContentBlock`, `SectionContent`, `DocumentContent`, `ReviewResult`, `ReviewChange`, `GeneratorPhase`, `SessionInput` (incl. `zielWortanzahl`), `SessionResult`, `ParsedSource` |
| `lib/data.ts` | All German UI strings — `HEADER`, `FORM_PAGE`, `PIPELINE_STEPS`, `GENERATOR_PAGE`, `OUTPUT_PAGE` |
| `lib/agents.ts` | Claude API calls: `generateOutline` (takes `zielWortanzahl`), `writeSection` (streaming, with two-pass JSON fallback), `reviewDocument`, `getRelevantChunks` (keyword-scored chunk selection). `parseLeitfaden` kept but not used in main flow. |
| `lib/docxAssembler.ts` | `buildDocument()`: A4 page with margins from `LeitfadenRules`, cover page from env vars, manual TOC (TOC1/2/3 styles with dot leaders + estimated page numbers), heading injection from section metadata (AI heading blocks skipped), body with 1.5× line spacing, page numbers in footer (suppressed on cover via `titlePage: true`), bibliography with hanging indent |
| `lib/leitfaden-format.json` | FOM-specific formatting rules: 4/2/4/2 cm margins, Times New Roman 12pt, 1.5× spacing, footnote citations, bibliography titled "Literatur". Loaded by `/api/leitfaden-rules`. |
| `lib/pdfParser.ts` | `extractTextFromPDF(buffer)` using pdf-parse v2 class API, `chunkText(text, chunkSize=1000)` |
| `lib/utils.ts` | `cn(...classes)` helper for conditional class merging |

### Environment Variables
```
ANTHROPIC_API_KEY=sk-ant-...
STUDENT_NAME, STUDENT_MATRIKELNUMMER, STUDENT_STUDIENGANG, STUDENT_SEMESTER
PROFESSOR_NAME, MODUL_NAME, HOCHSCHULE, ABGABEDATUM, STADT
REVIEW_STEP=true   # set to false to skip the AI review loop during testing
```

### Key Implementation Quirks
- **Tailwind v4 auto-imports Google Fonts** if the font name appears literally in `@theme {}`. Use `system-ui` as the `@theme` fallback; `next/font/google` overrides the CSS variable at runtime.
- **pdf-parse v2 breaking change**: the v1 `pdfParse(buffer)` function export is gone. Use `require("pdf-parse")` inside the function body (not top-level ESM import) and call `new PDFParse({ data: buffer }).getText()`. Needs `serverExternalPackages: ["pdf-parse"]` in `next.config.ts`.
- **docx v9**: `FootnoteReferenceRun(id: number)` — plain number, not object. `AlignmentType`/`HeadingLevel` are const objects, not TS enums. `tabStops` cannot be set inside `paragraphStyles[].paragraph` — pass them directly on each `Paragraph` instance. `LeaderType` (not `TabStopLeader`) is the correct export name.
- **Heading injection**: `blockToParagraphs` is never relied on for section headings. `buildDocument()` always injects the correct `h1/h2/h3` from `section.sectionNummer` + `section.sectionTitel` and skips any leading heading block the AI may have included. This prevents missing or mis-levelled headings regardless of model output.
- **Buffer → Response**: wrap in `new Blob([Uint8Array.from(buffer)])`.
- **SSE state machine**: generator page splits pipeline into `runPrePipeline()` (auto on mount: load rules → parse sources → generate outline) and `runWritingPipeline()` (called on user outline confirmation: write sections → review → navigate).
- **State transfer**: source files stored as base64 strings in `sessionStorage`; generator page decodes back to `Blob` for `FormData` API calls. `reviewChanges` stored in `sessionStorage` alongside `generatorResult` for the output page diff view.
- **Viewport layout**: generator page uses `h-screen overflow-hidden` on the outer div and `h-[calc(100vh-10rem)]` on the preview scroll area — the page body never scrolls, only the preview div does.
