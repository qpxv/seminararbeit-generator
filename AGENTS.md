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
| `/generator` | `app/generator/page.tsx` | `h-screen` two-column dashboard (no page-level scroll). Left: sticky pipeline status with step indicators and progress bar — "Qualitätsprüfung" step shows with strikethrough + muted grey from the first API call onward when `REVIEW_STEP=false`. Right: outline confirmation accordion → live section preview → review diff panel (yellow critique / green revision) after review completes. |
| `/output` | `app/output/page.tsx` | Success card, DOCX download button, file structure display, collapsible Review-Protokoll with per-section yellow/green diff visualization. |

### API Routes
| Route | File | Description |
|-------|------|-------------|
| `GET /api/leitfaden-rules` | `app/api/leitfaden-rules/route.ts` | Reads `lib/leitfaden-format.json`, maps to `LeitfadenRules`, returns JSON. Also returns `reviewStepEnabled: boolean` (derived from `REVIEW_STEP` env) so the generator page can show the strikethrough immediately on load without a second env var. |
| `POST /api/parse-source` | `app/api/parse-source/route.ts` | Receives source PDF as `FormData`, extracts text with pdf-parse v2, chunks into ~1000-word segments, returns `ParsedSource` JSON. |
| `POST /api/generate-outline` | `app/api/generate-outline/route.ts` | Calls Agent 1a (Claude) with Forschungsfrage, Gliederung, `zielWortanzahl`, source filenames, and Leitfaden rules. Returns `ExpandedOutline` with per-section blueprints and word targets summing to `zielWortanzahl`. Post-processes each section through `inferSectionType()` before returning. |
| `POST /api/generate-content` | `app/api/generate-content/route.ts` | **SSE streaming.** Writes each section via Agent 1b (streaming Claude call). Sends `phase`, `section_done`, `all_sections_done`, `keepalive`, `meta_language_warning`, `word_count_warning` events. Client reads via `fetch` + `body.getReader()`. Auto-extends sections >20% below target via `extendSection`. |
| `POST /api/review-content` | `app/api/review-content/route.ts` | Runs Agent 2 review loop (max 3 iterations). Skipped entirely if `REVIEW_STEP=false`. Captures original section before each rewrite and returns `{ finalDocument, reviewLog, reviewChanges, validationResult, reviewSkipped? }`. |
| `POST /api/assemble-docx` | `app/api/assemble-docx/route.ts` | Builds A4 Word document: cover page (FOM logo + env vars), manual TOC with dot leaders, content sections, bibliography, footnotes, page numbers. Returns `.docx` as `application/octet-stream`. |

### Library Files
| File | Description |
|------|-------------|
| `lib/types.ts` | All shared TypeScript interfaces: `LeitfadenRules` (incl. `bibliographieTitel?`), `ExpandedOutline`, `OutlineSection` (incl. `sectionType`), `ContentBlock`, `SectionContent`, `DocumentContent`, `ReviewResult`, `ReviewChange`, `GeneratorPhase`, `SessionInput` (incl. `zielWortanzahl`), `SessionResult`, `ParsedSource`, `SectionSummary`, `WriteSectionResult`, `ValidationResult`, `CitationRegistry`, `CitationEntry`, `LiteraturEintrag` (incl. `formattedRef?`) |
| `lib/data.ts` | All German UI strings — `HEADER`, `FORM_PAGE`, `PIPELINE_STEPS`, `GENERATOR_PAGE`, `OUTPUT_PAGE` |
| `lib/agents.ts` | Claude API calls: `generateOutline`, `writeSection` (streaming, 3-pass JSON parse, meta-language retry, returns `WriteSectionResult`), `extendSection`, `extractSectionSummary`, `reviewDocument`, `getRelevantChunks`. Also exports `CitationManager` class used by `docxAssembler`. |
| `lib/docxAssembler.ts` | `buildDocument()`: A4 page with margins from `LeitfadenRules`, cover page from env vars, manual TOC (TOC1/2/3 styles with dot leaders + estimated page numbers), heading injection from section metadata (AI heading blocks skipped), body with 1.5× line spacing, page numbers in footer (suppressed on cover via `titlePage: true`), bibliography with hanging indent. Internally creates a `CitationManager` and processes all `[[CITE:shortRef:fullRef]]` tags in document order. |
| `lib/leitfaden-format.json` | FOM-specific formatting rules: 4/2/4/2 cm margins, Times New Roman 12pt, 1.5× spacing, footnote citations, bibliography titled "Literatur". Loaded by `/api/leitfaden-rules`. |
| `lib/pdfParser.ts` | `extractTextFromPDF(buffer)` using pdf-parse v2 class API, `chunkText(text, chunkSize=1000)` |
| `lib/utils.ts` | `cn(...classes)` — class merger. `detectMetaLanguage(text)` — 9 regex patterns for self-referential academic prose. `countWords(text)` — word count. `inferSectionType(titel)` — keyword match returning `"einleitung" \| "fazit" \| "hauptteil"`. `sanitizeHeadingTitle(titel)` — strips parenthetical content from section titles (e.g. `"Stress (Definition, Ursachen)"` → `"Stress"`). |
| `lib/logger.ts` | `log(level, message, data?)` — appends timestamped JSON lines to `debug.log` in project root AND mirrors to console. `logRun(label)` — writes a `===` separator to distinguish runs. Never crashes the pipeline on write failure. |
| `lib/validation.ts` | `validateDocument(doc, rules, zielWortanzahl)` — returns `ValidationResult` with `errors` (Einleitung/Fazit missing or <100 words) and `warnings` (sections without citations, meta-language detected, total word count outside ±20% of target). |

