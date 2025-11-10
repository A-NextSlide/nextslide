# NextSlide Unified Outline Experience - Documentation Index

## Overview

This documentation package provides a complete analysis of NextSlide's current architecture and a detailed foundation for building a unified outline experience. All documents are located in the project root directory.

**Total Documentation:** 1,762 lines across 3 comprehensive guides

## Documents

### 1. ARCHITECTURE_SUMMARY.md (701 lines, 20KB)

**Purpose:** Complete reference for current system architecture

**Contents:**
- Page structure and routing (Index.tsx, DeckList.tsx)
- Outline experience component hierarchy
- Chat panel message handling (ChatMessage.tsx)
- API endpoints and flows (OutlineAPI, backend endpoints)
- State management patterns (Zustand stores, window globals)
- Animation and transition patterns (Framer Motion)
- File upload and media handling
- Hooks and service architecture
- Key data types (DeckOutline, SlideOutline, StreamingEvent)
- "Create with AI" complete user flow
- Implementation patterns (streaming, lifting, deduplication)
- Configuration files
- Recent changes on html branch

**Best For:**
- Understanding how the system currently works
- Finding file locations and relationships
- Learning existing patterns and conventions
- Understanding data flow from user action to UI update

**Key Sections:**
- Section 1: Page structure & routing (where users start)
- Section 4: API endpoints (how frontend communicates with backend)
- Section 10: Complete "Create with AI" flow (end-to-end journey)

---

### 2. IMPLEMENTATION_GUIDE.md (705 lines, 24KB)

**Purpose:** Code patterns and real implementation examples

**Contents:**
- File paths and directory structure (Frontend/Backend)
- 8 detailed code pattern examples with actual code snippets:
  1. Outline generation streaming (XHR-based)
  2. State lifting pattern (parent to child)
  3. Streaming event processing (handling SSE events)
  4. Deck generation from outline (full flow)
  5. Chat message component logic (conditional rendering)
  6. Resizable panel pattern (requestAnimationFrame throttling)
  7. Backend streaming endpoint (Python/async)
  8. Theme store pattern (Zustand store)
- Common patterns and best practices
- Testing and debugging tips

**Best For:**
- Copy-paste starting points for similar features
- Understanding proven patterns in the codebase
- Debugging by comparing with working examples
- Learning the specific coding style used

**Key Code Examples:**
- SSE streaming with XHR (not fetch) for reliability
- RequestAnimationFrame for throttled resize operations
- Zustand store patterns with getters/setters
- Progressive outline assembly (out-of-order event handling)

---

### 3. PRD_FOUNDATION.md (356 lines, 12KB)

**Purpose:** Product requirements and implementation strategy

**Contents:**
- Executive summary of current state
- Key findings about architecture
- Opportunities for improvement
- Proposed unified outline experience
- Detailed user journey (step-by-step)
- 5 Architecture changes required:
  1. State management (new OutlineStore)
  2. UI layout changes (modal vs fullscreen)
  3. Component reorganization
  4. API flow updates
  5. Cross-page communication
- 5 Detailed design decisions with options
- 4-phase implementation roadmap (8 weeks)
- Success metrics
- Open questions for product team
- Risk mitigation strategies
- File paths for new/modified files
- References to other documentation

**Best For:**
- Planning the PRD document
- Understanding design trade-offs
- Getting alignment from product team
- Scoping implementation work
- Identifying risks and mitigation

**Key Decisions:**
- Recommendation: Split panel + fullscreen /outline/:outlineId route
- State persistence via Zustand + SessionStorage
- Streaming progress shown in multiple indicators
- Allow editing during generation (with constraints)
- Theme selection before + during generation

---

## Quick Reference by Use Case

### I want to understand how the current system works
Start with: **ARCHITECTURE_SUMMARY.md**
- Section 1: Page structure
- Section 10: Create with AI flow
- Section 7: File structure overview

### I need to build a similar feature
Start with: **IMPLEMENTATION_GUIDE.md**
- Find the pattern that matches your use case
- Copy the code example
- Adapt for your specific needs

### I need to propose a new feature or change
Start with: **PRD_FOUNDATION.md**
- Understand current state and limitations
- Review design decisions and trade-offs
- Use as template for your PRD

### I'm debugging a problem in outline generation
Cross-reference:
1. ARCHITECTURE_SUMMARY.md - Section 4: API endpoints
2. IMPLEMENTATION_GUIDE.md - Pattern 1: Outline streaming
3. Then check specific files mentioned in both

### I'm implementing the unified outline experience
Use all three:
1. PRD_FOUNDATION.md - For overall strategy and phasing
2. ARCHITECTURE_SUMMARY.md - For understanding current pieces
3. IMPLEMENTATION_GUIDE.md - For code patterns to follow

---

## Key File Paths Reference

### Most Important Frontend Files
```
/apps/frontend/src/
├─ pages/
│  ├─ Index.tsx (slides editor entry, 190 lines)
│  └─ DeckList.tsx (outline hub, 1700 lines)
├─ components/outline/
│  ├─ OutlineEditor.tsx (main interface, 1344 lines)
│  ├─ ChatMessage.tsx (message display, 550 lines)
│  └─ [other outline components]
├─ hooks/
│  ├─ useOutlineChat.ts (streaming, 1458 lines)
│  ├─ useOutlineManager.ts (state management)
│  └─ useSlideGeneration.ts (progress tracking)
├─ services/
│  ├─ outlineApi.ts (API client, 1462 lines)
│  └─ generation/GenerationCoordinator.ts
└─ stores/
   ├─ deckStore.ts (main state)
   ├─ themeStore.ts (theme management)
   └─ [other stores]
```

