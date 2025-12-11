# NextSlide Editor Refactoring Plan

## Executive Summary

This plan simplifies the entire editing architecture following modern best practices from Anthropic and Google. The core principle: **Give AI full control with simple, powerful tools.**

### Overall Progress: 70% Complete

| Component | Status |
|-----------|--------|
| Backend Orchestrator | ✅ Complete |
| Backend Tools | ✅ Complete |
| Backend Config | ⏳ 80% (cleanup legacy) |
| Frontend Hooks | ⏳ 20% (1/5 extracted) |
| ChatPanel Refactor | ❌ Not started |

### 🚨 Immediate Action Items (Do Now)

1. **🔴 CRITICAL: Add targeted edit tools** - Current `edit_slide` does FULL REWRITE, not targeted edits
2. **Add `selected_component_ids` to orchestrator** - Fix "make this red" not working
3. **Add `reorder_slides` and `duplicate_slide` tools** - Common operations missing
4. **Clean legacy aliases from config.py** - 40 lines of dead code
5. **Extract 4 more hooks from ChatPanel** - Reduce from 4932 to ~1500 lines

---

## 🔴 CRITICAL GAP: Targeted Edits vs Full Rewrites

### The Problem

The current implementation does **FULL REWRITES** when users ask for **TARGETED EDITS**.

| User Says | Expected | Current Behavior |
|-----------|----------|------------------|
| "Make this title red" | Change 1 CSS property | Regenerate entire slide |
| "Change the number to $5M" | Find/replace text | Regenerate entire HTML |
| "Make the heading bigger" | Change font-size | Delete + recreate all components |

**Root Cause**: `_edit_standard_components()` in `slide_tools.py` (lines 395-426):
```python
# PROBLEM: Removes ALL components and regenerates!
for c in components:
    if _get_attr(c, 'type') != 'Background':
        deck_diff.remove_component(slide_id, _get_attr(c, 'id'))

# Then generates new ones from scratch
for component in response.components:
    deck_diff.add_component(slide_id, comp_dict)
```

### Industry Best Practices

| Tool | Approach | Key Insight |
|------|----------|-------------|
| **Cursor** | SEARCH/REPLACE diffs | Only touches lines that need to change |
| **Aider** | Unified diff format | `<<<<<<< SEARCH` / `>>>>>>> REPLACE` blocks |
| **Claude Code** | `search_replace` tool | Exact string match → targeted replacement |
| **Cody** | AST-aware edits | Understands code structure, edits nodes |

**The Pattern**: All modern AI code editors use **surgical replacements**, not full rewrites.

### The Solution: Tiered Edit Strategy

```
User Request → Classify Intent → Route to Appropriate Tool

┌─────────────────────────────────────────────────────────────────┐
│                    EDIT CLASSIFICATION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  "Make title red" ────────────► str_replace (targeted)          │
│  "Change $2M to $5M" ─────────► str_replace (targeted)          │
│  "Move image to left" ────────► prop_update (property change)   │
│  "Add a chart" ───────────────► create_component (additive)     │
│  "Redesign this slide" ───────► full_rewrite (explicit request) │
│  "Make it completely new" ────► full_rewrite (explicit request) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Missing Tools (To Implement)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `str_replace` | Find/replace text in HTML | Text changes, color changes, CSS tweaks |
| `prop_update` | Update component props | Position, size, font-size (non-HTML) |
| `view_component` | Get component details | Before editing (know what to change) |
| `view_slide` | Get full slide context | Cross-slide operations |

### Implementation Plan

#### 1. Add `custom_component_str_replace` Tool

```python
def custom_component_str_replace(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    **kwargs,
) -> DeckDiff:
    """
    Targeted string replacement in CustomComponent HTML.
    Like Cursor's SEARCH/REPLACE - surgical, preserves everything else.
    
    Args:
        args: {
            "component_id": str,
            "old_string": str,  # Exact match to find
            "new_string": str,  # Replacement
        }
    """
    component_id = args.get('component_id')
    old_string = args.get('old_string')
    new_string = args.get('new_string')
    
    # Find component
    component = find_component(current_slide, component_id)
    if not component or component.get('type') != 'CustomComponent':
        raise ValueError(f"CustomComponent {component_id} not found")
    
    current_html = component.get('props', {}).get('render', '')
    
    # CRITICAL: Exact match replacement (like Cursor)
    if old_string not in current_html:
        raise ValueError(f"Could not find: {old_string[:100]}...")
    
    new_html = current_html.replace(old_string, new_string, 1)  # Replace first occurrence
    
    # Build minimal diff
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        current_slide['id'],
        component_id,
        ComponentDiffBase(id=component_id, type="CustomComponent", props={"render": new_html})
    )
    
    return deck_diff
```

#### 2. Add `prop_update` Tool (Non-AI, Mechanical)

```python
def prop_update(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    **kwargs,
) -> DeckDiff:
    """
    Direct property update - no AI needed.
    For position, size, colors, font-size changes on standard components.
    
    Args:
        args: {
            "component_id": str,
            "updates": {"fontSize": 48, "textColor": "#FF0000"}
        }
    """
    component_id = args.get('component_id')
    updates = args.get('updates', {})
    
    component = find_component(current_slide, component_id)
    if not component:
        raise ValueError(f"Component {component_id} not found")
    
    # Merge updates into existing props
    current_props = component.get('props', {})
    new_props = {**current_props, **updates}
    
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        current_slide['id'],
        component_id,
        ComponentDiffBase(id=component_id, type=component['type'], props=new_props)
    )
    
    return deck_diff
```

#### 3. Modify `edit_slide` to Route Appropriately

```python
def edit_slide(args, deck_data, current_slide, **kwargs) -> DeckDiff:
    """
    Smart router for slide edits.
    
    CRITICAL: Only do full rewrite when user explicitly asks!
    """
    instruction = args.get('instruction', '').lower()
    
    # Detect explicit rewrite requests
    REWRITE_KEYWORDS = ['redesign', 'completely', 'from scratch', 'new layout', 
                        'rebuild', 'make it different', 'transform into']
    wants_rewrite = any(kw in instruction for kw in REWRITE_KEYWORDS)
    
    if wants_rewrite:
        # Full rewrite - user explicitly asked
        return _full_slide_rewrite(args, current_slide)
    
    # Check if it's a simple property change
    has_custom = any(c.get('type') == 'CustomComponent' for c in current_slide.get('components', []))
    
    if has_custom:
        # Route to str_replace for targeted HTML edit
        return _targeted_html_edit(args, current_slide)
    else:
        # Route to prop_update for simple property changes
        return _targeted_prop_edit(args, current_slide)