### Environment Variables
```
ANTHROPIC_API_KEY=sk-ant-...
STUDENT_NAME, STUDENT_MATRIKELNUMMER, STUDENT_STUDIENGANG, STUDENT_SEMESTER
PROFESSOR_NAME, MODUL_NAME, HOCHSCHULE, ABGABEDATUM, STADT
REVIEW_STEP=true        # set to false to skip the AI review loop during testing
REDUNDANCY_CHECK=true   # set to false to skip extractSectionSummary calls
```

---

## Key Implementation Quirks

### Next.js / Tailwind
- **Tailwind v4 auto-imports Google Fonts** if the font name appears literally in `@theme {}`. Use `system-ui` as the `@theme` fallback; `next/font/google` overrides the CSS variable at runtime.
- **pdf-parse v2 breaking change**: the v1 `pdfParse(buffer)` function export is gone. Use `require("pdf-parse")` inside the function body (not top-level ESM import) and call `new PDFParse({ data: buffer }).getText()`. Needs `serverExternalPackages: ["pdf-parse"]` in `next.config.ts`.

### docx v9 Quirks
- `FootnoteReferenceRun(id: number)` — plain number, not object.
- `AlignmentType` / `HeadingLevel` are const objects, not TS enums.
- `tabStops` cannot be set inside `paragraphStyles[].paragraph` — pass them directly on each `Paragraph` instance.
- `LeaderType` (not `TabStopLeader`) is the correct export name.

### Heading Injection
`blockToParagraphs` is never relied on for section headings. `buildDocument()` always injects the correct `h1/h2/h3` from `section.sectionNummer` + `section.sectionTitel` and skips any leading heading block the AI may have included. This prevents missing or mis-levelled headings regardless of model output.

### SSE State Machine
Generator page splits pipeline into `runPrePipeline()` (auto on mount: load rules → parse sources → generate outline) and `runWritingPipeline()` (called on user outline confirmation: write sections → review → navigate).

### State Transfer
Source files stored as base64 strings in `sessionStorage`; generator page decodes back to `Blob` for `FormData` API calls. `reviewChanges` and `validationResult` stored in `sessionStorage` alongside `generatorResult` for the output page diff view.

### Viewport Layout
Generator page uses `h-screen overflow-hidden` on the outer div and `h-[calc(100vh-10rem)]` on the preview scroll area — the page body never scrolls, only the preview div does.

### Buffer → Response
Wrap in `new Blob([Uint8Array.from(buffer)])`.

---

## Citation System — `[[CITE:shortRef:fullRef]]`

The AI embeds citations inline in paragraph text using a tag format:
```
[[CITE:Allen 2003:Allen, Karen, „Pets in Human Health", in: Journal, 2003, S. 47.]]
```

