# NextSlide — Technical Architecture Guide

> Prepared for acquisition technical review. This document covers the complete system architecture, core IP, and engineering decisions behind NextSlide.

---

## 1. Executive Summary

NextSlide is an AI-powered presentation platform that generates fully custom slide decks from natural language prompts. Unlike tools that shuffle pre-made templates, NextSlide generates each slide as a bespoke HTML/CSS/JS component rendered at 1920×1080px — giving pixel-level design control with real code underneath.

**Core value proposition:** Users describe what they want in plain language, and the system produces a complete, editable presentation in under 60 seconds — with real images, consistent theming, and professional design.

**Tech stack:**
- **Backend:** Python 3.12, FastAPI, async throughout
- **Frontend:** React 18, TypeScript, Vite, Zustand, Tailwind CSS
- **Database:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **AI:** 30+ models across 8 providers (Anthropic, Google, OpenAI, Perplexity, xAI, Mistral, DeepSeek, Groq)
- **Hosting:** Render (static site + web services + Docker WebSocket), Supabase Cloud, Modal (optional serverless)
- **Payments:** Stripe subscriptions
- **Monitoring:** Sentry, PostHog, LangSmith

---

## 2. System Architecture

### Monorepo Layout

```
nextslide/
├── apps/
│   ├── backend/          # FastAPI server (Python 3.12)
│   │   ├── agents/       # AI orchestration (generation, editing, research)
│   │   ├── api/          # 62 API router modules
│   │   ├── services/     # 84 business logic services
│   │   └── migrations/   # 38 SQL migration files
│   ├── frontend/         # React 18 + TypeScript + Vite
│   │   ├── src/components/  # Reusable UI components
│   │   ├── src/pages/       # ~60 page components
│   │   ├── src/stores/      # 20 Zustand state stores
│   │   └── src/services/    # API clients and business logic
│   ├── mobile/           # Mobile application build
│   ├── desktop/          # Desktop application build (Electron)
│   └── workers/          # Background job workers (arq)
├── TECHNICAL_GUIDE.md    # This document
└── CLAUDE.md             # AI assistant instructions
```

### Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                        Render                                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Static Site   │  │ Web Service  │  │ Docker WebSocket  │  │
│  │ (Frontend)    │  │ (FastAPI)    │  │ (Real-time)       │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                 │                    │              │
└─────────┼─────────────────┼────────────────────┼──────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                                │
│  ┌────────────┐  ┌──────────┐  ┌─────────┐  ┌───────────┐  │
│  │ PostgreSQL  │  │   Auth   │  │ Storage │  │ Realtime  │  │
│  │ (37 mig.)   │  │ (OAuth)  │  │ (Assets)│  │ (Subs)    │  │
│  └────────────┘  └──────────┘  └─────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI Providers                               │
│  Anthropic · Google · OpenAI · Perplexity · xAI · DeepSeek  │
│  Mistral · Groq                                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Prompt
    │
    ▼
React Frontend (SSE connection opened)
    │
    ▼
FastAPI (api_deck_compose_stream.py)
    │
    ├── 1. Outline Generation (Perplexity web search + Claude reasoning)
    │
    ├── 2. Theme Resolution (brand detection, palette generation)
    │
    ├── 3. Parallel Slide Generation (Gemini 3 Pro, up to 20 concurrent)
    │   ├── HTML/CSS/JS generation (1920×1080)
    │   ├── Image pipeline (SerpAPI search + AI generation)
    │   └── Post-processing (contrast, optimization)
    │
    └── 4. SSE Stream → Frontend (real-time progress updates)
                │
                ▼
         Supabase (persist deck, slides, assets)
