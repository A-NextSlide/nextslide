# NextSlide — Deep Technical Guide

> **Audience:** Technical leadership (CTO-level)
> **Last updated:** February 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Slide Generation Pipeline](#3-slide-generation-pipeline)
4. [Design Intelligence System](#4-design-intelligence-system)
5. [The Editor](#5-the-editor)
6. [AI Editing Agent](#6-ai-editing-agent)
7. [Real-Time Collaboration](#7-real-time-collaboration)
8. [Backend API & Services](#8-backend-api--services)
9. [Database Schema & Storage](#9-database-schema--storage)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [Billing & Credits](#11-billing--credits)
12. [Sharing, Analytics & Embedding](#12-sharing-analytics--embedding)
13. [Integrations & Developer API](#13-integrations--developer-api)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Deployment & Infrastructure](#15-deployment--infrastructure)

---

## 1. Architecture Overview

NextSlide is an AI-powered presentation platform that generates fully custom HTML/CSS/JS slides — not templates with swapped text, but unique, per-slide web components rendered in sandboxed iframes. Each slide is a self-contained mini web page with its own markup, styles, scripts, animations, and interactivity.

### High-Level Data Flow

```
User prompt
  → Outline generation (Perplexity Sonar Pro — web research + structure planning)
  → Theme generation (Brandfetch brand detection + AI color/font pairing)
  → Parallel slide composition (Gemini 3.1 Pro — up to 20 slides concurrently)
  → Image pipeline (AI generation via Gemini Imagen + web search via SerpAPI)
  → Rendered in editor as sandboxed iframes
  → User edits via visual editor or AI chat agent (Claude Sonnet 4.5 / Gemini)
  → Real-time sync via Yjs CRDTs over WebSocket
```

### Tech Stack at a Glance

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, Zustand, Yjs |
| **Backend** | Python 3.12, FastAPI, Pydantic, arq (Redis queue) |
| **Database** | Supabase PostgreSQL with Row-Level Security |
| **AI Models** | Gemini 3.1 Pro, Claude Sonnet 4.5, Claude Opus 4.5, Perplexity Sonar Pro, Gemini 3.5 Flash |
| **Image Gen** | Gemini Imagen (AI generation), SerpAPI (web search) |
| **Infra** | Render (web + static), Modal (serverless compute), Redis, Supabase |
| **Payments** | Stripe subscriptions + credit system |
| **Analytics** | PostHog (product), Sentry (errors), custom viewer analytics |
| **Platforms** | Web, Desktop (Electron), Mobile (React Native / Expo) |

---

## 2. Monorepo Structure

```
nextslide/
├── apps/
│   ├── backend/                    # Python FastAPI — 400+ modules
│   │   ├── api/
│   │   │   ├── chat_server.py      # Main FastAPI app (1,453 lines, 47+ routers)
│   │   │   ├── middleware/          # Credit guards, rate limiting
│   │   │   └── requests/           # 48 router modules (api_*.py)
│   │   ├── agents/
│   │   │   ├── ai/                 # AI client abstraction (get_client, invoke)
│   │   │   ├── generation/         # Slide generation pipeline (47 modules)
│   │   │   ├── editing/            # AI editing orchestrator
│   │   │   ├── research/           # Web research agents
│   │   │   ├── theme/              # Theme generation
│   │   │   └── domain/             # Domain models
│   │   ├── services/               # 89 service modules (billing, sharing, email, etc.)
│   │   ├── models/                 # Pydantic models
│   │   ├── migrations/             # 40 SQL migration files
│   │   └── worker.py               # arq background job worker
│   │
│   ├── frontend/                   # React + Vite — 600+ components
│   │   ├── src/
│   │   │   ├── components/         # 87+ component directories
│   │   │   ├── pages/              # Route pages
│   │   │   ├── services/           # 49 API service modules
│   │   │   ├── stores/             # 22 Zustand stores
│   │   │   ├── hooks/              # 48 custom hooks
│   │   │   ├── renderers/          # Component renderers
│   │   │   ├── context/            # 17 React contexts
│   │   │   └── yjs/                # Collaboration layer
│   │   └── ssr/                    # Server-side rendering for export
│   │
│   ├── mobile/                     # React Native (Expo)
│   ├── desktop/                    # Electron wrapper
│   └── workers/                    # Edge workers (OG image router)
│
├── supabase/                       # Supabase local config
├── policies/                       # Legal/compliance
└── package.json                    # Monorepo root (npm-run-all)
```

**Dev commands:**
- `npm run dev` — Starts frontend (Vite :5173) + backend (Uvicorn :9090) in parallel
- `npm run dev:mobile` / `npm run dev:desktop` — Platform-specific dev servers
- Backend `Makefile`: `make deploy` pushes to Render + Modal

---

## 3. Slide Generation Pipeline

This is the core of the product. A user types a topic, and the system produces a complete, professionally designed presentation. Here's every step.

### 3.1 Phase 1: Outline Generation

**Service:** `services/outline/generator.py` → `OutlineGenerator`

The outline phase plans the deck structure before any slides are generated.

**Input:** `OutlineOptions` — topic prompt, slide count, detail level, optional file content (PDF/DOCX uploads), research toggle.

**Process:**
1. `OutlinePlanner` creates the slide structure using Perplexity Sonar Pro (for web research) or Gemini 3.5 Flash (for quick/tool-page generations)
2. For each slide: generates title, content bullets, chart suggestions, media placement hints
3. Detects where user-uploaded files (tagged media) should appear
4. Validates structure integrity

**Output:** `OutlineResult` — deck title + array of `SlideOutline` objects (id, title, content, taggedMedia, deepResearch flag).

**Research mode:** When enabled, Perplexity Sonar Pro performs live web research to gather current facts, statistics, and sources. These are cached in a deck-wide context block and reused across all slides.

### 3.2 Phase 2: Theme Generation

**Service:** `agents/theme/theme_agent.py` → `ThemeAgent`

The theme phase determines the visual identity of the entire deck.

**Decision tree:**
1. Is it a real brand? → Fetch colors/logo from Brandfetch API
2. Inspired by something? → AI generates contextual palette (e.g., "Halloween" → orange/black/purple)
3. Generic topic? → Generate complementary palette
4. User specified colors? → Use those

**Color intelligence** (`smart_color_selector.py`):
- Claude Haiku 4.5 at temperature=0 disambiguates context: "Alphabet" as educational topic produces friendly blues/yellows; "Alphabet Inc" produces Google tech colors
- WCAG AA/AAA contrast compliance enforced via `color_contrast_manager.py`
- Every palette has a 70/20/10 hierarchy: primary (70%), secondary (20%), accent (10%)

**Font intelligence** (`font_intelligence.py`):
- Database of 698+ fonts with 1,010 metadata tags
- 13+ brand style categories (Corporate, Tech, Luxury, Sports, Creative, Food, etc.)
- Scoring system: tag matching (+10), `best_for` matching, niche penalties (-30 for horror/graffiti tags in business context)
- Pairing rules: display + sans, script + serif, mono + geometric-sans
- Deterministic but varied selection via seed-based hashing from top 8 candidates

**Output:** `ThemeSpec` — color palette, typography (hero/body fonts), design philosophy string, brand info (logo URL, domain), and a "style manifesto" for AI prompts.

### 3.3 Phase 3: Parallel Slide Composition

**Orchestrator:** `agents/generation/orchestration/parallel_slide_orchestrator.py`

This is where the actual slide code is generated. The system generates up to 20 slides concurrently.

**Architecture:**
- `asyncio.Semaphore(MAX_PARALLEL_SLIDES=20)` controls parallelism
- 200ms delay between slide submissions to avoid rate limits
- Each slide is a fully independent generation task

**Context caching (critical optimization):**
- The prompt for every slide has two parts:
  - **Static block** (identical for all slides): theme colors, fonts, research context, brand info, sources
  - **Per-slide block**: slide title, content, index, images, mode
- Separated by `<<<CACHE_BREAKPOINT>>>`
- **Gemini context cache**: Static block cached once via Gemini v2beta API (1-hour TTL). Reduces per-slide prompt from ~29KB to ~3KB.
- **Anthropic prompt caching**: Static block marked with cache control tokens for Claude models.

**For each slide:**
1. Context building: combines outline + theme + tagged media + visual density hints
2. Prompt construction: system prompt (design rules) + user prompt (static block + per-slide block)
3. AI invocation: Gemini 3.1 Pro with structured Pydantic output, 420s timeout
4. Component validation: checks against registry (icon availability, chart types)
5. Image resolution: async pipeline processes all placeholders (see 3.4)

### 3.4 Phase 4: Custom Component Generation

**Generator:** `agents/generation/custom_component_generator.py`

Each slide is generated as a standalone HTML/CSS/JS component — a complete web page sized to 1920x1080.

**System prompt design** (`custom_component_prompts.py`) enforces:

- **Canvas**: Exactly 1920x1080px. No content below 1080px.
- **Visual toolkit**: Two tools for the AI:
  - **Built components** (HTML/CSS/SVG): flowcharts, timelines, comparisons, charts (Chart.js/D3), diagrams
  - **Images**: `generate:16:9 {prompt}` for AI-generated, `search: {terms}` for web search
- **Pointer events discipline**: All non-interactive elements (overlays, decorations, badges) must have `pointer-events: none`. Buttons/tabs must be functional.
- **Theme variables**: CSS custom properties (`--font-heading`, `--font-body`, exact hex colors). Never hardcode colors.
- **Interactivity**: Tabs must work. Each tab gets a unique image. `selectTab(0)` must be called at script end.
- **Layout constraints**: Logo bottom-left (max 40px), page number bottom-right (13px), usable height ~950px after header.

**The AI returns raw HTML**, which is then processed:

1. `CustomComponentHtmlProcessor` validates structure
2. `verify_slide_code()` checks for common issues
3. Image placeholders extracted and queued for resolution

### 3.5 Phase 5: Image Pipeline

**Pipeline:** `agents/generation/custom_component_image_pipeline.py`

This is one of the most sophisticated subsystems. It finds every image placeholder in the generated HTML and replaces it with a real image.

**Detection** (`_extract_image_props_from_html`):
- `<img src="placeholder">` tags
- JS object properties: `image: "placeholder"`, `imageAlt: "..."`
- CSS `background-image: url(placeholder)`
- Placeholder service URLs: `placehold.co`, `via.placeholder.com`
- Template variables: `${item.image}`

**Alt-text protocol:**
```
"generate:16:9 ball-and-stick caffeine molecule"  → AI generation, 16:9 aspect ratio
"search: Porsche 911 GT3 RS"                      → Web image search
No prefix                                          → Defaults to web search
```

**Resolution priority:**
1. Uploaded media → Gemini edit to match deck style
2. Logo properties → `theme.brandInfo.logoUrl` or logo.dev
3. `generate:` prefix → Gemini Imagen (generates image, uploads to Supabase bucket)
4. `search:` prefix → SerpAPI image search (filtered by size, copyright)
5. Fallback → first 5 words of prompt as generic search

**Image recreation** (`_recreate_searched_images`):
- Downloads searched images
- Calls Gemini Imagen edit to create a variation matching the deck's visual style
- Keeps subject, changes environment/background
- Produces unique variants that don't look like generic stock photos

**Three-phase injection** (`inject_prefetched_images`):

1. **JS objects**: Scans `<script>` blocks for objects with image properties. Uses semantic matching — extracts the object's `title`/`label`/`alt` and matches against search queries so each array item gets its correct image.
2. **HTML `<img>` tags**: Finds `<img>` with placeholder src, matches via alt text, replaces.
3. **CSS backgrounds**: Finds `background-image: url(placeholder)`, replaces with real URL.
4. **Auto-initialization**: Detects `selectTab(0)`-style functions and inserts the call if missing.

**Post-injection cleanup:**
- Strips `generate:` / `search:` prefixes from alt text
- Adds `data-image-mode="ai"|"search"` attributes
- Fixes icon URL interpolations (`${item.icon}` → actual `<img>` tags)
- Applies `object-fit` based on aspect ratio

### 3.6 Streaming & Events

Generation progress is streamed to the frontend via Server-Sent Events (SSE):

```
generation_started     → {total_slides, message}
theme_generated        → {theme: {...}}
slides_generation_started → {total_slides, max_parallel}
slide_started          → {slide_index}
slide_generated        → {slide_index, slide_data: {id, title, components[]}}
progress               → {current, total}
complete               → {message}
```

The frontend polls and renders slides as they arrive — users see slides appearing one by one during generation.

### 3.7 Background Generation (Worker)

**Worker:** `worker.py` using arq (async Redis queue)

```python
WorkerSettings:
  functions = [generate_deck_job]
  cron_jobs = [cron(process_email_campaigns, minute={0,5,...,55})]
  max_jobs = 3          # Max 3 concurrent deck generations
  job_timeout = 600     # 10-minute timeout
  max_tries = 2         # 1 retry on failure
  retry_defer = 30      # 30s delay before retry
```

For API-initiated generations and Slack integrations, decks are generated asynchronously via the worker. The frontend polls `/v1/presentations/{id}` for status or receives WebSocket events.

---

## 4. Design Intelligence System

This section explains why the generated slides look professional — not like typical AI output.

### 4.1 Elite Design Prompt

The system prompt targets **"Apple Keynote quality with Behance-level design sophistication"** on a 1920x1080 canvas. Key rules enforced:

**Typography hierarchy:**
| Element | Size | Weight | Usage |
|---------|------|--------|-------|
| Hero numbers | 200–350pt | 900 | Title slides, massive impact |
| Main titles | 80–120pt | 700–800 | Slide titles |
| Section headers | 42–56pt | 600 | Secondary color |
| Body text | 32–40pt | 400–500 | Main content |
| Supporting | 24–28pt | 300 | Captions, labels |
| Metadata | 18–22pt | 300 | Slide numbers, sources |

**Professional density:**
- Bullet vertical gap: 24–32px (not the 60–80px that AI models default to)
- Edge margins: 80px left/right, 100px top, 80px bottom
- Content-heavy slides: 60px edges to maximize space
- All bullets in ONE TiptapTextBlock with rich formatting (not separate blocks per line)

**Color discipline:**
- Primary (70%): backgrounds, headers, key elements
- Secondary (20%): accents, sub-sections
- Accent (10%): CTAs, emphasis, critical numbers
- Template variables enforced (`{{primary}}`, `{{secondary}}`, `{{accent}}`) — hardcoded hex values are rejected

**Component usage rules:**
- Charts: mandatory `tickRotation: 0` on both axes. Positioned left OR right (never centered). Font family set to body font.
- Images: hero 800–1200px wide (50–60% of slide). Always use placeholder with descriptive alt. Never external stock URLs.
- CustomComponents: must start with `<!DOCTYPE html>`, use single quotes, root `h-screen w-screen overflow-hidden`, Tailwind via CDN.
- Lines: must use `startPoint`/`endPoint` (not position/width/height).

### 4.2 Slide Type Patterns

The AI follows specific templates per slide type:

**Title slide:** Gradient background, 200–300pt title centered, optional logo top-left, subtitle 40–48pt. No boxes, no dividers — clean and bold.

**Content slide:** Section icon + title with divider below, bullets as ONE rich text block with indentation hierarchy (x=120→160→200), large image on right half (880×680).

**Stat slide:** Options include ReactBits count-up animation (200–300pt accent), CustomComponent dashboard grid (2–4 metrics), or Shape with centered stat.

**Data slide:** Title + icon, chart on left OR right (never centered), key insights as bullets on the opposite side.

### 4.3 Rejection Criteria

The system explicitly rejects:
- Fixed Y positions for bullet items (must flow naturally)
- Font sizes < 28pt for body text
- Chart + large image on the same slide
- Charts overlapping titles
- Vertical banner stacks (3+ images)
- Charts without margin property
- Splitting bullets into separate text blocks
- Icons not center-aligned with text

---

## 5. The Editor

The editor is the primary interface where users view, edit, and refine their presentations.

### 5.1 Architecture

**Main component:** `SlideEditor.tsx` (86KB+) — orchestrates the entire editor experience.

**Provider stack (outer → inner):**
```
NavigationProvider          → Slide navigation state
  EditorStateProvider       → Editor settings (snap, zoom, text editing)
    ActiveSlideProvider     → Current slide component state
      VersionHistoryProvider → Undo/redo history
        CollaborationWrapper → Yjs real-time sync
```

**Layout:** `ResizablePanelGroup` (shadcn/ui) — slide panel + chat panel, resizable divider.

### 5.2 Slide Rendering

**Component:** `Slide.tsx` (520 lines)

Each slide renders its components through `ComponentRenderer`:

```
Slide
├── Font Loading (useSlideFonts — prevents FOUT)
├── ActiveSlideContext (draft components during edit)
├── ComponentRenderer (for each component)
│   ├── Text (TiptapTextBlock) — rich text via Tiptap editor
│   ├── CustomComponent — HTML/CSS/JS in sandboxed <iframe>
│   ├── Image — with cropping overlay
│   ├── Table — inline cell editing
│   ├── Chart — Chart.js with live data editing
│   ├── Shape — rectangles, circles, etc.
│   ├── Lines — decorative/connector lines
│   ├── Video — embedded video players
│   ├── Icon — from icon registry
│   └── Background — full-slide fill (z-index: 0)
├── TextBoundingBoxOverlay (debug)
├── MultiSelectionBoundingBox
└── RemoteSelections (collaborative cursors)
```

**Component rendering priority:**
1. Edit mode → `activeComponents` from draft store
2. View mode → real-time subscription to store
3. Fallback → `slideData.components` from props

**Positioning system:**
- Absolute positioning with percentage values: `left: X%`, `top: Y%`
- Derived from pixel values: `(pixelPos / slideWidth) * 100%`
- Transforms via CSS variables for zero-lag dragging: `--drag-x`, `--drag-y`
- No React state updates during drag — instant snappy movement

### 5.3 CustomComponent Rendering (Iframes)

Each CustomComponent is a self-contained web page rendered in a sandboxed `<iframe>`:

```html
<iframe sandbox="allow-scripts allow-same-origin">
  <!DOCTYPE html>
  <html>
    <head>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Poppins&display=swap">
      <style>/* Component CSS + animations */</style>
    </head>
    <body class="w-full h-full overflow-hidden">
      <!-- AI-generated component markup -->
      <script>/* Interactivity: tabs, counters, hover effects */</script>
    </body>
  </html>
</iframe>
```

**Edit mode overlay:**
- Clicking a CustomComponent in edit mode shows an overlay
- Detects interactive elements (`<img>`, `<button>`, `<input>`)
- Each detected element becomes editable (click to select, edit properties)
- Images show a clickable edit button on hover for replacement
- Font injection: `extractFontFamiliesFromHtml()` finds used fonts → `injectIframeFonts()` loads them

**Script safety:**
- `stripInjectedScripts()` removes edit-mode code before saving
- Matches individual `<script>` blocks and checks content (avoids crossing `</script>` boundaries)
- Prevents script accumulation on repeated edits

### 5.4 Editing Capabilities

**Text editing:**
- Click to select, double-click to enter inline edit
- Tiptap editor with rich formatting: bold, italic, underline, colors, fonts, sizes
- `onTextChange` fires on every keystroke (debounced, skips history)
- `onFinishTextEdit` commits changes with history point

**Component manipulation:**
- **Drag**: CSS variable transforms (no React re-renders per mousemove). Throttled WebSocket sync at 50ms. Snap guides show alignment to adjacent components.
- **Resize**: Drag handles on edges. Aspect ratio lock optional. Min/max size constraints.
- **Rotate**: Handle at top-center. Drag to rotate in degrees.
- **Selection**: Click = single select. Shift/Ctrl+Click = multi-select. Drag rectangle = area select. Click background = deselect all.
- **Grouping**: Select multiple → group. Drag group moves children together.

**Image editing:**
- Click image button in toolbar → MediaHub picker opens
- Supports cropping mode with overlay UI
- Placeholder detection for unresolved images

**Table editing:**
- Click cells to edit inline
- Add/remove rows and columns
- Resize columns via drag handles

**Chart editing:**
- ChartDataEditor for modifying data
- Change chart type (bar, pie, line, area, scatter)
- Live preview updates during editing

### 5.5 Component Toolbar

Visible in edit mode:

| Tool | Action |
|------|--------|
| Text | Creates TiptapTextBlock at center |
| Image | Opens MediaHub picker |
| Shape | Dropdown: Rectangle, Circle, Triangle, Star, Heart, etc. |
| Chart | Dropdown: Bar, Pie, Line, Area, Scatter + data editor |
| Table | Visual grid selector (rows x cols) |
| Video | Paste URL input |
| Line | Click-draw mode for connector lines |
| Snap toggle | Enable/disable alignment guides |
| Theme | Color picker for new elements |

### 5.6 State Management

**Three-tier architecture:**

**Tier 1 — Zustand stores (global):**
- `editorStore` (~1000 lines): Draft components, selection state (`selectedComponentIds` Set), clipboard, sync. Key: `updateDraftComponent()`, `applyDraftChanges()`, `selectComponent()`, `groupSelectedComponents()`.
- `deckStore`: Complete deck data, slide operations, sync management.
- `historyStore`: Undo/redo stack. History points created at `applyDraftChanges()`. Transient operations batch changes during drag/resize.
- `editorSettingsStore`: Snap, zoom, text editing mode, image cropping mode.
- `presentationStore`: Presentation mode toggle, controls visibility, thumbnail sidebar.

**Tier 2 — React contexts (feature-specific):**
- `ActiveSlideContext`: `activeComponents`, `updateComponent()`, `slideId`
- `EditorStateContext`: `slideSize`, edit mode flags
- `NavigationContext`: `currentSlideIndex`, `goToSlide()`, `nextSlide()`, `prevSlide()`

**Tier 3 — Local component state:** Per-component `useState` for transient UI (modals, dropdowns, hover states).

### 5.7 Presentation Mode

**Component:** `PresentationMode.tsx` (700+ lines)

- Full viewport rendering with minimal padding
- Controls: arrow keys (next/prev), number keys (jump), Escape (exit)
- Side gestures: mouse to edges shows/hides controls
- Thumbnail grid for slide jumping
- Mobile: renders at 0.5x resolution to prevent OOM, scaled up with CSS transform. Forces landscape orientation via CSS rotation.
- Performance: `startTransition` for deferred rendering, only 1–2 slides in DOM at a time.

### 5.8 Undo/Redo

- Every `applyDraftChanges()` creates a history point
- Transient operations (drag, resize) batch all intermediate changes into one history entry
- `Ctrl+Z` / `Ctrl+Shift+Z` for undo/redo
- Text edits use `skipHistory` flag for intermediate keystroke changes, commit only on blur/finish

---

## 6. AI Editing Agent

When a user types in the chat sidebar, an AI agent modifies slides in real-time.

### 6.1 Request Flow

```
User types message in ChatPanel
  → POST /v1/agent/sessions/{id}/messages
  → Message saved to agent_messages table
  → Context built (deck state, selections, history, attachments)
  → Message classified (complexity → model selection)
  → Orchestrator invoked with full context
  → LLM returns tool calls + conversational response
  → Tools executed sequentially → accumulated DeckDiff
  → Events streamed via WebSocket
  → Frontend applies diff in real-time
```

### 6.2 Context Building

The orchestrator (`orchestrator_v2.py`) builds comprehensive context for the LLM:

1. **Presentation overview**: Deck name, total slides, current position, full outline
2. **Current slide details**: All components with full props (colors, fonts, styles, layout, HTML for CustomComponents)
3. **User selections**: Component IDs the user selected in the UI, formatted as `"comp_id (Type)@slide_id"`
4. **Attachments**: Uploaded files, screenshots (base64), style-copy context, LinkedIn profiles
5. **Chat history**: Last 10 messages for follow-up context ("undo that", "do the same but blue")
6. **Special hints**: Video detection, current date, scope (single slide vs. all slides)

### 6.3 Model Selection

Skill-based routing:
- **Simple edits** (text changes, color swaps) → Gemini 3.5 Flash (faster, cheaper)
- **Complex edits** (layout redesign, new slides) → Claude Sonnet 4.5 or Gemini 3 Pro
- **Fallback chain**: Primary → fallback (if rate-limited) → last resort

Classification happens early via `classify_message()` which analyzes request complexity, type (chat vs edit), and scope (slide vs deck).

### 6.4 Tool System

The LLM returns `OrchestratorResponse` with `tool_calls[]` and a conversational `message`. Tools execute sequentially (output of one feeds the next):

**Slide-level tools:**
- `create_slide` — Generate a new slide from content
- `create_slide_variants` — Generate multiple options for user to pick
- `delete_slide`, `duplicate_slide`, `reorder_slides`
- `edit_all_slides` — Batch edit across all slides

**Component-level tools:**
- `component_prop_update` — Change any component property
- `custom_component_rewrite` — Full HTML rewrite of a CustomComponent
- `custom_component_str_replace` — Surgical find-and-replace in HTML

**Content tools:**
- `web_search` — Search for current data before editing
- `deep_extract` — Multi-page website extraction
- `linkedin_lookup` — Profile lookup for "About" slides

**Image tools:**
- `search_images` — Find images via SerpAPI
- `replace_image` — Swap with specific URL
- `edit_image_with_ai` — Gemini Imagen edit on existing image

**Theme tools:**
- `apply_theme_to_custom_components` — Change colors/fonts across all slides

### 6.5 DeckDiff

All modifications are expressed as a `DeckDiff`:

```python
DeckDiff:
  slides_to_update:
    - slide_id
    - components_to_update:
        - id, type, props (text, color, position, etc.)
    - components_to_add: [new components]
  slides_to_add: [full slide objects]
  slides_to_remove: [slide IDs]
  slide_order: [reordered IDs]
```

The diff is proposed to the user. They click "Apply" or "Reject". On apply, the diff is merged into the deck in Supabase and broadcast to all collaborators.

### 6.6 Streaming Events

Events are streamed via WebSocket (with SSE fallback):

| Event | Meaning |
|-------|---------|
| `agent.thinking` | LLM processing started |
| `agent.action` | Tool about to execute |
| `agent.tool.start/finish/error` | Tool lifecycle |
| `assistant.message.delta` | Text response chunk |
| `assistant.message.complete` | Response done |
| `deck.edit.proposed` | Edit generated, awaiting approval |
| `deck.edit.applied` | Edit accepted and applied |
| `slide.variants.created` | Multiple options generated |

### 6.7 Outline Editing

The outline editor (`services/outline/outline_editing.py`) uses its own tool set:
- `update_slide_content` — Change title, talking points, speaker notes
- `add_slide`, `remove_slide_outline`, `move_slide_outline` — Structure changes
- `research_slide_outline` — Web search for new bullet points
- `deep_extract` — Website scraping for content

Returns updated outline + narrative flow analysis (tracks impact: high/medium/low).

---

## 7. Real-Time Collaboration

### 7.1 Yjs + WebSocket

NextSlide uses **Yjs** (Conflict-Free Replicated Data Types) for real-time collaborative editing.

**WebSocket server:** Deployed as Docker container on Render (`wss://slide-websocket.onrender.com`).

**Document structure:**
- Master Y.Doc: deck metadata (name, version, last modified) + slide array (slide IDs)
- Slide shards: separate Y.Docs for groups of slides (default: 3 slides/shard)
- Lazy loading: only loads documents for visible slides
- LRU cache with auto-unload after 60s idle
- Max 3 concurrent WebSocket connections

**Awareness system:**
- Cursor tracking: position updates via `awareness.setLocalStateField('cursor', {slideId, x, y})`
- Selection tracking: which components each user has selected
- User presence: {id, name, color, lastUpdate}
- `RemoteSelections` component renders other users' cursors and selections

**Sync pipeline:**
```
User edit
  → Updates editorStore.draftComponents (local)
  → Every ~100–300ms: applyDraftChanges()
    → Applies draft to deckStore
    → Adds to history stack
    → Triggers deckSyncService.saveDeck()
  → Yjs transaction broadcasts to WebSocket
  → Remote users see changes in real-time
```

### 7.2 Persistence

- **IndexedDB**: `y-indexeddb` provides offline persistence
- **WebSocket**: Changes propagate to server and other clients
- **Supabase**: Deck data persisted as JSONB (source of truth for cold starts)

---

## 8. Backend API & Services

### 8.1 FastAPI Application

**Main server:** `api/chat_server.py` — 1,453 lines, 47+ routers.

**Router categories:**

| Category | Routers | Prefix |
|----------|---------|--------|
| **Auth** | auth, google | `/auth`, `/api/google` |
| **Deck CRUD** | public_deck, deck_sharing, deck_access, deck_notes | `/public/decks`, `/api/decks/...` |
| **Generation** | outline_agent, outline_chat, outline_theme, slide_research, tool_generate | `/api/outline/...`, `/api/tool-generate` |
| **AI Agent** | agent, agent_stream, agent_messages | `/api/agent/...` |
| **Media** | image_options, image_generation, uploads, font | `/api/images`, `/api/generate-image`, `/fonts` |
| **Billing** | billing | `/api/billing` |
| **Admin** | admin, admin_analytics, admin_agent, admin_growth, admin_email | `/api/admin/...` |
| **Social** | community, profiles, comments, notifications | `/api/community`, `/api/profiles` |
| **Sharing** | sharing, deck_sharing, webpage, oembed | `/api/sharing`, `/api/webpages`, `/oembed` |
| **Developer** | developer, public_api_v1 | `/api/developer`, `/v1`, `/api/v1` |
| **Integrations** | integrations, slack, google | `/api/integrations`, `/api/slack` |
| **Analytics** | analytics_dashboard, websocket_analytics | `/api/analytics-dashboard`, `/ws` |
| **Gamification** | gamification, referral | `/api/gamification`, `/api/referral` |
| **Export** | carousel_export, preview | `/api/carousel`, `/preview` |
| **SEO** | sitemap, browse, templates, og_image | `/sitemap.xml`, `/browse`, `/api/templates`, `/og` |

### 8.2 Key Services (89 modules)

| Service | Purpose |
|---------|---------|
| `billing_service.py` | Credit management, Stripe integration, plan enforcement |
| `supabase.py` | Database client with connection pooling, circuit breaker, retry logic |
| `combined_image_service.py` | Unified image search + generation |
| `brandfetch_service.py` | Company brand data (colors, logo, fonts) |
| `deck_sharing_service.py` | Share link creation, viewer tracking, analytics |
| `email_service.py` | Resend API integration for transactional email |
| `carousel_export_service.py` | LinkedIn carousel PDF generation |
| `analytics_service.py` | View tracking, engagement metrics |
| `gemini_image_service.py` | Gemini Imagen for AI image generation |

### 8.3 Middleware

**Credit Guard** (`middleware/credit_guard.py`):
```python
async with CreditGuard(user_id, CreditAction.SLIDE_GENERATION) as guard:
    if guard.has_credits:
        # Perform operation
        await guard.consume()  # Atomic deduction
    else:
        raise HTTPException(402, detail={
            "required": cost,
            "remaining": balance,
            "upgrade_url": "..."
        })
```

**Rate limiting:** Per-IP via `slowapi`. Per-API-key for developer endpoints (60 req/min).

### 8.4 Supabase Client

**Connection management:**
- Pool: 10 max connections, 5 keepalive per gunicorn worker
- Timeouts: 5s connect, 30s read/write
- Connection recycling: max age 5 minutes
- Circuit breaker: 25 consecutive failures → 30s recovery timeout
- Retry decorator: `@with_supabase_retry(max_attempts=3, timeout_seconds=30.0)`

---

## 9. Database Schema & Storage

### 9.1 Core Tables (36+ total, managed via 40 migrations)

**Presentation storage:**
```
decks
  ├── uuid (PK)
  ├── user_id → auth.users
  ├── name, description
  ├── data (JSONB) ← Complete deck structure
  │   ├── slides[] → [{id, title, components[]}]
  │   │   └── components[] → [{id, type, props, x, y, width, height}]
  │   ├── size: {width: 1920, height: 1080}
  │   └── version
  ├── status (JSONB) → {state: generating|completed|failed}
  ├── conversation_history (JSONB) → {messages[]}
  ├── slide_count (cached)
  ├── thumbnail_url
  └── created_at, updated_at, last_modified
```

All slide content lives in a single JSONB column (`data`). No separate slides table — this simplifies reads/writes and works well with CRDT sync.

**Sharing & analytics:**
```
deck_shares          → Short codes, permissions, expiration
share_viewers        → Email capture from gated links
share_view_events    → Per-session analytics (device, browser, country, slide_views[])
presentation_views   → View tracking (source, duration, slide_index)
slide_engagement     → Per-slide time spent
daily_view_stats     → Aggregated daily metrics
```

**Billing:**
```
credit_balances      → Per-user: monthly_credits, purchased_credits, used_credits, period_end
subscriptions        → Stripe: plan_id, status, stripe_subscription_id
credit_transactions  → Audit log: action, amount, metadata
credit_costs         → Configurable costs per action (slide gen: 5, AI chat: 1, etc.)
```

**Social & gamification:**
```
community_decks      → Gallery submissions (status: pending|approved|rejected)
user_follows         → Social graph
showcase_upvotes     → Community voting
user_badges          → Achievement badges (badge_type, credits_awarded)
user_streaks         → Daily activity streaks (current, longest, last_activity_date)
referral_codes       → Referral program tracking
```

**Developer API:**
```
api_keys             → key_prefix, key_hash, context_instructions, brand_settings, webhook_url
```

**Publishing:**
```
published_webpages   → slug, slides_data, is_published, view_count, lead_count
webpage_leads        → Email collection from published sites
```

**Integrations:**
```
slack_workspaces     → team_id, bot_token, bot_user_id
slack_user_mappings  → Slack user ↔ NextSlide user links
user_integrations    → OAuth tokens for external services
```

### 9.2 RLS (Row-Level Security)

All tables have RLS enabled:
- **Service role** (backend): Bypasses RLS for server-side operations
- **Anon key**: SELECT only on public tables (community decks, public profiles)
- **Authenticated users**: Restricted to own data (own decks, own shares, own credits)

---

## 10. Authentication & Authorization

### 10.1 Auth Methods

- **Email/Password**: Supabase built-in auth
- **Google OAuth**: JWT verification via Google API
- **Magic Links**: Email-based passwordless auth
- **Session management**: JWT tokens with refresh token support

### 10.2 Auth Flow

```
Login/Signup → Supabase Auth → JWT issued
  → Stored in client (supabase-js manages refresh)
  → Sent as Bearer token in Authorization header
  → Backend validates via Supabase /auth/v1/user endpoint
  → Falls back to local JWT decode if HTTP times out (1.5s connect, 2.0s read)
```

### 10.3 Admin Auth

```python
async def verify_admin_role(authorization: str = Header(None)):
    # Returns: {id, email, role: "admin", permissions: [...]}
```

Frontend caches admin verification for 5 minutes to avoid repeated checks on route changes.

### 10.4 Route Protection

```tsx
<ProtectedRoute requireAuth={true}>   // Must be logged in
<ProtectedRoute requireAuth={false}>  // Must NOT be logged in (login/signup pages)
<AdminProtectedRoute>                  // Must have admin role
```

---

## 11. Billing & Credits

### 11.1 Credit Model

```
credit_balances:
  monthly_credits      → Plan allowance per month
  purchased_credits    → Overage credits (purchased separately)
  used_credits         → Consumed this period
  remaining           → monthly + purchased - used
  period_end          → When credits reset
```

### 11.2 Plans

| Plan | Monthly Credits | Key Features |
|------|-----------------|-------------|
| Free | 500 | Basic AI generation |
| Starter | 1,000 | + PPTX export, email support |
| Pro | 2,000 | + Developer API, branding, overage purchase |
| Enterprise | 10,000+ | Custom SLA |
| Friends & Family | Unlimited (-1) | All features, free |

New users start at Pro tier with 2,000 credits.

### 11.3 Credit Costs

| Action | Credits |
|--------|---------|
| Slide generation | 5 |
| Slide regeneration | 3 |
| AI chat message | 1 |
| AI slide edit | 2 |
| Theme generation | 3 |
| Outline generation | 2 |
| Image generation (AI) | 3 |

### 11.4 Enforcement

- Pre-check before every operation via `CreditGuard`
- Atomic deduction with per-user locks (prevents race conditions)
- `402 Payment Required` with `{required, remaining, upgrade_url}` on insufficient credits
- Stripe webhooks (`invoice.paid`) reset monthly credits

---

## 12. Sharing, Analytics & Embedding

### 12.1 Share Links

**Types:**
- **View-only** (`/p/{shortCode}`): Read-only presentation
- **Edit** (`/e/{shortCode}`): Collaborative editing (full Yjs sync)
- **Embed** (`/embed/{shortCode}`): Minimal iframe-friendly viewer
- **Email-gated**: Requires email before viewing (lead capture)

Short codes: 8-character alphanumeric (excludes ambiguous chars: 0, O, l, I). Optional expiration.

### 12.2 Viewer Analytics

Every shared presentation tracks:
- **Session-level**: device type, browser, country, referrer, duration
- **Slide-level**: per-slide time spent, view order
- **Aggregated**: total views, unique visitors, views by date/hour, device breakdown, top locations

Analytics pipeline:
- `navigator.sendBeacon` for fire-and-forget view tracking
- Slide engagement debounced (5s inactivity or 20+ events → batch POST)
- `flushPendingEngagement()` on page unload

### 12.3 Real-Time Presenter Analytics

WebSocket endpoint: `ws://api/ws/shares/{share_id}/presenter`

Authenticated presenters see live viewer activity:
- Active viewer count
- Which slide each viewer is on
- Join/leave events

### 12.4 OEmbed

Standard oEmbed v1.0 endpoint at `/api/oembed?url=...`:
- Returns rich embed HTML with responsive iframe
- Works with Notion, Medium, WordPress, Slack, Twitter/X, LinkedIn
- OG image generated at `/api/public/og/{code}.png`

### 12.5 Website Publishing

Decks can be published as scrollable single-page websites:
- Custom slug URLs (e.g., `nextslide.ai/pages/q3-sales`)
- Optional lead capture (email/name form)
- View tracking per page

### 12.6 Export Formats

**LinkedIn Carousel PDF:**
- Square (1080x1080) or Portrait (1080x1350)
- ReportLab PDF generation
- Smart text layout with auto-sizing fonts
- "Made with NextSlide" branding for free users

**PPTX Import:**
- LibreOffice headless converts PPTX → PDF → PNG slides
- Imported as image-based slides for re-design

---

## 13. Integrations & Developer API

### 13.1 Public Developer API (v1)

**Auth:** `X-API-Key: ns_live_...` header. Requires Pro subscription.

**Endpoints:**
```
POST /v1/presentations        → Create deck (async generation)
GET  /v1/presentations/{id}   → Poll status
GET  /v1/presentations        → List API-generated decks
POST /v1/presentations/{id}/share → Create share link
```

**Protections:**
- Max 3 concurrent generations per API key
- 60 req/min rate limit per key
- 60-second deduplication window for identical requests
- 15-minute stale generation cleanup
- Atomic credit consumption with per-user locks

**Webhook:** Optional `webhook_url` in API key config. POST with deck data + metadata on completion.

**API key features:**
- `context_instructions` — Custom system prompt for all generations
- `context_images[]` — Brand reference images uploaded to Supabase bucket
- `brand_settings` — Custom colors, fonts, logo
- `include_edit_link` — Include edit URL in webhook payload

### 13.2 Slack Integration

**Slash command:** `/nextslide Q3 Sales Report`

**Flow:**
1. Immediate acknowledgement (< 3 sec Slack requirement)
2. Background task:
   - Lookup workspace → auto-link user by email
   - Gather context: last 50 messages in channel + shared images
   - Run clarification agent (may ask follow-up via Block Kit form)
   - Generate deck
   - Update `response_url` with share link + embed

**Link unfurling:** When a `nextslide.ai/p/{code}` link is shared in Slack, the bot unfurls it with deck title, slide count, and thumbnail.

### 13.3 Other Integrations

- **Google Drive**: Import/export via OAuth
- **Brandfetch**: Automatic brand detection (colors, logo, fonts)
- **SerpAPI**: Web image search
- **Firecrawl**: Website content extraction
- **Resend**: Transactional email
- **Stripe**: Payment processing
- **PostHog**: Product analytics
- **Sentry**: Error tracking

---

## 14. Frontend Architecture

### 14.1 Routing

**50+ routes** in React Router v6:

| Category | Examples |
|----------|---------|
| **Public** | `/`, `/login`, `/signup`, `/pricing`, `/help`, `/developers` |
| **SEO/Marketing** | `/templates`, `/showcase`, `/for-startups`, `/pdf-to-ppt`, `/slack-bot` |
| **Dashboard** | `/app`, `/deck/:deckId`, `/profile`, `/analytics` |
| **Sharing** | `/p/:shareCode` (view), `/e/:shareCode` (edit), `/embed/:shareCode` |
| **Community** | `/u/:username` (profiles), `/community/:deckId`, `/r/:code` (referrals) |
| **Admin** | `/admin/*` — 13 sub-pages (users, decks, brands, fonts, growth, email, etc.) |

**Aliases:** `/new`, `/create`, `/file`, `/dashboard`, `/home` all redirect to `/app`.

### 14.2 Design System

- **TailwindCSS** with CSS variables for theme colors
- **shadcn/ui** component library (Button, Dialog, Dropdown, Tabs, etc.)
- **Radix UI** headless primitives underneath
- **Lucide React** icons (462 icons)
- **Framer Motion** for animations
- **Dark mode**: Class-based via `next-themes` (`<html class="dark">`)

**Design tokens:**
```css
:root {
  --theme-bg-color: #ffffff;
  --theme-text-color: #000000;
  --theme-accent-color: #FF4301;
  --theme-font-family: 'Inter', sans-serif;
}

/* Admin components */
cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl"
```

### 14.3 Performance Optimizations

- **React.memo** on ComponentRenderer with custom equality
- **Zustand selectors** to avoid re-renders on unrelated state changes
- **CSS variables** for drag transforms (no DOM updates per mousemove)
- **Lazy loading** all admin pages (`React.lazy()` + `Suspense`)
- **Virtualized lists** for deck grid (infinite scroll)
- **Deferred transitions** for heavy slide rendering (`startTransition`)
- **Isolated re-rendering**: Typewriter components (~20 updates/sec) wrapped in `React.memo` to prevent parent re-renders
- **Font preloading**: `useSlideFonts` loads fonts before showing slides (prevents FOUT)

### 14.4 Mobile Support

- **Breakpoint**: 768px width / 500px height (landscape detection)
- **Touch detection**: `ontouchstart` in window or `navigator.maxTouchPoints > 0`
- **Presentation mode**: 0.5x render resolution on mobile (prevents OOM), CSS-scaled up
- **Editor**: View-only on mobile (edit mode too complex for touch)
- **Chat panel**: Vertical drag handle to resize (40–75% of height)
- **Landscape forcing**: Presentation mode forces landscape via CSS rotation on portrait phones

---

## 15. Deployment & Infrastructure

### 15.1 Services

| Service | Platform | Type |
|---------|----------|------|
| **Backend API** | Render | Web service (Python 3.12, Gunicorn + Uvicorn) |
| **Frontend** | Render | Static site (Vite build → dist/) |
| **WebSocket server** | Render | Docker container (Yjs WebSocket) |
| **Serverless compute** | Modal | Heavy generation offloading |
| **Background worker** | Render | arq + Redis |
| **Database** | Supabase | PostgreSQL with RLS |
| **Cache/Queue** | Redis | Job queue + image cache |
| **Desktop** | GitHub Releases | Electron (macOS DMG, Windows EXE, Linux AppImage) |
| **Mobile** | Expo EAS | React Native builds |

### 15.2 Backend Deployment

```yaml
# render.yaml
type: web
env: python
buildCommand: pip install -r requirements.txt && modal deploy modal_app.py
startCommand: gunicorn api.chat_server:app -w 1 -k uvicorn.workers.UvicornWorker
plan: starter
region: oregon
```

Single worker with Modal for heavy compute offloading. This keeps the Render instance lean while Modal handles burst capacity for parallel slide generation.

### 15.3 Frontend Deployment

```yaml
type: static
buildCommand: npm install --legacy-peer-deps && npm run build
publishPath: ./dist
```

Static site with client-side routing (index.html fallback). Custom headers for cache control and MIME types.

### 15.4 CI/CD

- **Desktop releases**: GitHub Actions (`.github/workflows/desktop-release.yml`) — triggers on `v*` tags, builds for all platforms, uploads to GitHub Releases.
- **Backend/Frontend**: Render auto-deploy from git push to main branch.
- **Modal**: Deployed as part of backend build command.

### 15.5 Observability

- **Sentry**: Error tracking (frontend + backend), 0.1 sample rate for traces and replays
- **PostHog**: Product analytics, user identification, event tracking
- **Custom analytics**: View tracking, slide engagement, share analytics (all stored in Supabase)
- **Admin dashboard**: Real-time metrics, user management, cost tracking, growth analytics

---

## Summary

NextSlide is a vertically integrated AI presentation platform with:

- **Custom slide generation** — each slide is a unique HTML/CSS/JS component, not a template fill
- **Multi-model AI pipeline** — Perplexity for research, Gemini 3.1 Pro for generation, Claude for editing, Gemini Imagen for images
- **Design intelligence** — 698-font pairing engine, WCAG-compliant color system, professional density enforcement, brand detection
- **Sophisticated image pipeline** — AI generation + web search + recreation + semantic injection into HTML/JS
- **Full-featured editor** — drag/resize/rotate, rich text, chart editing, CustomComponent iframe editing, snap guides
- **Real-time collaboration** — Yjs CRDTs over WebSocket with document sharding and presence
- **AI editing agent** — conversational, tool-based, streaming, with multi-slide batch operations
- **Production infrastructure** — credit system, developer API, Slack integration, website publishing, viewer analytics, OEmbed
- **Multi-platform** — web, desktop (Electron), mobile (React Native)

The core differentiator is that **every slide is a bespoke web component** — not a predetermined layout with swapped content. The AI generates actual HTML/CSS/JS tailored to the topic, with working interactivity (tabs, counters, hover effects), real images (AI-generated or web-searched and stylistically recreated), and professional typography and color palettes matched to the brand or topic context.