- **`shortRef`**: `Nachname (et al.) Jahr` — used as the bibliography sort key. May use `et al.` for multi-author sources.
- **`fullRef`**: Full Chicago Notes-Bibliography first-occurrence footnote text. **Must use German angle quotes `„…"` for titles, never ASCII `"`.** ASCII `"` inside a JSON string value breaks `JSON.parse`. **Must list ALL authors in full — never `u. a.` or `et al.` in the fullRef** (only the shortRef may abbreviate). This ensures the bibliography, which derives from fullRef, always shows complete author lists.
- Tags survive unchanged through generate-content → review-content → sessionStorage.
- At DOCX assembly time, `buildDocument()` creates a fresh `CitationManager` instance, scans all blocks in document order, and for each `[[CITE:]]` tag:
  - Calls `citationManager.addCitation(shortRef, fullRef)` → returns a globally sequential footnote `id`
  - Formats the footnote text: first occurrence = fullRef, any repeat of the same shortRef = short note (Nachname, Kurztitel, S. XX.) — **no "Ebd." anywhere** (removed: collapsed different studies under one Ebd. chain, causing attribution errors)
  - Splits the paragraph text around the tag and inserts a `FootnoteReferenceRun(id)` inline
- After all sections: builds `footnotes` record from all occurrences, builds bibliography by sorting `seenSources` alphabetically by extracted family name.
- **Backward compat**: old `footnote_ref` block type is still handled in `blockToParagraphs` for sessions stored in `sessionStorage` before the tag system was introduced.

---

## JSON Parse Pipeline — The Critical Bug Fix

Every section response from Claude is a JSON string containing the `SectionContent` object. The AI consistently generates valid academic German but **always fails raw `JSON.parse`** because Chicago citations embed ASCII `"` inside `text` field values:

```
"text": "Hunde senken den Stress [[CITE:Allen 2003:Allen, Karen, \"Pets\", 2003]]"
```

The `"` around `"Pets"` inside the JSON string value breaks the parser. Three approaches were tried; only the third works:

### Failed Approach 1 — State Machine (`sanitizeJsonStringValues`)
Walked char-by-char, using the heuristic: "a `"` followed by `,`, `}`, `]`, `:`, or whitespace is a closing delimiter." Broke because citation text like `Allen, "Multiple Roles", in:` has a `"` followed by `,` — a content quote misidentified as a JSON structural delimiter, making the JSON *more* broken.

### Failed Approach 2 — Hardcoded String Sentinel
Used `CLOSE_PATTERN = '", "bold"'` with `indexOf()`. The actual JSON output has `",\n      "bold"` (newline + indentation between the closing `"` and `"bold"`), so `indexOf` returned -1 and the function was a no-op.

### Working Approach — `fixTextValues` with Regex Sentinel
```typescript
function fixTextValues(json: string): string {
  const OPEN_RE = /"text"\s*:\s*"/g;          // finds start of each "text" value
  const result: string[] = [];
  let pos = 0;
  while (pos < json.length) {
    OPEN_RE.lastIndex = pos;
    const openMatch = OPEN_RE.exec(json);
    if (!openMatch) { result.push(json.slice(pos)); break; }
    const valueStart = openMatch.index + openMatch[0].length;
    result.push(json.slice(pos, valueStart));
    // Schema sentinel: "bold" always immediately follows the closing " of "text"
    // Use regex so newlines/indentation between them don't matter
    const closeMatch = /",\s*"bold"/.exec(json.slice(valueStart));
    if (!closeMatch) { result.push(json.slice(valueStart)); pos = json.length; break; }
    const closeIdx = valueStart + closeMatch.index;
    const escaped = json.slice(valueStart, closeIdx).replace(/(?<!\\)"/g, '\\"');
    result.push(escaped);
    pos = closeIdx;
  }
  return result.join("");
}
```
**Why it's safe**: The sentinel `", "bold"` (or with whitespace) cannot appear in real academic German prose, and in the JSON schema `"bold"` always immediately follows the closing `"` of the `"text"` field. The regex `/",\s*"bold"/` handles all formatting variants.

**Why German quotes are safe**: `„` (U+201E) and `"` (U+201C) are different Unicode code points from ASCII `"` (U+0022). JSON only treats U+0022 as a string delimiter, so German quotes inside JSON strings are invisible to the parser. The system prompt instructs Claude to use German quotes exclusively for all in-text quotations.