```

### Updated Tool Registry (12 Tools)

| Tool | Purpose | AI Required? | Rewrites? |
|------|---------|--------------|-----------|
| `edit_slide` | Smart router for slide edits | Depends | Routes |
| `str_replace` | Targeted HTML replacement | No | No |
| `prop_update` | Update component props | No | No |
| `view_component` | Get component details | No | No |
| `view_slide` | Get slide details | No | No |
| `create_slide` | Create new slide | Yes | N/A |
| `delete_slide` | Remove slide | No | N/A |
| `duplicate_slide` | Copy slide | No | N/A |
| `reorder_slides` | Move slide | No | N/A |
| `create_component` | Add component | Yes | N/A |
| `delete_component` | Remove component | No | N/A |
| `apply_theme` | Apply colors/fonts | Yes | No |

### Orchestrator Prompt Update

The orchestrator should prefer non-AI tools when possible:

```python
TOOL_SELECTION_GUIDE = """
TOOL PRIORITY (prefer faster, non-AI tools):

1. **str_replace** (FASTEST) - For text/color/CSS changes in CustomComponents
   "Make title red" → str_replace with old="color:#333" new="color:#ff0000"
   
2. **prop_update** (FAST) - For position/size/property changes
   "Move this to the right" → prop_update with updates={position:{x:1000}}
   
3. **edit_component** (AI) - Only when str_replace/prop_update insufficient
   "Rewrite this paragraph to be more concise"
   
4. **edit_slide** (AI) - Only for content generation on EMPTY slides
   "Add bullet points about AI" (on blank slide)
   
5. **full_rewrite** - ONLY when user says "redesign", "completely different", etc.

NEVER do full rewrite for simple changes like colors, fonts, text updates!
"""
```

### Model Strategy (Simple)
- **Gemini 3 Pro** → All hard/creative tasks (slide generation, component creation, rewrites)
- **Claude Haiku** → All fast/simple tasks (routing decisions, validation, simple edits)
- **Claude Opus** → Fallback only (rate limits)

### Architecture Philosophy
1. **Single-pass orchestration** (not 3-phase) ✅
2. **Simple tools that do one thing well** ✅
3. **Let AI generate, then post-process** (not pre-constrain) ✅
4. **Delete dead code aggressively** ⏳

---

## Phase 1: Clean Up Dead Code (Day 1) ✅ MOSTLY COMPLETE

### 1.1 Delete Unused Files

| File | Lines | Status | Action |
|------|-------|--------|--------|
| `agents/editing/tools/claude_tools.py` | 1,019 | ✅ DELETED | Done |
| `agents/editing/conversational_agent.py` | ~400 | ✅ DELETED | Done |
| `agents/editing/tools/images.py` | ~200 | ✅ KEPT | Used for image search |

### 1.2 Current Tool Files (Consolidated)

```
agents/editing/tools/
├── slide_tools.py       # 521 lines - edit_slide, create_slide, delete_slide
├── component_tools.py   # 294 lines - edit_component, create_component, delete_component
├── theme_tools.py       # 359 lines - apply_theme
├── tool_executor.py     # 77 lines  - routes tool calls
├── fuzzy_matcher.py     # Utility for component matching
├── html_validator.py    # Validates CustomComponent HTML
└── images.py            # Image search utilities
```

**Total: 8 files (down from ~28)**

### 1.2 Simplify Config

**Current** (`config.py`): 17+ model assignments scattered everywhere

**New** (`config.py`):
```python
# ═══════════════════════════════════════════════════════════════
# MODEL STRATEGY - Simple: Gemini for hard, Haiku for easy, Opus fallback
# ═══════════════════════════════════════════════════════════════

# Hard tasks (creative generation, complex reasoning)
MODEL_HARD = "gemini-3-pro-preview"

# Easy tasks (routing, validation, simple edits)
MODEL_EASY = "claude-haiku-4-5"

# Fallback (rate limits only)
MODEL_FALLBACK = "claude-opus-4-5"

# Research (web search)
MODEL_RESEARCH = "perplexity-sonar-pro"

# ═══════════════════════════════════════════════════════════════
# TASK → MODEL MAPPING (single source of truth)
# ═══════════════════════════════════════════════════════════════
TASK_MODELS = {
    # Orchestration
    "orchestrator": MODEL_EASY,      # Was Opus - Haiku is fast enough for tool routing

    # Generation (creative)
    "slide_generate": MODEL_HARD,
    "component_create": MODEL_HARD,
    "component_edit": MODEL_HARD,
    "custom_component_rewrite": MODEL_HARD,
    "theme_generate": MODEL_HARD,

    # Simple tasks
    "composer_route": MODEL_EASY,    # SIMPLE vs CREATIVE decision
    "validation": MODEL_EASY,
    "context_build": MODEL_EASY,
    "brand_detect": MODEL_EASY,

    # Research
    "outline_research": MODEL_RESEARCH,

    # Fallback
    "fallback": MODEL_FALLBACK,
}

def get_model(task: str) -> str:
    """Get model for a task. Single source of truth."""
    return TASK_MODELS.get(task, MODEL_EASY)
```

---

## Phase 2: Simplify Orchestrator (Day 1-2) ✅ COMPLETE

### 2.1 Problems Solved

| Problem | Solution | Status |
|---------|----------|--------|
| 3-phase execution | Single-pass orchestration | ✅ Done |
| Tool reordering | Execute in order | ✅ Done |
| Multiple LLM retries | Simple error handling | ✅ Done |
| 671 lines | 414 lines | ✅ Done |

**Current file**: `agents/editing/orchestrator_v2.py` (414 lines)

### 2.2 New Orchestrator Design

**File**: `agents/editing/orchestrator_v2.py` (~200 lines)

```python
"""
Simple single-pass orchestrator.
- One LLM call
- Execute tools in order
- No phase complexity
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field, create_model
from models.deck import DeckDiff, DeckDiffBase
from agents.ai.clients import get_client, invoke
from agents.config import get_model
from agents.editing.tools.registry_v2 import get_tools

class ToolCall(BaseModel):
    """A single tool invocation."""
    tool_name: str
    tool_args: Dict
    summary: str = Field(description="What this edit does")

class OrchestratorResponse(BaseModel):
    """LLM response with tool calls."""
    tool_calls: List[ToolCall]

SYSTEM_PROMPT = """You are a slide deck editor. Execute the user's request using tools.