### Most Important Backend Files
```
/apps/backend/
├─ api/requests/
│  ├─ api_outline_agent.py (agent endpoint)
│  ├─ api_outline_chat.py (chat editing)
│  └─ api_deck_compose_stream.py (streaming composition)
├─ agents/
│  ├─ generation/deck_composer.py (LangGraph workflow)
│  └─ config.py (agent settings)
└─ models/requests.py (data models)
```

---

## Understanding the Architecture Layers

### Frontend Layers
```
User Interface (Components)
  ↓
State Management (Zustand stores)
  ↓
Business Logic (Hooks with useCallback)
  ↓
API Client (outlineApi, services)
  ↓
HTTP / WebSocket
```

### Data Flow: Create with AI
```
User Input
  → DeckList (capture idea, files)
  → GenerationCoordinator (prevent duplicates)
  → outlineApi.generateOutlineStream()
  → Backend: /api/generate-outline-stream
  → SSE Events (outline_structure, slide_complete, etc.)
  → useOutlineChat.handleProgressUpdate()
  → updateCurrentOutline() → UI re-renders
  → User sees slides appearing progressively
  → generateDeckFromOutline()
  → Backend: /compose-deck-stream
  → Another SSE stream (slide_started, slide_complete, etc.)
  → Navigate to /deck/:deckId when ready
  → SlideEditor shows slides populated with content
```

---

## Development Workflow

### To add a new API endpoint:
1. Check IMPLEMENTATION_GUIDE.md Pattern 1 for streaming pattern
2. Add endpoint to /apps/backend/api/requests/api_*.py
3. Add frontend method to outlineApi.ts
4. Test with debug output (see IMPLEMENTATION_GUIDE.md Testing section)

### To add a new UI component:
1. Check ARCHITECTURE_SUMMARY.md for similar components
2. Check IMPLEMENTATION_GUIDE.md for code patterns
3. Use ChatMessage.tsx or OutlineEditor.tsx as template
4. Integrate state via hooks from useOutlineChat pattern

### To fix state management issue:
1. Check IMPLEMENTATION_GUIDE.md Pattern 8: Theme Store
2. Review current store in ARCHITECTURE_SUMMARY.md Section 5
3. Use Zustand pattern shown in examples
4. Add debug output to window.__[storeName] for debugging

---

## Common Tasks & Where to Find Info

| Task | Document | Section |
|------|----------|---------|
| Add new slide to outline | ARCH §2 | Outline State Management |
| Handle streaming event | IMPL §3 | Event Processing Pattern |
| Create new Zustand store | IMPL §8 | Theme Store Pattern |
| Fix chat message rendering | IMPL §5 | Message Component Logic |
| Resize UI elements | IMPL §6 | Resizable Panel Pattern |
| Add API endpoint | IMPL §1,7 | Streaming Examples |
| Understand data types | ARCH §9 | Key Data Types |
| Debug generation issue | ARCH §10 | Create with AI Flow |
| Design new feature | PRD §1-2 | Current State & Opportunities |
| Plan implementation | PRD §4-6 | Architecture Changes & Roadmap |

---

## Documentation Generation Notes

**Created:** 2025-11-08
**Branch:** html (contains outline enhancements)
**Scope:** Current production code analysis + PRD foundation

**Document Statistics:**
- Total lines: 1,762
- Total size: 56KB
- Sections: 13 in summary, 8 patterns in guide, 5 designs in PRD
- Code examples: 25+ real code snippets
- File paths: 50+ current files referenced

---

## How to Use This Documentation

### For Product Managers:
1. Read PRD_FOUNDATION.md (30 min)
2. Review success metrics and roadmap
3. Use to align with engineering team

### For Engineers:
1. Start with ARCHITECTURE_SUMMARY.md (45 min)
2. Deep dive into relevant sections
3. Check IMPLEMENTATION_GUIDE.md for code examples
4. Use for implementation and debugging

### For Designers:
1. Review ARCHITECTURE_SUMMARY.md Sections 2, 3, 6
2. Check current components and animations
3. Use PRD_FOUNDATION.md for UI/UX decisions

### For DevOps:
1. Check ARCHITECTURE_SUMMARY.md Section 12
2. Review backend structure in IMPLEMENTATION_GUIDE.md
3. Configuration files listed in both documents

---

## Next Steps

After reviewing this documentation:

1. **Clarify Requirements** (PRD_FOUNDATION.md)
   - Answer open questions from Section "Open Questions for Product"
   - Make decisions on UI layout, state persistence, etc.

2. **Technical Planning** (ARCHITECTURE_SUMMARY.md + IMPLEMENTATION_GUIDE.md)
   - Map out required changes
   - Identify integration points
   - Plan new components/stores needed

3. **Implementation** (IMPLEMENTATION_GUIDE.md)
   - Start with Phase 1 from PRD
   - Use code patterns as templates
   - Follow existing conventions

4. **Testing & Validation**
   - Test streaming with debug output (See IMPLEMENTATION_GUIDE.md)
   - Validate state management
   - Performance testing for large outlines

---

## Glossary

- **Outline:** Presentation structure with slide titles and content
- **DeckOutline:** TypeScript type for outline data (frontend)
- **DeckCompose:** Process of turning outline into full slides
- **SSE:** Server-Sent Events (streaming protocol)
- **StreamingEvent:** Type for progress updates during generation
- **useOutlineManager:** Hook for outline state management
- **GenerationCoordinator:** Service preventing duplicate generations
- **Zustand:** State management library (like Redux but simpler)
- **SessionStorage:** Browser storage that clears on tab close
- **XHR:** XMLHttpRequest (used for better SSE handling than fetch)
- **RequestAnimationFrame:** Browser API for smooth animations/updates

---

**Questions or clarifications needed?** Check the relevant document sections above, or review the source files listed in the file paths section.