### 3-Pass Parse Strategy
```
Pass 1: JSON.parse(stripped)                    → works if AI used only German quotes
Pass 2: JSON.parse(fixTextValues(stripped))     → rescues citations with ASCII "
Pass 3: boundary extract { ... } then parse    → rescues outputs with leading preamble text
Fallback: return empty section (wordCount: 0)  → logged as ERROR in debug.log
```
In practice, Pass 1 fails on almost every section (citations always have some ASCII `"`), Pass 2 succeeds on all of them.

---

## max_tokens Bug Fix

Original: `Math.ceil(words * 2.2)` — for a 30-word section this gives **66 tokens**, which is not even enough for the JSON wrapper, let alone content. The model would truncate mid-JSON, always producing a parse failure.

Fixed: `Math.min(8192, Math.max(1500, Math.ceil(words * 4)))`
- Floor of **1500** ensures even tiny sections get enough tokens for structure + content
- `× 4` multiplier accounts for German word tokenization overhead (German compound words tokenize to more tokens than words) and Chicago citation fullRef strings
- Same fix applied to `extendSection`: `Math.min(4096, Math.max(1000, Math.ceil(delta * 4)))`
- **Exception — `"kapitelkopf"` sections**: `Math.max(300, Math.ceil(words * 6))` — physically caps the output so Claude cannot write long paragraphs even if it ignores the prompt instruction

---

## `writeSection` — Full Flow

`writeSection` is the core content generation function. It:

1. Calls `writeSectionAttempt` (streaming Claude call → 3-pass JSON parse)
2. Runs `detectMetaLanguage` on the joined paragraph text
3. If meta-language detected: retries up to 2 more times with an escalated retry note prepended to the user prompt: `"FEHLER: Der vorherige Versuch enthielt eine unzulässige Meta-Beschreibung..."`
4. Returns `{ section: SectionContent, metaLanguageWarning: boolean }`

`SECTION_SYSTEM_PROMPT` enforces:
- Rule 1: Academic German
- Rule 2: **VERBOTEN** — no meta-language (explicit list of banned openers)
- Rule 3: Cite only from provided source chunks, never from memory
- Rule 4: Output only valid JSON
- Rule 5 (KRITISCH): Never use ASCII `"` in `"text"` fields — use `„German quotes"` only
- Rule 6 (KRITISCH): In `fullRef`, always write ALL author names in full — never `u. a.` or `et al.`
- Citation format: `[[CITE:shortRef:fullRef]]` with Chicago examples
- Full JSON schema

`buildSectionPrompt` word target line enforces a **two-sided strict range**: `"Schreibe zwischen ${min} und ${max} Wörtern. Weder kürzer noch länger."` (90%–115% of target). Previously only the lower bound was enforced, causing 15–600% overproduction.

`buildSectionPrompt` branches by `section.sectionType`:
- `"einleitung"`: injected instruction for concrete Einstieg → Forschungsfrage → Aufbau structure
- `"fazit"`: injected instruction for Kernbefunde → Limitationen → Ausblick + explicit `WORTLIMIT: maximal N Wörtern` to prevent the three-part structure from inflating past the target
- `"kapitelkopf"`: injected instruction to write only 1–2 transitional sentences (the subsections carry all content); max_tokens capped at `Math.max(300, ceil(words * 6))` instead of the normal 1500 floor
- `"hauptteil"`: no additional instruction

---

## Anti-Redundancy System

After each section is written, `generate-content/route.ts` calls `extractSectionSummary(section, sectionId)` (unless `REDUNDANCY_CHECK=false`). This is a non-streaming Claude call (max_tokens: 150) that returns a `SectionSummary` with 3-5 key findings as German bullet points. These are accumulated in `previousSectionSummaries` and injected into every subsequent `writeSection` call as an anti-repetition block in the prompt.

---

## Section Extension

If a written section is >20% below its word target, `generate-content/route.ts` immediately calls `extendSection(section, delta, outlineSection, relevantChunks, runningSummary, leitfadenRules)`. This is a non-streaming Claude call asking Claude to add `delta` words of substantive content and return the extended `SectionContent` JSON. The returned blocks are merged into the section before it is emitted as `section_done`.

---

## `sectionType` Inference + Heading Sanitization

`generate-outline/route.ts` runs three post-processing passes after `generateOutline` returns:

