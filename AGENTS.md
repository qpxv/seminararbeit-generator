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
| `POST /api/generate-content` | `app/api/generate-content/route.ts` | **SSE streaming.** Writes each section via Agent 1b (streaming Claude call). Sends `phase`, `section_done`, `all_sections_done`, `keepalive`, `meta_language_warning`, `word_count_warning` events. `all_sections_done` includes `sectionSummaries: SectionSummary[]` so the review loop can use anti-redundancy data. Client reads via `fetch` + `body.getReader()`. Auto-extends sections >20% below target via `extendSection`. |
| `POST /api/review-content` | `app/api/review-content/route.ts` | Runs Agent 2 review loop (max 3 iterations). Accepts `sectionSummaries: SectionSummary[]` from the POST body. Skipped entirely if `REVIEW_STEP=false`. Captures original section before each rewrite and returns `{ finalDocument, reviewLog, reviewChanges, validationResult, reviewSkipped? }`. |
| `POST /api/assemble-docx` | `app/api/assemble-docx/route.ts` | Builds A4 Word document: cover page (FOM logo + env vars), manual TOC with dot leaders, content sections, bibliography, footnotes, page numbers. Returns `.docx` as `application/octet-stream`. |

### Library Files
| File | Description |
|------|-------------|
| `lib/types.ts` | All shared TypeScript interfaces: `LeitfadenRules` (incl. `bibliographieTitel?`), `ExpandedOutline`, `OutlineSection` (incl. `sectionType`), `ContentBlock`, `SectionContent`, `DocumentContent`, `ReviewResult`, `ReviewChange`, `GeneratorPhase`, `SessionInput` (incl. `zielWortanzahl`), `SessionResult`, `ParsedSource`, `SectionSummary`, `WriteSectionResult`, `ValidationResult`, `CitationRegistry`, `CitationEntry`, `LiteraturEintrag` (incl. `formattedRef?`) |
| `lib/data.ts` | All German UI strings — `HEADER`, `FORM_PAGE`, `PIPELINE_STEPS`, `GENERATOR_PAGE`, `OUTPUT_PAGE` |
| `lib/agents.ts` | Claude API calls: `generateOutline`, `writeSection` (streaming, 3-pass JSON parse, meta-language retry, returns `WriteSectionResult`), `extendSection`, `extractSectionSummary` (max_tokens: 300, preserves exact numbers), `reviewDocument`, `getRelevantChunks` (uses section title + blueprint keywords, returns top 8 chunks). Also exports `CitationManager` class used by `docxAssembler`. |
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
- After all sections: builds `footnotes` record from all occurrences, builds bibliography by sorting `seenSources` alphabetically by extracted family name. `buildBibEntry` strips leading `Vgl.`, trailing page refs, and any existing trailing `.` before appending a single `.` — prevents `S. 713–729..` double-period when the fullRef already ends with `.`.
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
    // Extended sentinel: matches "bold", "italic", footnote fields, or closing }
    // Handles field reordering and text-as-last-field edge cases safely
    const closeMatch = /"(?:,\s*"(?:bold|italic|fussnoteNummer|fussnoteText)"|\s*\})/.exec(json.slice(valueStart));
    if (!closeMatch) { result.push(json.slice(valueStart)); pos = json.length; break; }
    const closeIdx = valueStart + closeMatch.index;
    const escaped = json.slice(valueStart, closeIdx).replace(/(?<!\\)"/g, '\\"');
    result.push(escaped);
    pos = closeIdx;
  }
  return result.join("");
}
```
**Why it's safe**: None of `", "bold"`, `", "italic"`, `", "fussnoteNummer"`, `", "fussnoteText"`, or `"}` can appear inside real academic German prose. The extended sentinel handles field reordering and the case where `"text"` is the last field in a block (no comma before `}`).

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

Fixed: `Math.min(8192, Math.max(3000, Math.ceil(words * 6)))`
- Floor of **3000** covers citation-heavy sections: a 320-word section with 6 Chicago citations needs ~1800 tokens (German prose ≈450 + JSON overhead ≈50 + 6 × fullRef ≈300). The 1500-token floor caused sections 3.1 and 3.2 to truncate mid-JSON in a real 17-PDF run, returning empty content across all 3 write attempts AND all 18 review rewrites.
- `× 6` multiplier accounts for German compound word tokenization AND citation fullRef overhead (each Chicago fullRef with full author list = ~40–60 tokens)
- Same fix applied to `extendSection`: `Math.min(4096, Math.max(1500, Math.ceil(delta * 6)))`
- **Exception — `"kapitelkopf"` sections**: `Math.max(500, Math.ceil(words * 8))` — transitional 1–2 sentences, no citations allowed.

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
- Rule 3b: **PFLICHT-BELEGUNG** — every named study, concrete research finding, or specific number MUST have a `[[CITE:]]` tag; prefer general phrasing over an uncited specific claim
- Rule 4: Output only valid JSON
- Rule 5 (KRITISCH): Never use ASCII `"` in `"text"` fields — use `„German quotes"` only
- Rule 6: Scientific terminology — always use `"Cortisol"` (not `"Kortisol"`), `"Oxytocin"` (not `"Oxytozin"`), etc.
- Citation format: `[[CITE:shortRef:fullRef]]` with Chicago examples — **examples use fictional sources** (prevents the model from copying wrong real-world author data from the example into generated text)
- Citation position: tag goes immediately **before** the closing period, no space: `...Aussage[[CITE:...]].`
- KRITISCH in fullRef: always write ALL author names in full — never `u. a.` or `et al.`
- Full JSON schema