```

---

## 3. Slide Generation Pipeline (Core IP)

The deck generation pipeline is the primary intellectual property. It transforms a user prompt into a complete presentation through 5 coordinated phases.

### Orchestrator: `DeckComposerV2`

**File:** `apps/backend/agents/generation/deck_composer_v2.py`

```
compose_deck(outline, deck_uuid) → AsyncIterator[events]
│
├── PHASE 1: INITIALIZATION
│   ├── Acquire concurrency slot (ConcurrencyManager)
│   ├── Request deduplication check
│   └── Create empty deck skeleton in database
│
├── PHASE 2: THEME RESOLUTION
│   ├── ThemeResolver: cache check → generate new
│   ├── ColorPaletteManager: extract and normalize palette
│   ├── Brand detection (Brandfetch API) if company name detected
│   └── StyleManifestoBuilder: create enforced style guide
│
├── PHASE 3: IMAGE PREPARATION (parallel background)
│   ├── ImageOrchestrator: batch search for all slide images
│   ├── SerpAPI (stock images) + Perplexity (contextual images)
│   └── Cache results for injection in Phase 4
│
├── PHASE 4: SLIDE GENERATION (parallel, max 20 concurrent)
│   ├── For each slide:
│   │   ├── CustomComponentGenerator: AI generates full HTML/CSS/JS
│   │   ├── Image injection from Phase 3 cache
│   │   ├── AI image generation (Gemini/DALL-E) for "generate:" prefixes
│   │   ├── Placeholder detection & resolution
│   │   ├── Color contrast enforcement
│   │   └── Persist to Supabase
│   └── Progress events yielded via SSE
│
└── PHASE 5: FINALIZATION
    ├── Save complete deck state
    ├── Release concurrency slot
    ├── Credit deduction
    └── Yield final deck data event
