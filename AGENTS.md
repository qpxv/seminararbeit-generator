<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# What has been built

## KI Seminararbeiten-Generator — Full Stack AI Pipeline

A fully automated German academic paper generator. User uploads PDFs and a research question; the app runs a multi-agent Claude pipeline and produces a formatted `.docx` Seminararbeit.

### Stack
- **Next.js 16.2.7** (App Router, Turbopack)
- **Tailwind CSS v4** — all tokens in `@theme {}` in `globals.css`, no `tailwind.config.ts`
- **Anthropic SDK 0.100.1** — model `claude-sonnet-4-6`
- **docx 9.7.1** — server-side DOCX assembly
- **pdf-parse** — server-side PDF text extraction
- **lucide-react** — all icons
- **DM Sans** via `next/font/google` — FOM-style sans-serif

### Pages
| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Form: research question, outline, Leitfaden PDF, source PDFs. Converts files to base64, stores in `sessionStorage`, navigates to `/generator`. |
| `/generator` | `app/generator/page.tsx` | Two-column live dashboard. Left: pipeline status with step indicators and progress bar. Right: outline confirmation accordion → live section preview with fade-in animations. Runs full pipeline on mount. |
| `/output` | `app/output/page.tsx` | Success card, DOCX download button, file structure display, collapsible review protocol. |

### API Routes
| Route | File | Description |
|-------|------|-------------|
| `POST /api/parse-leitfaden` | `app/api/parse-leitfaden/route.ts` | Receives Leitfaden PDF as `FormData`, extracts text with `pdf-parse`, calls Agent 0 (Claude), returns `LeitfadenRules` JSON. |
| `POST /api/parse-source` | `app/api/parse-source/route.ts` | Receives source PDF as `FormData`, extracts text, chunks into ~1000-word segments, returns `ParsedSource` JSON. |
| `POST /api/generate-outline` | `app/api/generate-outline/route.ts` | Calls Agent 1a (Claude) with research question, outline, source list, rules. Returns `ExpandedOutline` with per-section blueprints and word targets. |
| `POST /api/generate-content` | `app/api/generate-content/route.ts` | **SSE streaming.** Writes each section via Agent 1b (streaming Claude call). Sends `phase`, `section_done`, `all_sections_done`, `keepalive` events. Client reads via `fetch` + `body.getReader()`. |
| `POST /api/review-content` | `app/api/review-content/route.ts` | Runs Agent 2 review loop (max 3 iterations). Rewrites failing sections with critique context. Returns `{ finalDocument, reviewLog }`. |
| `POST /api/assemble-docx` | `app/api/assemble-docx/route.ts` | Builds A4 Word document: cover page (FOM logo + env vars), content sections, bibliography, footnotes. Returns `.docx` as `application/octet-stream`. |

### Library Files
| File | Description |
|------|-------------|
| `lib/types.ts` | All shared TypeScript interfaces: `LeitfadenRules`, `ExpandedOutline`, `OutlineSection`, `ContentBlock`, `SectionContent`, `DocumentContent`, `ReviewResult`, `GeneratorPhase`, `SessionInput`, `SessionResult`, `ParsedSource` |
| `lib/data.ts` | All German UI strings — `HEADER`, `FORM_PAGE`, `PIPELINE_STEPS`, `GENERATOR_PAGE`, `OUTPUT_PAGE` |
| `lib/agents.ts` | Claude API calls: `parseLeitfaden`, `generateOutline`, `writeSection` (streaming), `reviewDocument`, `getRelevantChunks` (keyword-scored chunk selection) |
| `lib/docxAssembler.ts` | `buildDocument()`: A4 page, cover page from `process.env`, heading/paragraph/quote/footnote mapping, bibliography with hanging indent |
| `lib/pdfParser.ts` | `extractTextFromPDF(buffer)`, `chunkText(text, chunkSize=1000)` |
| `lib/utils.ts` | `cn(...classes)` helper for conditional class merging |

### Environment Variables (create `.env.local` from `.env.local.example`)
```
ANTHROPIC_API_KEY=sk-ant-...
STUDENT_NAME, STUDENT_MATRIKELNUMMER, STUDENT_STUDIENGANG, STUDENT_SEMESTER
STUDENT_EMAIL, PROFESSOR_NAME, MODUL_NAME, HOCHSCHULE, ABGABEDATUM, STADT
```

### Key Implementation Quirks
- **Tailwind v4 auto-imports Google Fonts** if the font name appears literally in `@theme {}`. Use `system-ui` as the `@theme` fallback; `next/font/google` overrides the CSS variable at runtime.
- **pdf-parse CJS interop**: needs `serverExternalPackages: ["pdf-parse"]` in `next.config.ts` and `@ts-expect-error` on the import.
- **docx v9**: `FootnoteReferenceRun(id: number)` — plain number, not object. `AlignmentType`/`HeadingLevel` are const objects, not TS enums — type with `(typeof AlignmentType)[keyof typeof AlignmentType]`.
- **Buffer → Response**: wrap in `new Blob([Uint8Array.from(buffer)])`.
- **SSE state machine**: generator page splits pipeline into `runPrePipeline()` (auto on mount) and `runWritingPipeline()` (called when user confirms outline).
- **State transfer**: files stored as base64 strings in `sessionStorage`; generator page decodes them back to `Blob` for `FormData` API calls.