`buildSectionPrompt` word target line enforces a **two-sided strict range**: `"Schreibe zwischen ${min} und ${max} Wörtern. Weder kürzer noch länger."` (90%–115% of target). Previously only the lower bound was enforced, causing 15–600% overproduction.

`buildSectionPrompt` injects a **ZUGEWIESENE QUELLEN** block listing `section.verwendeteQuellen` (the source filenames assigned by the outline agent to this section). This ensures every uploaded PDF gets cited in at least one section rather than concentrating citations on only the highest-scoring chunks.

`buildSectionPrompt` branches by `section.sectionType`:
- `"einleitung"`: injected instruction for concrete Einstieg → Forschungsfrage → Aufbau structure. The chapter count is dynamically computed (`topLevelChapterCount = abschnitte.filter(s => !s.nummer.includes(".")).length`) in `generate-content/route.ts` and threaded through `writeSection` → `buildSectionPrompt` → `buildSectionTypeInstruction` so the Einleitung always states the correct number of chapters (e.g. "vier Kapitel", never a hardcoded "fünf").
- `"fazit"`: injected instruction for Kernbefunde → Limitationen → Ausblick + explicit `WORTLIMIT: maximal N Wörtern`. Two additional guards: **Zahlenkonsistenz** (all statistics in the Fazit must exactly match the values written in the Hauptteil — no rounding or paraphrasing); **Studiendesign-Begriffe** (methodological terms like "Querschnittsdesign" are forbidden unless those exact terms were used to describe the studies in the Hauptteil — prevents the model from applying generic limitation templates to studies actually described as field studies or RCTs).
- `"kapitelkopf"`: injected instruction to write only 1–2 transitional sentences (the subsections carry all content), **explicitly forbidden from inserting any `[[CITE:...]]` tags** (transitional sentences don't need citations, and citations in a tiny section were blowing the JSON budget at old token limits); max_tokens raised to `Math.max(500, ceil(words * 8))` as safety net
- `"hauptteil"`: no additional instruction

---

## Citation System — Accuracy Fixes

### ShortRef Normalization in `CitationManager`

The AI sometimes generates inconsistent shortRef variants for the same source: `"Pendry/Vandagriff 2019"`, `"Pendry & Vandagriff 2019"`, `"Pendry et al. 2019"`. Without normalization, each becomes a separate key in `seenSources` → the bibliography lists the same paper multiple times.

`CitationManager` now internally normalizes shortRefs before Map key lookups:
```typescript
private normalizeShortRef(shortRef: string): string {
  return shortRef
    .replace(/\s*[\/&,]\s*/g, " ")      // unify / & , separators
    .replace(/\s+et\s+al\.?/i, "")       // drop "et al."
    .replace(/\s+u\.\s*a\.?/i, "")       // drop "u. a."
    .toLowerCase().replace(/\s+/g, " ").trim();
}
```

The normalized form is used as the Map key (`seenSources`, `canonicalShortRef`). The original shortRef from the first occurrence is stored in `canonicalShortRef` and used for display in `buildBibliography` and `getAllCitations`. This means the bibliography deduplicated correctly regardless of which variant Claude used.

### Word Count Accuracy — Strip Citation Tags

`countWords()` in `generate-content/route.ts` previously counted the full `[[CITE:shortRef:fullRef]]` tag text, including the long fullRef string (author names, journal titles, year, pages — typically 20–50 words per citation). Claude counts only the prose words. This mismatch caused sections to appear 40–60% over target when they were actually within bounds.

Fix: strip citation tags before counting:
```typescript
const allParaText = sectionContent.blocks
  .filter((b) => b.type === "paragraph")
  .map((b) => b.text.replace(/\[\[CITE:[^\]]*\]\]/g, ""))
  .join(" ");
```

### Trailing Whitespace Before Punctuation in DOCX

`parseCiteTags` (in `lib/docxAssembler.ts`) splits paragraph text on `[[CITE:...]]` boundaries. Two whitespace issues can occur:

**Before the citation tag:** When the AI writes `"Stressintervention [[CITE:...]]."`, the segment before the citation is `"Stressintervention "` (with trailing space). Word renders this as `Stressintervention ¹.` — a visible space between the word and the footnote superscript.

Fix: `trimEnd()` the before-segment:
```typescript
const before = text.slice(lastIndex, match.index).trimEnd();
```

**After the citation tag:** When the AI writes `"...Werte [[CITE:...]] ."` (space after the tag), the `remaining` segment is `" ."` (space then period). This renders as a visible space between the footnote superscript and the following punctuation.

Fix: strip leading spaces from the remaining segment only when they appear immediately before punctuation:
```typescript
const remaining = text.slice(lastIndex).replace(/^ +(?=[.,;:!?])/, "");
```
This is safe — it only removes leading space(s) followed by punctuation, never before a word (new sentence).

---

## Anti-Redundancy System

After each section is written, `generate-content/route.ts` calls `extractSectionSummary(section, sectionId)` (unless `REDUNDANCY_CHECK=false`). This is a non-streaming Claude call (max_tokens: 300) that returns a `SectionSummary` with 3-5 key findings as German bullet points. The prompt explicitly instructs: **preserve all numerical values, percentages, and measurements exactly** (e.g. "19,6 Punkte", "27,01 %") — without this, short summaries paraphrase numbers and the Fazit then regenerates different values. These summaries are accumulated in `previousSectionSummaries` and injected into every subsequent `writeSection` call as an anti-repetition block in the prompt.

The full `previousSectionSummaries` array is also emitted in the `all_sections_done` SSE event and plumbed through `generator/page.tsx` → `review-content` POST body → each `writeSection` rewrite call in the review loop, so rewrites have the same anti-redundancy context as the original generation.

---

## Review System — `reviewDocument` + Rewrite Loop

`reviewDocument` is Agent 2. Its system prompt checks 10 criteria:

1. Blueprint compliance (section covers all topics from the outline blueprint)
2. Argumentation quality (claims backed by citations, logical flow)
3. Chicago citation format (correct `[[CITE:shortRef:fullRef]]` structure)
4. Academic style (German academic register, no colloquialisms)
5. Redundancy (no repetition of content from other sections — checked via compressed `[[CITE:shortRef]]` tags in the full section text)
6. Meta-language (no self-referential descriptions)
7. Word count compliance (within target range)
8. PFLICHT-BELEGUNG — every named study, concrete research finding, or specific number must have a `[[CITE:shortRef]]` tag
9. Zahlenkonsistenz — numbers in the Fazit must exactly match the Hauptteil (checked against full section text)
10. Studiendesign-Begriffe — no generic methodology terms (e.g. "Querschnittsdesign") unless those exact terms appeared in the Hauptteil for these studies

**Conservative flagging instruction (PFLICHT):** Only add to `kritikpunkte` sections with CLEAR, SPECIFIC, CORRECTABLE problems. Sections that are imperfect but functionally sound go in `positivesHervorheben`, not `kritikpunkte`. This prevents rewrites triggered by incomplete information (e.g. "no citations" when citations were in paragraph 2 that the old 300-char preview couldn't see).

**Full section text:** Each section is passed as full paragraph text with `[[CITE:shortRef]]` tags (fullRef stripped to keep payload manageable):
```js
text: s.blocks
  .filter(b => b.type === "paragraph")
  .map(b => b.text.replace(/\[\[CITE:([^:]+):[^\]]*\]\]/g, "[[CITE:$1]]"))
  .join(" ")
```
Previously only a 300-char preview was sent — the reviewer couldn't see citations in paragraph 2+, mis-flagging PFLICHT-BELEGUNG failures that weren't failures.

**Outline not truncated:** The full `expandedOutline` JSON is sent to the reviewer without `.substring(0, 6000)` truncation — with 10+ sections and full blueprints the outline easily exceeded 6000 chars, making blueprint compliance invisible for later sections.

**Critique format in rewrites:** Each rewrite call passes both the problem description AND the improvement suggestion:
```js
critique: problems.map((p, i) =>
  `Problem: ${p}${vorschlaege[i] ? `\nVerbesserung: ${vorschlaege[i]}` : ""}`
).join("\n\n")
```
Previously only `vorschlaege` (suggestions) were passed, dropping the diagnosis — the rewriter knew what to do but not why, leading to over-correction.

**topLevelChapterCount in rewrites:** Calculated from `expandedOutline` and passed to every `writeSection` call in the review loop, so a rewritten Einleitung states the correct chapter count (e.g. "vier Kapitel") rather than defaulting to hardcoded "fünf".

**runningSummary in rewrites:** Built from `sectionSummaries.slice(0, sectionIndex)` using the structured key-findings format — identical to how `generate-content` builds it. Previously built from raw 200-char first-paragraph slices which paraphrased exact numbers, defeating anti-redundancy.

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