RULES:
1. Use tools to make changes. Never output raw HTML/code.
2. Be precise - if user says "red", use red (#FF0000 or similar)
3. For creative requests, use appropriate generation tools
4. You can call multiple tools in one response

CANVAS: 1920x1080 pixels. Origin (0,0) top-left.
"""

async def orchestrate(
    deck_data: Dict,
    current_slide: Dict,
    user_message: str,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """Single-pass orchestration. One LLM call, execute tools."""

    # Get tools for this request
    tools, execute_tool = get_tools(deck_data, current_slide, attachments)

    # Build context
    context = build_context(deck_data, current_slide, attachments)

    # Single LLM call
    client, model = get_client(get_model("orchestrator"))

    response = invoke(
        client=client,
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context}\n\nUSER REQUEST: {user_message}"}
        ],
        response_model=OrchestratorResponse,
        max_tokens=8192,
    )

    # Execute tools sequentially
    deck_diff = DeckDiff(DeckDiffBase())

    for tool_call in response.tool_calls:
        try:
            tool_diff = await execute_tool(
                tool_call.tool_name,
                tool_call.tool_args,
                deck_data,
                deck_diff,
            )
            deck_diff = deck_diff.merge(tool_diff)
        except Exception as e:
            logger.warning(f"Tool {tool_call.tool_name} failed: {e}")
            continue

    return deck_diff

def build_context(deck_data: Dict, current_slide: Dict, attachments: List) -> str:
    """Build concise context for LLM."""
    # Slide summary
    slide_summary = summarize_slide(current_slide)

    # Attachment info
    att_info = ""
    if attachments:
        att_info = "\n".join([f"- {a['name']}: {a['url']}" for a in attachments])
        att_info = f"\nATTACHMENTS:\n{att_info}"

    return f"""CURRENT SLIDE:
{slide_summary}
{att_info}"""
```

### 2.3 Key Changes

| Before | After |
|--------|-------|
| 3-phase execution with view_slide | Single pass (include cross-slide context in prompt if needed) |
| Tool reordering (fonts last) | Execute in order (trust LLM) |
| 671 lines | ~200 lines |
| Retry on HTML output | Simple error handling |
| Claude Opus for orchestration | Claude Haiku (fast, cheap) |

---

## Phase 3: Simplify Tools (Day 2-3) ✅ COMPLETE

### 3.1 Tool Consolidation: Done

**Before**: 28 tools across 19 files
**After**: 7 tools across 3 core files (+ 2 missing tools to add)

### 3.2 Current Tool Architecture

| Tool | File | Status | Model |
|------|------|--------|-------|
| `edit_slide` | slide_tools.py | ✅ | Gemini 3 Pro |
| `create_slide` | slide_tools.py | ✅ | Gemini 3 Pro |
| `delete_slide` | slide_tools.py | ✅ | None |
| `edit_component` | component_tools.py | ✅ | Gemini 3 Pro |
| `create_component` | component_tools.py | ✅ | Gemini 3 Pro |
| `delete_component` | component_tools.py | ✅ | None |
| `apply_theme` | theme_tools.py | ✅ | Haiku |
| `duplicate_slide` | slide_tools.py | ❌ TO ADD | None |
| `reorder_slides` | slide_tools.py | ❌ TO ADD | None |
| `search_web` | (in research/) | ⏳ Wire up | Perplexity |

### 3.3 The Key Insight: `edit_slide` Does Everything

**Current flow** (broken):
```
User: "Make a slide about AI trends"
→ Orchestrator calls: create_slide(title="AI Trends", content="...")
→ Result: Minimal slide with just text block
```

**New flow** (correct):
```
User: "Make a slide about AI trends"
→ Orchestrator calls: create_slide(instruction="Create a slide about AI trends with modern visuals")
→ Tool uses Gemini 3 Pro to generate FULL slide with proper components
→ Result: Beautiful slide with charts, icons, proper layout
```

### 3.4 New Tool Implementations

**File**: `agents/editing/tools/slide_tools.py`

```python
"""
Slide editing tools - simple, powerful, AI-driven.
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from models.deck import DeckDiff, DeckDiffBase
from agents.ai.clients import get_client, invoke
from agents.config import get_model

# ═══════════════════════════════════════════════════════════════
# TOOL ARGS (What LLM provides)
# ═══════════════════════════════════════════════════════════════

class CreateSlideArgs(BaseModel):
    """Create a new slide."""
    tool_name: str = "create_slide"
    instruction: str = Field(description="What the slide should contain/look like")
    insert_after: Optional[str] = Field(default=None, description="Slide ID to insert after")

class EditSlideArgs(BaseModel):
    """Edit an existing slide."""
    tool_name: str = "edit_slide"
    slide_id: str = Field(description="ID of slide to edit")
    instruction: str = Field(description="What to change")

class DeleteSlideArgs(BaseModel):
    """Delete a slide."""
    tool_name: str = "delete_slide"
    slide_id: str = Field(description="ID of slide to delete")

# ═══════════════════════════════════════════════════════════════
# TOOL IMPLEMENTATIONS
# ═══════════════════════════════════════════════════════════════

SLIDE_GENERATOR_PROMPT = """Generate a complete slide for a presentation.

OUTPUT FORMAT: Return a JSON object with this structure:
{
  "components": [
    {
      "type": "Background|TiptapTextBlock|Image|Chart|Shape|CustomComponent",
      "props": { ... component-specific properties ... }
    }
  ]
}

CANVAS: 1920x1080 pixels

COMPONENT TYPES:
- Background: gradient or solid color background
- TiptapTextBlock: text with position, fontSize, fontWeight, textColor
- Image: image with src, position, width, height
- Chart: bar/line/pie chart with data
- Shape: rectangle, circle, etc.
- CustomComponent: complex HTML/CSS (use for anything fancy)

DESIGN PRINCIPLES:
- Use visual hierarchy (larger = more important)
- Leave breathing room (don't crowd)
- Use consistent colors from the theme
- Make it look professional and modern
"""

async def create_slide(
    args: CreateSlideArgs,
    deck_data: Dict,
    theme: Dict = None,
) -> DeckDiff:
    """Create a new slide with AI-generated content."""

    client, model = get_client(get_model("slide_generate"))

    # Build prompt
    prompt = f"""{SLIDE_GENERATOR_PROMPT}

THEME: {theme or 'Use modern dark theme with gradients'}

USER REQUEST: {args.instruction}

Generate the slide components now."""

    # Call Gemini 3 Pro to generate slide
    response = invoke(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=SlideComponents,  # Pydantic model
        max_tokens=16000,
    )

    # Build slide
    slide = {
        "id": str(uuid.uuid4()),
        "components": [c.dict() for c in response.components]
    }

    # Add to diff
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slides_to_add.append(slide)

    return deck_diff

async def edit_slide(
    args: EditSlideArgs,
    deck_data: Dict,
    current_slide: Dict,
) -> DeckDiff:
    """Edit a slide - AI decides what to change.

    CRITICAL LOGIC:
    1. If slide is empty/blank → CREATE content (generate full slide)
    2. If slide has CustomComponent → REWRITE it
    3. If slide has standard components → EDIT them
    """

    components = current_slide.get('components', [])

    # Check what's on the slide
    non_background_components = [c for c in components if c.get('type') != 'Background']
    has_custom = any(c.get('type') == 'CustomComponent' for c in components)
    is_empty = len(non_background_components) == 0

    # CASE 1: Empty/blank slide → Generate full content
    if is_empty:
        logger.info(f"[edit_slide] Slide is empty, generating content")
        return await _generate_slide_content(args.instruction, current_slide)

    # CASE 2: Has CustomComponent → Rewrite it
    if has_custom:
        return await _rewrite_custom_component(args.instruction, current_slide)

    # CASE 3: Standard components → Edit them
    return await _edit_standard_components(args.instruction, current_slide)

async def _generate_slide_content(instruction: str, slide: Dict) -> DeckDiff:
    """Generate content for an empty slide."""

    client, model = get_client(get_model("slide_generate"))

    # Get background if exists (preserve it)
    background = next(
        (c for c in slide.get('components', []) if c.get('type') == 'Background'),
        None
    )

    prompt = f"""{SLIDE_GENERATOR_PROMPT}

EXISTING BACKGROUND: {background.get('props') if background else 'None - create one'}

USER REQUEST: {instruction}

Generate components for this slide. The slide is currently empty/blank.
Create visually appealing content that fulfills the user's request."""

    response = invoke(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=SlideComponents,
        max_tokens=16000,
    )

    # Build diff - add new components to existing slide
    deck_diff = DeckDiff(DeckDiffBase())

    for component in response.components:
        # Skip background if slide already has one
        if component.type == 'Background' and background:
            continue
        deck_diff.add_component(slide['id'], component.dict())

    return deck_diff

async def _rewrite_custom_component(instruction: str, slide: Dict) -> DeckDiff:
    """Rewrite CustomComponent HTML based on instruction."""

    # Find CustomComponent
    custom_comp = next(
        (c for c in slide.get('components', []) if c.get('type') == 'CustomComponent'),
        None
    )

    if not custom_comp:
        return DeckDiff(DeckDiffBase())

    current_html = custom_comp.get('props', {}).get('render', '')

    client, model = get_client(get_model("custom_component_rewrite"))

    prompt = f"""Edit this HTML component based on the user's request.

CURRENT HTML:
{current_html}

USER REQUEST: {instruction}

Return the complete updated HTML. Keep the same structure unless the request requires changing it.
Use Tailwind CSS classes. Single line, single quotes for attributes."""

    new_html = invoke(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=None,  # Raw HTML output
        max_tokens=16000,
    )

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide['id'],
        custom_comp['id'],
        {"props": {"render": new_html}}
    )

    return deck_diff