**Pass 1 — Title sanitization** via `sanitizeHeadingTitle(titel)` from `lib/utils.ts`: strips parenthetical content (e.g. `"Stress (Definition, Ursachen, Relevanz)"` → `"Stress"`). Claude frequently adds parenthetical context in headings; strict FOM style forbids parentheses in section titles.

**Pass 2 — sectionType keyword match** via `inferSectionType(titel)`:
- `"einleitung"` / `"einführung"` → `"einleitung"`
- `"fazit"` / `"schluss"` / `"zusammenfassung"` / `"schlussbetrachtung"` / `"schlussfolgerung"` / `"ausblick und"` → `"fazit"`
- anything else → `"hauptteil"`

**Pass 3 — Kapitelkopf detection**: among sections typed `"hauptteil"`, any section where `ebene === 1 && geschaetzteWorte <= 60 && nextSection.nummer.startsWith(s.nummer + ".")` is reclassified as `"kapitelkopf"`. These are chapter-heading sections whose real content lives entirely in their subsections. Without this detection, Claude wrote 170–220 words for 30-word targets (463–627% over). With it, they get a tight token budget and a prompt to write 1–2 sentences only.

All four types are in the `OutlineSection.sectionType` union: `"einleitung" | "fazit" | "hauptteil" | "kapitelkopf"`.

---

## Validation — `lib/validation.ts`

`validateDocument(doc, rules, zielWortanzahl)` runs at the end of `review-content` (result included in response JSON as `validationResult`). Checks:

1. **Error** — Einleitung present (by title keyword) and ≥100 words
2. **Error** — Fazit present (by title keyword) and ≥100 words
3. **Warning** — each section has at least one `[[CITE:` tag or `footnote_ref` block
4. **Warning** — each section passes `detectMetaLanguage` check
5. **Warning** — total word count within [0.8×zielWortanzahl, 1.2×zielWortanzahl]

Returns `{ passed: boolean, errors: string[], warnings: string[] }`.

---

## Debug Logging — `lib/logger.ts`

Every server-side event writes to `debug.log` in the project root (appended, never truncated). Each API route calls `logRun("route-name")` at the start, writing a `===` separator so individual runs are distinguishable in the file.

```
tail -f debug.log     # live tail during a run
cat debug.log         # full history
```

Logged events:
- `generate-outline`: start (forschungsfrage, zielWortanzahl), done (full section list with types and word targets)
- `generate-content`: start, per-section write (nummer, titel, target), word count result (actual, target, deviation%, extended), done (totalSections, totalWords)
- `writeSectionAttempt`: stream done (chars, preview), Pass 1/2/3 OK or failed, ERROR with full raw output if all fail
- `writeSection`: each attempt number, done (wordCount, metaLanguageWarning)
- `extendSection`: start (delta), done (finalWordCount), failure
- `extractSectionSummary`: implicit via writeSection logging
- `generateOutline`, `reviewDocument`: start and done per iteration
- `review-content`: start (REVIEW_STEP env, sectionCount), per-rewrite (sectionNummer, problem preview), done (iterations, rewrites, validationErrors, validationWarnings)
- `assemble-docx`: start (sectionCount, totalWordCount), logo warning if missing, done (bufferBytes), error

`log()` never crashes the pipeline — write failures are silently swallowed.

---

## `detectMetaLanguage` — 9 Patterns

Patterns that clearly identify a section describing itself rather than delivering content:
```
/dieser abschnitt (legt|beschreibt|erläutert|stellt|bespricht|untersucht|zeigt|fasst|analysiert|behandelt|widmet|bietet|gibt|thematisiert)/i
/dieses kapitel (legt|beschreibt|erläutert|stellt|zeigt|bespricht|untersucht|analysiert|behandelt|widmet|bietet)/i
/im folgenden (wird|werden|soll)/i
/das fazit fasst/i
/nachfolgend (wird|werden|soll)/i
/in diesem abschnitt (wird|werden|soll|erfolgt)/i
/der vorliegende abschnitt/i
/ziel dieses abschnitts? ist es/i
/wird in diesem (abschnitt|kapitel|teil)/i
```

Previously there were 13 patterns including several that false-positived on legitimate academic German (e.g. `/er stellt sicher,?\s*dass/i` matched normal prose like "Er stellt sicher, dass die Methode valide ist"). The 4 overly-broad patterns were removed.