```

### Prompt Engineering

**File:** `apps/backend/agents/generation/custom_component_prompts.py`

Each slide is generated with a carefully engineered prompt that includes:
- Target dimensions (1920×1080px)
- Theme/style manifesto (colors, fonts, spacing rules)
- Slide-specific content from the outline
- Design pattern examples (layout templates)
- Component hints (chart types, image placement)
- Strict HTML/CSS/JS output format constraints

The prompt enforces:
- Self-contained HTML (no external dependencies except Google Fonts)
- Inline CSS with scoped selectors
- Responsive scaling via CSS transforms
- Image placeholders with semantic alt text for pipeline injection

### Theme Enforcement

Themes are resolved once and enforced across all slides:
- **ThemeResolver** (`theme_resolver.py`): Resolves theme from brand, user preference, or AI generation
- **ColorPaletteManager** (`color_palette_manager.py`): Extracts and normalizes the color palette
- **StyleManifestoBuilder** (`style_manifesto_builder.py`): Creates a style guide injected into every slide prompt
- **ThemeEnforcement** (`theme_enforcement.py`): Post-generation validation of theme compliance

### Chart Data Handling

When slides contain charts, the system:
1. Generates chart data as inline JavaScript objects
2. Uses Chart.js or custom SVG rendering (embedded in the HTML)
3. Charts are fully self-contained — no external data fetching

---

## 4. AI Architecture

### Multi-Provider Strategy

NextSlide routes to 30+ models across 8 providers, each selected for specific strengths:

| Provider | Models | Primary Use |
|----------|--------|-------------|
| **Google Gemini** | Gemini 3.1 Pro, 3 Flash, 2.5 Pro/Flash | Slide generation (creative HTML), fast tasks |
| **Anthropic** | Claude Opus 4.5/4.6, Sonnet 4.5/4.6, Haiku 4.5 | Orchestration, reasoning, fallback |
| **OpenAI** | GPT-5, 5.2, 4.1, 4o-mini | File analysis, embeddings, image generation |
| **Perplexity** | Sonar, Sonar Pro | Web search, outline research |
| **xAI** | Grok 4, Grok 4 Fast | Alternative generation |
| **DeepSeek** | Chat, Reasoner | Cost-effective reasoning |
| **Mistral** | Large 3 | European alternative |
| **Groq** | DeepSeek R1 Distill | Ultra-fast inference |

### Model Routing

**File:** `apps/backend/agents/config.py`

Models are categorized by capability tier:

```python
MODEL_HARD     = GEMINI_3_PRO           # Creative generation (slides, themes)
MODEL_SMART    = CLAUDE_SONNET          # Reasoning (orchestration, planning)
MODEL_EASY     = GEMINI_3_FLASH         # Fast/cheap tasks (classification, chat)
MODEL_FALLBACK = CLAUDE_OPUS            # Rate limit fallback
MODEL_RESEARCH = PERPLEXITY_SONAR_PRO   # Web search
```

Task-specific routing maps 25+ task types to optimal models:

```python
TASK_MODELS = {
    "slide_generate":   MODEL_HARD,      # Gemini 3.1 Pro
    "slide_edit":       GEMINI_3_FLASH,  # Fast edits
    "theme_generate":   MODEL_HARD,      # Creative theming
    "orchestrator_router": MODEL_EASY,   # Intent classification
    "orchestrator_complex": MODEL_SMART, # Complex planning
    "outline_research": MODEL_RESEARCH,  # Web search
    "chat":             MODEL_EASY,      # Conversation
    ...
}
```

### Client Abstraction

**File:** `apps/backend/agents/ai/clients.py` (1,002 lines)

```python
# Unified interface across all providers
client, model = get_client("gemini-3.1-pro-preview")
result = invoke(client, model, messages, response_model=SlideOutput)
```

Key features:
- **Structured output:** Instructor-based Pydantic model validation across all providers
- **JSON repair:** Automatic recovery from malformed JSON (truncation, missing brackets)
- **Prompt caching:** Anthropic prompt caching for repeated system prompts
- **Rate limit tracking:** Per-provider rate limit awareness with automatic fallback
- **Multimodal support:** Text, images, and documents via base64 encoding
- **Cost tracking:** Token counting and cost calculation per invocation
- **LangSmith tracing:** Optional LLM call tracing for debugging

---

## 5. Image Pipeline

### Overview

The image pipeline transforms placeholder images in AI-generated HTML into real, contextually relevant images. It operates on each slide after HTML generation.

**Key files:**
- `agents/generation/custom_component_image_pipeline.py` — Detection, search, injection
- `agents/generation/image_orchestrator.py` — Parallel search coordination
- `agents/generation/ai_image_orchestrator.py` — AI image generation
- `services/combined_image_service.py` — Multi-source search

### Image Sources (Priority Order)

1. **SerpAPI** — Google Image Search for stock photos and specific subjects
2. **Perplexity** — Context-aware image discovery
3. **Gemini Image Gen** — AI-generated images (10 aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9)
4. **DALL-E (GPT Image 1)** — OpenAI image generation fallback

### Image Mode System

AI-generated HTML uses alt text prefixes to control image sourcing:
- `search:corporate team meeting` → SerpAPI/Perplexity stock image search
- `generate:futuristic city skyline` → AI image generation (Gemini/DALL-E)
- Plain alt text → Default to search

### Placeholder Detection

The pipeline detects and replaces multiple placeholder patterns:
- `placeholder` literal in src attributes
- `via.placeholder.com` URLs
- `placehold.co` URLs
- `picsum.photos` URLs
- Data URIs with placeholder content
- Template literal placeholders (`${item.icon}`)

### Injection

Images are injected into:
- HTML `src` attributes (standard `<img>` tags)
- CSS `background-image` properties
- JavaScript object properties (`.src`, `.image`, `.url`, `.link`, `.href`, etc.)
- Template literal expressions

### Cost Controls

- Maximum 6 AI-generated images per slide
- Search images are free (SerpAPI quota)
- Fallback chain: search → Gemini generation → DALL-E → placeholder kept
- Image caching (memory + Redis) to avoid redundant searches

---

## 6. Editor Architecture

### Component Model

Each slide contains N components, and each component is a self-contained HTML/CSS/JS block. The primary component type is `CustomComponent` — raw HTML rendered in an iframe at 1920×1080px.

### Rendering

- **Iframe isolation:** Each slide renders in its own iframe, preventing CSS/JS leakage
- **Scale transform:** Slides are rendered at 1920×1080 and CSS-scaled to fit the viewport
- **Mobile optimization:** Presentation mode renders at half resolution (960×540) on mobile devices

### Selection & Editing

- Click to select a component
- Multi-select via Ctrl+click
- Inline text editing via double-click
- AI-powered editing via chat (natural language commands)

### Key Editor Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| `ComponentToolbar` | ~1,715 | Context-aware toolbar for selected components |
| `useMultiComponentDrag` | Hook | Drag & drop with snap guides and grid snapping |
| `useKeyboardShortcuts` | Hook | Keyboard shortcuts (copy, paste, delete, undo/redo) |

### Undo/Redo

**Store:** `historyStore.ts` (Zustand)

Full state snapshots for undo/redo. Each mutation pushes the complete slide state onto the history stack. This trades memory for simplicity — no command pattern needed.

### Auto-Save

**Service:** `deckSyncService.ts`

Debounced sync to backend via REST API. Changes are batched and sent after 2 seconds of inactivity. Conflict resolution uses last-write-wins with server timestamps.

---

## 7. State Management

### Zustand Stores (20 stores)

The frontend uses Zustand for all global state, organized into domain-specific stores:

**Core Deck State:**
| Store | Purpose |
|-------|---------|
| `deckStore.ts` | Primary deck data (slides, components, metadata) |
| `deckCoreOperations.ts` | Core CRUD operations (add/remove/reorder slides) |
| `deckSlideOperations.ts` | Slide-specific operations (duplicate, move) |
| `deckSyncOperations.ts` | Backend sync (save, load, conflict resolution) |
| `deckVersionOperations.ts` | Version management |

**Editor State:**
| Store | Purpose |
|-------|---------|
| `editorStore.ts` | Selection, draft state, edit mode |
| `editorSettingsStore.ts` | Editor preferences (grid, snapping) |
| `customComponentEditStore.ts` | Custom component inline editing |
| `editModeTransitionStore.ts` | Edit mode transition animations |
| `historyStore.ts` | Undo/redo history |
| `interactionStore.ts` | Mouse/keyboard interaction state |
| `presentationStore.ts` | Presentation mode state |
| `themeStore.ts` | Active theme |

**Collaboration:**
| Store | Purpose |
|-------|---------|
| `deckStoreYjsSlice.ts` | Yjs CRDT binding for real-time collaboration |
| `yjsOperations.ts` | Yjs adapter operations |
| `yjsZustandMiddleware.ts` | Zustand ↔ Yjs middleware |

### React Context

Used for cross-cutting concerns that don't need the performance of Zustand:
- `AuthContext` — Supabase auth state
- `ThemeContext` — Light/dark mode
- `CreditsContext` — User credit balance
- `OnboardingContext` — New user onboarding flow
- `RewardsContext` — Gamification state

### Real-time Sync

Supabase Realtime subscriptions for:
- Deck state changes (multi-device sync)
- Share link access tracking
- Notification delivery

---

## 8. Frontend Architecture

### Tech Stack

- **React 18** with TypeScript (strict mode)
- **Vite** for build tooling (~43s build time)
- **Tailwind CSS** for utility-first styling
- **shadcn/ui** (Radix + Tailwind) for UI component library
- **Zustand** for state management
- **React Router v6** for routing

### Route Tree (~90 routes)

| Category | Count | Examples |
|----------|-------|---------|
| Authentication | 5 | `/login`, `/signup`, `/reset-password` |
| Core App | 3 | `/app` (dashboard), `/deck/:deckId` (editor) |
| Sharing | 4 | `/p/:shareCode`, `/e/:shareCode`, `/embed/:shareCode` |
| Public Content | 8 | `/showcase`, `/community/:deckId`, `/u/:username` |
| Landing Pages | 16 | `/for-startups`, `/pitch-deck`, `/pricing` |
| Tool Pages | 11 | `/pdf-to-ppt`, `/website-to-ppt`, `/text-to-ppt` |
| Admin | 13 | `/admin/overview`, `/admin/users`, `/admin/costs` |
| Utility | ~30 | Redirects, legacy URL support |

### Code Splitting

All admin pages are lazy-loaded to reduce bundle size for non-admin users:

```typescript
const AdminUsers = lazy(() => import('./pages/admin/AdminUsersV2'));
const AdminDecks = lazy(() => import('./pages/admin/AdminDecks'));
// ... 11 more admin pages
```

### Design Tokens

```typescript
// Card styling
cardClass = "bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-xl"