```

### 3.5 Files to Delete/Consolidate

| Current File | Lines | Action |
|--------------|-------|--------|
| `tools/claude_tools.py` | 1,019 | DELETE |
| `tools/component.py` | 883 | CONSOLIDATE → `component_tools.py` |
| `tools/slide.py` | 505 | CONSOLIDATE → `slide_tools.py` |
| `tools/slide_ops.py` | 544 | CONSOLIDATE → `slide_tools.py` |
| `tools/theme_bridge.py` | 947 | SIMPLIFY → `theme_tools.py` (300 lines) |
| `tools/custom_component_edit.py` | 304 | KEEP (simplified) |
| `tools/custom_component_media.py` | 517 | CONSOLIDATE into edit |
| `tools/composer.py` | 185 | DELETE (routing in orchestrator) |
| `tools/creative_editor.py` | 309 | CONSOLIDATE into custom_component_edit |
| `tools/simple_editor.py` | 117 | CONSOLIDATE into custom_component_edit |
| `tools/fuzzy_matcher.py` | 236 | KEEP |
| `tools/html_validator.py` | 140 | KEEP |

**Result**: 19 files → 8 files

---

## Phase 4: Simplify Registry (Day 3) ✅ COMPLETE

### 4.1 Current Implementation

**File**: `agents/editing/tools/tool_executor.py` (77 lines)

```python
# Actual implementation (already exists)
TOOLS = {
    "edit_slide": edit_slide,
    "create_slide": create_slide,
    "delete_slide": delete_slide,
    "edit_component": edit_component,
    "create_component": create_component,
    "delete_component": delete_component,
    "apply_theme": apply_theme,
}

def execute_tool(tool_name, tool_args, deck_data, current_slide, registry=None, attachments=None):
    if tool_name not in TOOLS:
        raise ValueError(f"Unknown tool: {tool_name}")
    return TOOLS[tool_name](args=tool_args, deck_data=deck_data, current_slide=current_slide, ...)
```

### 4.2 Tools to Add

Add these to `tool_executor.py`:
```python
"duplicate_slide": duplicate_slide,  # Add to slide_tools.py
"reorder_slides": reorder_slides,    # Add to slide_tools.py
```

---

## Phase 5: Refactor ChatPanel (Day 4-5) ⏳ IN PROGRESS

### 5.1 Current State

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Lines | 4,932 | ~1,500 | ❌ |
| State variables | ~78 | ~20 | ❌ |
| useEffect hooks | ~25 | ~8 | ❌ |
| Extracted hooks | 1 | 5 | ⏳ |

### 5.2 Hooks Status

| Hook | Status | Est. Lines |
|------|--------|------------|
| `useChatAttachments` | ✅ Done | 263 |
| `useAgentConnection` | ❌ To Extract | ~300 |
| `useChatMessages` | ❌ To Extract | ~400 |
| `useDeckDiff` | ❌ To Extract | ~200 |
| `useComponentSelection` | ❌ To Extract | ~200 |

### 5.3 Target Architecture

```
components/chat/
├── ChatPanel.tsx              # Container (~400 lines)
├── ChatMessages.tsx           # Message list (~300 lines)
├── ChatInput.tsx              # Input + attachments (~350 lines)
├── ChatSuggestions.tsx        # Chips (~100 lines)
├── blocks/                    # ✅ Already extracted
│   ├── OutlineChatBlock.tsx
│   └── ThemeChatBlock.tsx
└── hooks/
    ├── index.ts
    ├── useChatAttachments.ts  # ✅ Done
    ├── useAgentConnection.ts  # ❌ To Extract
    ├── useChatMessages.ts     # ❌ To Extract
    ├── useComponentSelection.ts # ❌ To Extract
    └── useDeckDiff.ts         # ❌ To Extract
