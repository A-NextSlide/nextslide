# Slide Generation System - File Map

## 🎯 Entry Points
1. **API**: `api/chat_server.py` → `/api/deck/compose-stream`
2. **Request Handler**: `api/requests/api_deck_compose_stream.py`
3. **Deck Composer**: `agents/generation/deck_composer.py` → `compose_deck_stream()`

## 🏗️ Architecture Flow

```
API Request
    ↓
DeckComposer (deck_composer.py)
    ↓
SlideGeneratorAdapter (adapters.py)
    ↓
HTMLInspiredSlideGenerator (html_inspired_generator.py) ← WRAPS
    ↓
SlideGeneratorV2 (slide_generator.py) ← BASE
    ↓
Components: AIGenerator, PromptBuilder, Validator
```

## 📝 PROMPT FILES (System Instructions)

### Current Prompts
- `agents/prompts/generation/html_inspired_system_prompt_v2.py` ← **CURRENTLY USING** (4,399 lines)
- `agents/prompts/generation/html_inspired_system_prompt_dynamic.py` (214 lines)
- `agents/prompts/generation/html_inspired_system_prompt_enhanced.py`
- `agents/prompts/generation/html_inspired_system_prompt_optimized.py`
- `agents/prompts/generation/rag_system_prompt.py` (old system)

### NEW - What We'll Create
- `agents/prompts/generation/html_inspired_system_prompt_v3.py` ← **BARE BONES PLACEMENT ONLY**

## 🎨 THEME SYSTEM

### Theme Generation
- `agents/generation/theme_director.py` ← Main theme generator
- `agents/generation/theme_director_new.py`
- `agents/generation/theme_style_manager.py` ← Creates style manifestos
- `agents/prompts/generation/global_theme_system.py` ← Theme prompt

### Theme Flow
```
DeckComposer
    ↓
ThemeManager.generate_theme(outline)
    ↓
ThemeDirector (uses AI to create theme)
    ↓
Returns: ThemeSpec {
    name, description, vibe,
    typography: {heading, body, accent},
    colors: {primary, secondary, accent},
    layout_philosophy: "HOW TO STRUCTURE SLIDES" ← KEY!
}
```

## 🔧 GENERATOR FILES

### Main Generators
- `agents/generation/html_inspired_generator.py` ← **WRAPPER** - Injects HTML prompts
- `agents/generation/slide_generator.py` ← **BASE** - Core generation logic
- `agents/generation/components/ai_generator.py` ← Calls AI models
- `agents/generation/components/prompt_builder.py` ← Builds user prompts

### Supporting
- `agents/generation/adapters.py` ← Connects old/new systems
- `agents/generation/components/component_validator.py` ← Validates JSON output
- `agents/generation/orchestration/parallel_slide_orchestrator.py` ← Parallel generation

## 🎯 WHERE V3 CHANGES GO

### Files to Modify
1. **CREATE**: `agents/prompts/generation/html_inspired_system_prompt_v3.py`
2. **MODIFY**: `agents/generation/html_inspired_generator.py` (line 82 - switch to v3)
3. **ENHANCE**: `agents/generation/theme_director.py` (add layout_philosophy to theme)

## 🔍 Current Problem

**Issue**: Theme generator doesn't provide enough creative direction to slide generator

**Current Theme Output**:
```python
{
    "name": "Tech Minimal",
    "colors": {...},
    "typography": {...}
}
```

**What We Need**:
```python
{
    "name": "Tech Minimal",
    "colors": {...},
    "typography": {...},
    "layout_philosophy": {
        "structure": "asymmetric grid with bold type",
        "slide_patterns": {
            "title": "centered hero with side accent",
            "content": "60/40 split with text left, visuals right",
            "data": "large charts with minimal text callouts"
        },
        "spacing_system": "generous whitespace, 80px gutters",
        "visual_hierarchy": "huge numbers, small labels"
    }
}
```

## 🚀 V3 Goals

### Phase 1: Placement Only (Bare Bones)
- Strip all design/styling complexity
- Focus purely on: grid zones, positioning, no overlaps
- Add debug visualization (show theme info, placement boxes)
- Get positioning right FIRST

### Phase 2: Theme-Driven Design
- Theme generator provides creative direction
- Slide generator follows theme's layout philosophy
- Each deck has unique structure

### Phase 3: Variety & Creativity
- Different slide types use different patterns
- No repetitive layouts
- Smart content-aware positioning