// Brand accent
accent = "#FF4301"
```

### Key Pages

| Page | Purpose |
|------|---------|
| `DeckList.tsx` | Dashboard — deck grid, templates, recent |
| `SlideEditor` (composed) | Core editor — slide canvas, toolbar, chat, outline |
| `PresentationMode` | Fullscreen presentation with keyboard/touch navigation |
| `SharedDeckView.tsx` | Public view of shared decks |
| `Pricing.tsx` | Billing plans and Stripe checkout |

---

## 9. Backend Architecture

### FastAPI Server

**File:** `apps/backend/api/chat_server.py`

- **58 routers** registered via `app.include_router()`
- Fully async (asyncio throughout)
- CORS configured for frontend origin
- Middleware: request timing, error handling, rate limiting

### Services Layer (84 files)

Organized by domain:

| Category | Key Services | Count |
|----------|-------------|-------|
| **Image** | `gemini_image_service`, `openai_image_service`, `combined_image_service` | 6 |
| **Font** | `unified_font_service`, `font_metrics_service`, `web_font_service` | 7 |
| **Theme/Design** | `deck_style_analyzer`, `palette_service`, `palette_db_service` | 5 |
| **PPTX Import** | `pptx_importer`, `robust_pptx_importer`, `vision_pptx_importer` | 5 |
| **Email** | `email_service`, `email_ai_service`, `email_campaign_service` | 3 |
| **Integration** | `nango_service`, `integration_registry`, `firecrawl_service` | 6 |
| **Cache** | `image_cache`, `brand_cache_direct`, `context_cache` | 5 |
| **Analytics** | `analytics_service`, `analytics_dashboard_service` | 3 |
| **Other** | Billing, sharing, notifications, rendering, etc. | 44 |

### Agent System (44 modules in `agents/generation/`)

The generation system is built as a modular agent architecture:

| Module Category | Files | Purpose |
|----------------|-------|---------|
| **Orchestration** | `deck_composer_v2`, `slide_generator`, `concurrency_manager` | Deck-level coordination |
| **Image Pipeline** | `custom_component_image_pipeline`, `image_orchestrator`, `ai_image_orchestrator` | Image search/gen/injection |
| **Theme** | `theme_director`, `theme_resolver`, `theme_adapter`, `theme_enforcement` | Theme management |
| **Color** | `color_palette_manager`, `slide_color_extractor`, `color_contrast_manager` | Color handling |
| **Style** | `style_manifesto_builder`, `design_pattern_examples` | Style guide generation |
| **Custom Components** | `custom_component_generator`, `custom_component_prompts`, `custom_component_html` | HTML generation |
| **Post-Processing** | `slide_post_processor`, `custom_component_enhancer` | Output cleanup |
| **Infrastructure** | `infrastructure`, `progress_manager`, `events`, `exceptions`, `config` | Support systems |

### Background Jobs

**Worker:** `apps/workers/worker.py` (arq + Redis)

- Async task queue for long-running operations
- Cron jobs for email campaigns, analytics aggregation
- Separate worker process from API server

### Rate Limiting

**Library:** slowapi

Per-endpoint configuration:
- Slide generation: 5/minute
- Chat: 30/minute
- Auth: 10/minute
- Admin: 60/minute

### Error Handling

- **Sentry** for error tracking (10% sample rate in production)
- Circuit breakers on Supabase connections (automatic backoff on failures)
- Request deduplication (prevent duplicate slide generations)
- Graceful degradation (continue generation on client disconnect)

---

## 10. Database Schema

### Supabase PostgreSQL (38 migrations)

#### Core Tables

| Table | Purpose |
|-------|---------|
| `decks` | Deck metadata (title, user_id, theme, status) |
| `slides` | Slide data (deck_id, components JSON, position) |
| `users` | User profiles (extends Supabase auth.users) |
| `deck_shares` | Share links (share_code, permissions, expiry) |
| `api_keys` | Developer API keys (hashed, with rate limits) |
| `credit_transactions` | Credit usage ledger |

#### Content Tables

| Table | Purpose |
|-------|---------|
| `community_decks` | Published decks for community gallery |
| `featured_decks` | Editor-picked featured decks |
| `showcase_upvotes` | Community upvotes on showcased decks |

#### Billing Tables

| Table | Purpose |
|-------|---------|
| `user_subscriptions` | Stripe subscription state |
| `billing_plans` | Plan definitions (Free/Starter/Pro) |

#### Notification Tables

| Table | Purpose |
|-------|---------|
| `notifications` | In-app notifications |
| `email_templates` | Email template storage |
| `email_campaigns` | Email campaign tracking |

#### Admin Tables

| Table | Purpose |
|-------|---------|
| `admin_users` | Admin role assignments |
| `growth_config` | Growth experiment configuration |
| `analytics_events` | Custom analytics events |

### Security

- **Row-Level Security (RLS)** on all user-data tables
- Users can only read/write their own data
- `service_role` key used for admin operations (bypasses RLS)
- Foreign key indexes for performance (migration 033)
- Overlapping policy consolidation (migration 034)

---

## 11. API & Integrations

### Developer API v1

**File:** `apps/backend/api/requests/api_public_v1.py`

REST API for programmatic deck creation:
- API key authentication (hashed storage)
- Concurrency control (max 3 concurrent generations per key)
- Webhook delivery for async generation completion
- Rate limiting per API key

### Google Slides/Drive Integration

**File:** `apps/backend/api/requests/api_google_integration.py` (~154KB)

- Import from Google Slides
- Export to Google Slides
- Google Drive file picker integration
- OAuth2 token management

### Slack Bot

**File:** `apps/backend/api/requests/api_slack.py`

- Slash command for deck generation from Slack
- Interactive messages for deck previews
- Token encryption for secure storage

### Brand Intelligence

- **Brandfetch API** integration for company branding (logos, colors, fonts)
- Automatic brand detection from company names in prompts
- Brand cache with TTL for repeated lookups

### Web Scraping

- **Firecrawl** for clean web content extraction
- **Playwright** for JavaScript-rendered pages
- Used for URL-to-presentation conversion (`/website-to-ppt`)

### Email

- **Resend API** for transactional and campaign emails
- AI-powered email content generation
- Template-based email rendering

### Payments

- **Stripe** subscriptions with 3 tiers (Free / Starter / Pro)
- Webhook handling for subscription lifecycle events
- Credit-based usage system with plan-based allocations

---

## 12. Admin Dashboard

### Overview

13 admin pages accessible via `/admin/*` routes, protected by role-based access control.

| Page | Purpose |
|------|---------|
| `AdminAgent` | AI agent monitoring and configuration |
| `AdminAnalytics` | Usage analytics, growth metrics |
| `AdminUsersV2` | User management, search, detail views |
| `AdminUserDetail` | Individual user deep-dive |
| `AdminDecks` | Deck browsing, moderation |
| `AdminBrands` | Brand detection results, cache management |
| `AdminFonts` | Font library management |
| `AdminServices` | Integration status, service health |
| `AdminCosts` | AI provider cost tracking and analysis |
| `AdminGrowth` | Growth experiments, community, leads |
| `AdminEmail` | Email campaigns, templates |
| `AdminPlayground` | AI model testing sandbox |
| `AdminSeed` | Data seeding for development |

### AdminApi Client

**File:** `apps/frontend/src/services/adminApi.ts` (~2,059 lines)

Singleton API client with typed endpoints:

```typescript
class AdminApi {
  private async request<T>(path: string, options?: RequestInit): Promise<T>
  // ... typed methods for each admin endpoint
}

export const adminApi = new AdminApi();
```

Auth: Supabase session token passed in Authorization header.

### Access Control

**Backend:** `verify_admin_role` dependency on all admin endpoints
- Returns `{ user_id, user_email, role, permissions }`
- Stored in `admin_users` table
- Service role key for Supabase operations

---

## 13. Presentation & Sharing

### Presentation Mode

- Fullscreen rendering via Fullscreen API
- Keyboard navigation (arrow keys, space, Escape)
- Touch/swipe navigation for mobile
- Mobile optimization: renders at half resolution (960×540) to prevent crashes
- Slide transitions (fade, slide)

### Share System

| Route | Purpose |
|-------|---------|
| `/p/:shareCode` | View-only shared deck |
| `/e/:shareCode` | Editable shared deck |
| `/embed/:shareCode` | Embeddable iframe version |

- Share codes are unique, URL-safe strings
- Optional password protection
- Expiry dates
- View tracking (analytics)

### Public Profiles

- `/u/:username` — Public user profile with published decks
- Community gallery with upvote system
- SEO-optimized landing pages per deck

### oEmbed

oEmbed support for rich embeds in Slack, Notion, and other platforms.

---

## 14. Security Model

### Authentication

- **Supabase Auth** — email/password, Google OAuth, magic links
- Session-based with JWT tokens
- Automatic token refresh

### Authorization

- **RLS (Row-Level Security)** on all user tables in PostgreSQL
- `service_role` key for admin operations (bypasses RLS)
- `verify_admin_role` dependency for admin API endpoints
- API key authentication for developer API

### Rate Limiting

- Per-endpoint rate limits via slowapi
- Per-API-key limits for developer API
- Global concurrency limits (200 concurrent slide generations)
- Per-user concurrency limits (50 slides, 10 decks)

### Data Security

- API keys stored as hashes (not plaintext)
- Slack tokens encrypted via `cryptography` library
- XSS prevention: DOMPurify in frontend
- CORS restricted to known origins
- Environment variables for all secrets (never in code)

---

## 15. Observability & Analytics

### Error Tracking

- **Sentry** — Error tracking with 10% sample rate
- Structured error metadata (user_id, deck_id, slide_index)
- Source maps uploaded for frontend debugging

### Product Analytics

- **PostHog** — Event tracking, funnels, feature flags
- Key events: deck_created, slide_generated, share_created, subscription_started
- LLM cost tracking per invocation

### LLM Debugging

- **LangSmith** — Optional LLM trace logging
- Full prompt/response capture for debugging generation issues
- Token usage and latency tracking

### Custom Analytics

- Deck view tracking (anonymous + authenticated)
- Share link click tracking
- Generation metrics (time, model, token usage, success rate)
- Admin dashboard for real-time metrics

---

## 16. Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| **Backend Runtime** | Python 3.12, FastAPI, Pydantic v2, asyncio |
| **Task Queue** | arq (Redis-backed async worker) |
| **Frontend Runtime** | React 18, TypeScript 5, Vite 5 |
| **State Management** | Zustand (20 stores) |
| **Styling** | Tailwind CSS 3, shadcn/ui (Radix) |
| **Database** | Supabase PostgreSQL (38 migrations) |
| **Auth** | Supabase Auth (email, Google OAuth, magic links) |
| **File Storage** | Supabase Storage (deck-assets bucket) |
| **Real-time** | Supabase Realtime (WebSocket subscriptions) |
| **AI — Generation** | Google Gemini 3.1 Pro (primary), Claude Opus (fallback) |
| **AI — Reasoning** | Claude Sonnet 4.5/4.6 |
| **AI — Fast** | Gemini 3 Flash |
| **AI — Search** | Perplexity Sonar Pro |
| **AI — Images** | Gemini Image API, DALL-E (GPT Image 1) |
| **AI — Structured Output** | Instructor (Pydantic validation across providers) |
| **Image Search** | SerpAPI (Google Images) |
| **Payments** | Stripe (subscriptions + credits) |
| **Email** | Resend API |
| **Brand Data** | Brandfetch API |
| **Web Scraping** | Firecrawl, Playwright |
| **Hosting** | Render (static + web + Docker) |
| **Serverless** | Modal (optional GPU workloads) |
| **Monitoring** | Sentry (errors), PostHog (analytics), LangSmith (LLM) |
| **CI/CD** | Auto-deploy on push (Render) |