```

### 5.3 Extract Custom Hooks

**Hook 1: `useAgentConnection`** (~150 lines)
```typescript
export function useAgentConnection(deckId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const clientRef = useRef<AgentChatClient | null>(null);

  const connect = useCallback(async () => {
    // Connection logic
  }, [deckId]);

  const send = useCallback(async (message: string, attachments?: File[]) => {
    // Send logic
  }, [sessionId]);

  const disconnect = useCallback(() => {
    // Cleanup
  }, []);

  return { isConnected, sessionId, connect, send, disconnect };
}
```

**Hook 2: `useFileAttachments`** (~100 lines)
```typescript
export function useFileAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback(async (files: File[]) => {
    // Upload and process files
  }, []);

  const removeFile = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
  }, []);

  return { attachments, isUploading, addFiles, removeFile, clear };
}
```

**Hook 3: `useDeckDiff`** (~100 lines)
```typescript
export function useDeckDiff(deckId: string) {
  const applyDiff = useCallback((diff: DeckDiff) => {
    // Apply diff to deck store
    const { deckData, updateDeckData } = useDeckStore.getState();
    const newData = applyDeckDiffPure(deckData, diff);
    updateDeckData(newData);
  }, [deckId]);

  const previewDiff = useCallback((diff: DeckDiff) => {
    // Preview without committing
  }, [deckId]);

  return { applyDiff, previewDiff };
}
```

### 5.4 Simplified ChatPanel

```typescript
// ChatPanel.tsx (~500 lines)
export function ChatPanel({ deckId, currentSlideId }: ChatPanelProps) {
  // Use extracted hooks
  const { isConnected, send } = useAgentConnection(deckId);
  const { attachments, addFiles, clear } = useFileAttachments();
  const { applyDiff } = useDeckDiff(deckId);
  const { messages, addMessage, updateMessage } = useChatMessages();

  // Handle send
  const handleSend = useCallback(async (text: string) => {
    addMessage({ role: 'user', content: text });

    const response = await send(text, attachments);

    if (response.deck_diff) {
      applyDiff(response.deck_diff);
    }

    addMessage({ role: 'assistant', content: response.summary });
    clear();
  }, [send, attachments, applyDiff, addMessage, clear]);

  return (
    <div className="chat-panel">
      <ChatMessages messages={messages} />
      <ChatInput
        onSend={handleSend}
        attachments={attachments}
        onAddFiles={addFiles}
      />
    </div>
  );
}
```

---

## Phase 6: Testing & Validation (Day 5-6)

### 6.1 Test Cases for Core Flows

1. **Create slide**: "Make a slide about AI trends"
   - Should generate full slide with visuals, not just text

2. **Edit slide**: "Change the title to red"
   - Should update component correctly

3. **Complex edit**: "Add a chart showing growth metrics"
   - Should create proper Chart component or CustomComponent

4. **Theme**: "Use Apple's colors"
   - Should detect brand and apply palette

### 6.2 Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Orchestrator latency | ~3s (3 phases) | <1s (single pass) |
| Tool files | 19 | 8 |
| ChatPanel lines | 4,932 | ~1,500 |
| Config model assignments | 17+ | 4 |

---

## Current Progress Status

### ✅ COMPLETED

| Component | Status | Lines | Notes |
|-----------|--------|-------|-------|
| `orchestrator_v2.py` | ✅ Done | 414 | Single-pass, working |
| `slide_tools.py` | ✅ Done | 521 | AI-powered generation |
| `component_tools.py` | ✅ Done | 294 | Clean |
| `theme_tools.py` | ✅ Done | 359 | Brandfetch + AI fallback |
| `tool_executor.py` | ✅ Done | 77 | Simple routing |
| `useChatAttachments.ts` | ✅ Done | 263 | Extracted hook |
| Tool consolidation | ✅ Done | 8 files | Down from ~28 |

### ⏳ REMAINING

| Component | Status | Lines | Notes |
|-----------|--------|-------|-------|
| `config.py` cleanup | ⏳ 70% | 223 | Has ~40 legacy aliases to delete |
| `ChatPanel.tsx` | ❌ Pending | 4932 | Need to extract 4 more hooks |
| Missing tools | ❌ Pending | - | `str_replace`, `prop_update`, `view_component` |
| Component selection | ⚠️ Partial | - | Sent but not parsed by orchestrator |

---

## Frontend-Backend Selection Flow

### Current Implementation (Traced)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SELECTION FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. USER CLICKS COMPONENT                                                   │
│     └─► SlideViewport.tsx → handleComponentSelect()                         │
│         └─► editorStore.selectComponent(component.id)                       │
│                                                                             │
│  2. CHAT PANEL TRACKS SELECTIONS                                            │
│     └─► ChatPanel.tsx → selectedElements state                              │
│         └─► [{elementId, elementType, slideId, label}]                      │
│                                                                             │
│  3. USER SENDS MESSAGE                                                      │
│     └─► ChatPanel.tsx → sendMessage()                                       │
│         └─► agentClientRef.current.sendMessage({                            │
│               selections: effectiveSelections,  ← SENT TO BACKEND           │
│               ...                                                           │
│             })                                                              │
│                                                                             │
│  4. BACKEND RECEIVES (api_agent_messages.py)                                │
│     └─► selections = body.get("selections", [])                             │
│         └─► INJECTS INTO MESSAGE: "[USER_SELECTIONS] comp_id (type)@slide"  │
│                                                                             │
│  5. ORCHESTRATOR RECEIVES (orchestrator_v2.py)                              │
│     └─► ⚠️ PROBLEM: Does NOT parse [USER_SELECTIONS] from message!          │
│         └─► build_context() has NO selection info                           │
│         └─► LLM doesn't know which component user selected                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Gap

The backend API injects selections into the message text as `[USER_SELECTIONS]`, but:
1. `orchestrator_v2.py` doesn't extract this
2. `build_context()` doesn't include selected component details
3. The LLM has no idea which component the user is referring to with "this"

### The Fix

#### Option A: Parse from Message (Quick Fix)

```python
# orchestrator_v2.py

def parse_selections_from_message(message: str) -> Tuple[str, List[Dict]]:
    """Extract [USER_SELECTIONS] from message."""
    selections = []
    clean_message = message
    
    if "[USER_SELECTIONS]" in message:
        # Extract selection part
        parts = message.split("[USER_SELECTIONS]")
        clean_message = parts[0].strip()
        selection_str = parts[1].split("\n")[0].strip()
        
        # Parse "comp_id (type)@slide_id" format
        for sel in selection_str.split(","):
            sel = sel.strip()
            # Parse component_id, type, slide_id
            if "(" in sel:
                cid = sel.split("(")[0].strip()
                rest = sel.split("(")[1]
                ctype = rest.split(")")[0] if ")" in rest else None
                sid = rest.split("@")[1] if "@" in rest else None
                selections.append({"id": cid, "type": ctype, "slide_id": sid})
    
    return clean_message, selections

def build_context(deck_data, current_slide, selections=None, ...):
    """Include selection context."""
    context = f"CURRENT SLIDE: {slide_id}\n..."
    
    if selections:
        # Get full component details for each selection
        sel_details = []
        for sel in selections:
            comp = find_component(current_slide, sel['id'])
            if comp:
                sel_details.append(format_component_details(comp))
        
        context += f"""
🎯 SELECTED COMPONENTS (user is referring to these with "this"):
{chr(10).join(sel_details)}

When user says "this", "it", or refers to the selection:
→ Use these component IDs for targeted edits
→ Prefer str_replace or prop_update over full rewrite
"""
    
    return context
```

#### Option B: Pass Selections as Separate Parameter (Better)

Modify the API to pass selections directly to orchestrator:

```python
# api_agent_messages.py
result = edit_deck(
    deck_data=deck_data,
    current_slide=current_slide,
    message=llm_message,
    selections=selections,  # Pass directly, don't embed in message
    ...
)

# orchestrator_v2.py
def orchestrate(
    deck_data: Dict,
    current_slide: Dict,
    user_message: str,
    selections: List[Dict] = None,  # NEW PARAMETER
    ...
)
```

### Frontend Improvements

#### 1. Show Selection Context in Chat

When component is selected, show it in the chat UI:

```tsx
// ChatInput.tsx
{selectedElements.length > 0 && (
  <div className="selection-chips">
    {selectedElements.map(sel => (
      <Chip key={sel.elementId} onRemove={() => removeSelection(sel.elementId)}>
        {sel.label || sel.elementType}
      </Chip>
    ))}
  </div>
)}
```

#### 2. Better Component Detection in DOM

Current: Uses data attributes to find components
Better: Use React refs for direct component access

```tsx
// useComponentSelection.ts
const handleElementClick = (e: MouseEvent) => {
  // Find closest component wrapper
  const componentEl = (e.target as HTMLElement).closest('[data-component-id]');
  if (componentEl) {
    const id = componentEl.getAttribute('data-component-id');
    const type = componentEl.getAttribute('data-component-type');
    selectComponent({ id, type });
  }
};
```

---

## Gap Analysis: User Scenario Testing

### ✅ Working Scenarios

| User Prompt | Tool Flow | Status |
|-------------|-----------|--------|
| "Make a slide about AI trends" | `edit_slide` → empty detection → generates | ✅ |
| "Change the title to red" | `edit_component` → AI updates props | ✅ |
| "Use Apple's branding" | `apply_theme` → Brandfetch → applies | ✅ |
| "Create a new slide about Q3 results" | `create_slide` → AI generates | ✅ |
| "Delete this slide" | `delete_slide` | ✅ |
| "Add a chart showing sales" | `create_component` type=Chart | ✅ |

### ⚠️ Scenarios With Gaps

| User Prompt | Issue | Fix Required |
|-------------|-------|--------------|
| "Make this text bigger" | No component selection context | Add `selected_component_ids` to orchestrator |
| "Move this to the right" | Same - which component? | Pass selection from frontend |
| "Swap slides 3 and 5" | No reorder tool | Add `reorder_slides` tool |
| "Duplicate this slide" | No duplicate tool | Add `duplicate_slide` tool |
| "Use same style as slide 2" | No cross-slide context | Add slide reference resolution |
| "Undo that" | No undo support | Frontend-only (store history) |

---

## Implementation Order (Updated)

### Phase 1: Backend Gaps (Day 1) 🔴 CRITICAL

#### 1.1 Add Targeted Edit Tools (CRITICAL)

Add to `slide_tools.py`:

```python
def str_replace(args, deck_data, current_slide, **kwargs) -> DeckDiff:
    """
    Cursor-style SEARCH/REPLACE for CustomComponent HTML.
    NO AI NEEDED - direct string replacement.
    
    Args: {"component_id": str, "old_string": str, "new_string": str}
    """
    component = find_component(current_slide, args['component_id'])
    html = component['props']['render']
    
    if args['old_string'] not in html:
        raise ValueError(f"Could not find: {args['old_string'][:100]}")
    
    new_html = html.replace(args['old_string'], args['new_string'], 1)
    
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(current_slide['id'], args['component_id'], 
        ComponentDiffBase(id=args['component_id'], type="CustomComponent", props={"render": new_html}))
    return deck_diff

def prop_update(args, deck_data, current_slide, **kwargs) -> DeckDiff:
    """
    Direct property update - NO AI NEEDED.
    For position, size, colors on standard components.
    
    Args: {"component_id": str, "updates": {"fontSize": 48, "textColor": "#FF0000"}}
    """
    component = find_component(current_slide, args['component_id'])
    new_props = {**component['props'], **args['updates']}
    
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(current_slide['id'], args['component_id'],
        ComponentDiffBase(id=args['component_id'], type=component['type'], props=new_props))
    return deck_diff

def view_component(args, deck_data, current_slide, **kwargs) -> Dict:
    """
    Get component details before editing.
    Returns component props so LLM knows what to change.
    """
    component = find_component(current_slide, args['component_id'])
    return {
        "id": component['id'],
        "type": component['type'],
        "props": component['props'],
        "html_preview": component['props'].get('render', '')[:2000] if component['type'] == 'CustomComponent' else None
    }
```

#### 1.2 Fix `_edit_standard_components` (CRITICAL)

Current behavior: DELETES ALL COMPONENTS and regenerates (BAD!)
New behavior: Only modify what's needed

```python
def _edit_standard_components(slide_id, components, instruction, attachments=None):
    """
    SMART EDIT - Only change what's necessary.
    """
    # Detect if this is a targeted edit or full redesign
    REWRITE_KEYWORDS = ['redesign', 'completely', 'from scratch', 'rebuild', 'transform']
    wants_rewrite = any(kw in instruction.lower() for kw in REWRITE_KEYWORDS)
    
    if wants_rewrite:
        # User explicitly asked for full rewrite - OK to regenerate
        return _full_component_rewrite(slide_id, components, instruction)
    
    # TARGETED EDIT: Use AI to generate prop updates, not full components
    prompt = f"""Analyze this edit request and return ONLY the property changes needed.

CURRENT COMPONENTS:
{format_components(components)}

USER REQUEST: {instruction}

Return a JSON object with targeted changes:
{{
  "changes": [
    {{"component_id": "xxx", "prop_updates": {{"textColor": "#FF0000"}}}}
  ]
}}

ONLY include properties that need to change. Do NOT regenerate entire components.
"""
    
    response = invoke(client, model, [{"role": "user", "content": prompt}], response_model=TargetedChanges)
    
    deck_diff = DeckDiff(DeckDiffBase())
    for change in response.changes:
        # Merge updates into existing component
        comp = find_component_by_id(components, change.component_id)
        new_props = {**comp['props'], **change.prop_updates}
        deck_diff.update_component(slide_id, change.component_id,
            ComponentDiffBase(id=change.component_id, type=comp['type'], props=new_props))
    
    return deck_diff
```

#### 1.3 Parse Selections in Orchestrator

```python
# orchestrator_v2.py

def parse_selections_from_message(message: str) -> Tuple[str, List[Dict]]:
    """Extract [USER_SELECTIONS] from message."""
    if "[USER_SELECTIONS]" not in message:
        return message, []
    
    parts = message.split("[USER_SELECTIONS]")
    clean_message = parts[0].strip()
    sel_str = parts[1].split("\n")[0].strip()
    
    selections = []
    for sel in sel_str.split(","):
        sel = sel.strip()
        if "(" in sel and "@" in sel:
            # Format: "comp_id (Type)@slide_id"
            cid = sel.split("(")[0].strip()
            ctype = sel.split("(")[1].split(")")[0]
            sid = sel.split("@")[1]
            selections.append({"id": cid, "type": ctype, "slide_id": sid})
    
    return clean_message, selections

def orchestrate(deck_data, current_slide, user_message, ...):
    # Parse selections
    clean_message, selections = parse_selections_from_message(user_message)
    
    # Include in context
    context = build_context(deck_data, current_slide, selections=selections)
    ...
```

#### 1.4 Add Utility Tools

```python
def reorder_slides(args, deck_data, current_slide, **kwargs) -> DeckDiff:
    """Move slide to new position. Args: {slide_id, new_index}"""
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.reorder_slide(args['slide_id'], args['new_index'])
    return deck_diff

def duplicate_slide(args, deck_data, current_slide, **kwargs) -> DeckDiff:
    """Copy slide with new IDs. Args: {slide_id}"""
    import copy
    original = next(s for s in deck_data['slides'] if s['id'] == args['slide_id'])
    new_slide = copy.deepcopy(original)
    new_slide['id'] = str(uuid.uuid4())
    for comp in new_slide.get('components', []):
        comp['id'] = str(uuid.uuid4())
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slides_to_add.append(new_slide)
    return deck_diff
```

#### 1.5 Clean Config Legacy Aliases
Delete lines 86-219 in `config.py` (all `LEGACY ALIASES` section).

### Phase 2: Frontend Hooks (Day 2)

#### 2.1 Extract `useAgentConnection`
```typescript
// src/components/chat/hooks/useAgentConnection.ts
export function useAgentConnection(deckId: string) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<AgentChatClient | null>(null);
  
  const connect = useCallback(async () => { /* ... */ }, [deckId]);
  const send = useCallback(async (msg, opts) => { /* ... */ }, [sessionId]);
  const disconnect = useCallback(() => { /* ... */ }, []);
  
  return { sessionId, isConnected, connect, send, disconnect, clientRef };
}
```

#### 2.2 Extract `useChatMessages`
```typescript
// src/components/chat/hooks/useChatMessages.ts
export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const addMessage = useCallback((msg) => setMessages(p => [...p, msg]), []);
  const updateMessage = useCallback((id, update) => { /* ... */ }, []);
  const removePending = useCallback((id) => { /* ... */ }, []);
  
  return { messages, addMessage, updateMessage, removePending, setMessages };
}
```

#### 2.3 Extract `useDeckDiff`
```typescript
// src/components/chat/hooks/useDeckDiff.ts
export function useDeckDiff() {
  const applyDiff = useCallback((diff: DeckDiff) => {
    const { deckData, updateDeckData } = useDeckStore.getState();
    const newData = applyDeckDiffPure(deckData, diff);
    updateDeckData(newData);
  }, []);
  
  return { applyDiff };
}
```

#### 2.4 Extract `useComponentSelection`
```typescript
// src/components/chat/hooks/useComponentSelection.ts
export function useComponentSelection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  
  // DOM event handlers for selection...
  return { selectedIds, isSelecting, startSelection, endSelection };
}
```

### Phase 3: ChatPanel Refactor (Day 3)

```
components/chat/
├── ChatPanel.tsx           # Container (~400 lines)
├── ChatMessages.tsx        # Message list (~300 lines)
├── ChatInput.tsx           # Input + attachments (~350 lines)
├── ChatSuggestions.tsx     # Chips (~100 lines)
└── hooks/
    ├── index.ts
    ├── useAgentConnection.ts
    ├── useChatMessages.ts
    ├── useChatAttachments.ts (existing)
    ├── useComponentSelection.ts
    └── useDeckDiff.ts
```

### Phase 4: Testing (Day 4)

Test matrix - each prompt should work:
```
✓ "Make a slide about AI trends"
✓ "Change this text to red" (with component selected)
✓ "Duplicate this slide"
✓ "Move slide 3 to position 1"
✓ "Use Stripe's branding"
✓ "Add a pie chart with sample data"
✓ "Delete the image"
✓ "Create a title slide"
```

---

## Tool Registry (Final: 10 Tools)

| Tool | Purpose | Model | Mechanical? |
|------|---------|-------|-------------|
| `edit_slide` | Edit/generate slide content | Gemini 3 Pro | No |
| `create_slide` | Create new slide | Gemini 3 Pro | No |
| `delete_slide` | Remove slide | - | Yes |
| `duplicate_slide` | Copy slide | - | Yes |
| `reorder_slides` | Move slide | - | Yes |
| `edit_component` | Edit component props | Gemini 3 Pro | No |
| `create_component` | Add component | Gemini 3 Pro | No |
| `delete_component` | Remove component | - | Yes |
| `apply_theme` | Apply colors/fonts | Haiku | No |
| `search_web` | Research info | Perplexity | No |

---

## Prompt Engineering for Tool Selection

### Orchestrator System Prompt (Refined)

```python
SYSTEM_PROMPT = """You are a slide deck editor. Execute the user's request using tools.

TOOL SELECTION GUIDE:

| User Intent | Tool | Why |
|-------------|------|-----|
| "Make a slide about X" | edit_slide | Generates content on current slide |
| "Create a new slide" | create_slide | Adds slide to deck |
| "Change this to red" | edit_component | Edits selected component |
| "Add a chart" | create_component | Adds to current slide |
| "Use Apple's colors" | apply_theme | Brand/color changes |
| "Delete this" | delete_component | Removes selected |
| "Move slide 3 to end" | reorder_slides | Reorganizes deck |

CRITICAL RULES:
1. User says "this" → Check SELECTED COMPONENTS, edit that specific one
2. User says "slide" + content request → Use edit_slide (handles empty slides too)
3. User says "new slide" → Use create_slide
4. Color/font/theme requests → Use apply_theme
5. Multiple changes? Call multiple tools in sequence

CANVAS: 1920x1080 pixels. Origin (0,0) top-left.
"""
```

### Context Template (Include Selection)

```python
def build_context(deck_data, current_slide, selected_components=None, attachments=None):
    context = f"""CURRENT SLIDE: {slide_id}
COMPONENTS:
{component_list}
"""
    
    # CRITICAL: Include selection context
    if selected_components:
        context += f"""
🎯 SELECTED COMPONENTS (user is referring to these with "this"):
{format_selected(selected_components)}
→ Use edit_component with these IDs for "this" references
"""
    
    if attachments:
        context += f"\nATTACHMENTS: {attachments}"
    
    return context
```

### Tool Descriptions (For LLM)

```python
TOOL_DESCRIPTIONS = """
TOOLS:

1. edit_slide(slide_id, instruction)
   - WHEN: User wants to change/add content on a slide
   - HANDLES: Empty slides (generates content), CustomComponent (rewrites HTML), standard edits
   - Example: "Add bullet points about AI" → edit_slide(slide_id, "Add bullet points about AI")

2. create_slide(instruction, insert_after?)
   - WHEN: User explicitly wants a NEW slide in the deck
   - Example: "Create a title slide at the start" → create_slide("Title slide", insert_after=null)

3. edit_component(component_id, instruction)
   - WHEN: User wants to change a SPECIFIC component (check SELECTED COMPONENTS)
   - Example: "Make this bigger" → edit_component(selected_id, "increase font size")

4. create_component(slide_id, component_type, instruction)
   - WHEN: User wants to ADD a component to existing slide
   - Types: TiptapTextBlock, Image, Chart, Shape, CustomComponent
   - Example: "Add a pie chart" → create_component(slide_id, "Chart", "pie chart with sample data")

5. delete_component(component_id)
   - WHEN: User wants to REMOVE a component
   - Example: "Delete this image" → delete_component(selected_id)

6. delete_slide(slide_id)
   - WHEN: User wants to REMOVE a slide

7. duplicate_slide(slide_id)
   - WHEN: User wants to COPY a slide

8. reorder_slides(slide_id, new_index)
   - WHEN: User wants to MOVE a slide
   - Example: "Move this to the end" → reorder_slides(slide_id, last_index)

9. apply_theme(instruction, scope?)
   - WHEN: User mentions colors, fonts, branding, theme, style
   - scope: "deck" (all slides) or "slide" (current only)
   - Example: "Use Stripe's branding" → apply_theme("Stripe branding", scope="deck")

10. search_web(query)
    - WHEN: User needs external information
    - Example: "What are the latest AI trends?" → search_web("latest AI trends 2025")
"""
```

### Prompt Testing Checklist

Before deployment, verify these prompts route correctly:

```
| Prompt | Expected Tool | Args |
|--------|---------------|------|
| "Make a slide about AI" | edit_slide | {instruction: "about AI"} |
| "Add a new slide about Q3" | create_slide | {instruction: "Q3 results"} |
| "Make this text red" (w/ selection) | edit_component | {component_id: selected, instruction: "red"} |
| "Change the background to blue" | edit_slide | {instruction: "background blue"} |
| "Use Apple's colors" | apply_theme | {instruction: "Apple colors"} |
| "Delete this" (w/ selection) | delete_component | {component_id: selected} |
| "Duplicate this slide" | duplicate_slide | {slide_id: current} |
| "Move to position 1" | reorder_slides | {slide_id, new_index: 0} |
| "Add a chart" | create_component | {type: "Chart", instruction: "..."} |
| "What's trending in tech?" | search_web | {query: "tech trends"} |
```

---

## Key Principles

1. **Trust the AI**: Don't over-constrain with complex validation. Let it generate, then fix.

2. **Single source of truth**: One config for models, one registry for tools.

3. **Simple > Complex**: 200 lines that work > 700 lines with edge cases.

4. **Delete aggressively**: Dead code is tech debt.

5. **Hooks extract state**: React components should be thin wrappers around hooks.

6. **Selection context matters**: Always pass selected components to backend for "this" references.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Keep old files, add `_v2` suffix to new ones until tested |
| Gemini rate limits | Maintain Opus fallback (already exists) |
| Haiku not smart enough for orchestration | Test first, can upgrade to Sonnet if needed |
| ChatPanel refactor breaks UI | Extract hooks first, refactor incrementally |
| Component selection issues | Add debug logging to verify IDs are passed |

---

## Success Criteria

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Orchestrator lines | 414 | <250 | ⏳ (slight trim needed) |
| Tool files | 8 | 8 | ✅ |
| Config legacy aliases | 40+ | 0 | ⏳ |
| ChatPanel lines | 4932 | <1500 | ❌ |
| Hooks extracted | 1 | 5 | ⏳ |
| Test prompts passing | 6/10 | 10/10 | ⏳ |
