# Active Systems & Files - What's Actually Running 🚀

## 🏗️ System Architecture

### Active Generator Chain:
```
SlideGeneratorAdapter (entry point)
    ↓
HTMLInspiredSlideGenerator (wrapper - ACTIVE)
    ↓
SlideGeneratorV2 (base generator)
```

**Configuration:**
- Location: `apps/backend/agents/generation/adapters.py` line 52
- Default: `USE_HTML_INSPIRED=true` (enabled by default)
- Can disable with env var: `USE_HTML_INSPIRED=false`

## 📝 Active Prompts

### ✅ **HTML-Inspired System Prompt V2** (ACTIVE - PRIMARY)
**Location:** `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`

**How it's used:**
1. `html_inspired_generator.py` line 251 calls `get_html_inspired_system_prompt_v2()`
2. Builds cached part with V2 prompt + condensed schemas
3. Adds dynamic slide-specific content after cache breakpoint

**Features:**
- ✅ Mode-specific design (Presentation vs Detailed)
- ✅ Condensed component schemas for caching
- ✅ Logo instructions (just added!)
- ✅ Chart sizing rules (user just added)
- ✅ Optimized for Claude caching (~3000 token savings per slide)

**Mode Detection:**
- `detail_level == "detailed"` → **DETAILED MODE** (data-heavy, 60-80% charts, compact)
- `detail_level == "standard"` → **PRESENTATION MODE** (design-focused, <30% charts, impactful)

### ❌ RAG System Prompt (NOT USED in HTML mode)
**Location:** `apps/backend/agents/prompts/generation/rag_system_prompt.py`

**Status:** 
- Only used if `USE_HTML_INSPIRED=false`
- Contains legacy slide generation logic
- Has logo instructions (not actively used)
- Imported by `SlideGeneratorV2` but overridden by HTML wrapper

### ❌ Other HTML Prompts (NOT USED)
- `html_inspired_system_prompt_dynamic.py` - Just a wrapper that calls V2
- `html_inspired_system_prompt_enhanced.py` - Old version, not used
- `prompt_builder.py._add_brand_logo()` - Only used in RAG mode

## 🎨 Theme System

### ✅ **ThemeDirector** (ACTIVE)
**Location:** `apps/backend/agents/generation/theme_director.py`

**Configuration:**
- `USE_AGENT_THEMER=true` (default, in `config.py` line 124)
- Falls back to `ThemeStyleManager` if disabled or fails

**What it does:**
- Analyzes deck outline for brand/entity detection
- Acquires colors (brand scraping, Huemint AI, or database palettes)
- Selects fonts based on brand/topic
- **Composes theme** with logo URLs (just fixed!)
- Generates per-slide theming guidance

**Logo Flow in ThemeDirector:**
1. Checks `deck_outline.stylePreferences.logoUrl` (user-uploaded) FIRST
2. Falls back to `color_result.metadata.logo_url` (scraped brand logo)
3. Sets logo in:
   - `theme['brandInfo']['logoUrl']`
   - `theme['color_palette']['metadata']['logo_url']`

### ❌ ThemeStyleManager (FALLBACK ONLY)
**Location:** `apps/backend/agents/generation/theme_style_manager.py`

**Status:** Only used if `USE_AGENT_THEMER=false` or ThemeDirector fails

## 🔧 Component Generation

### ✅ **SlideGeneratorV2** (ACTIVE BASE)
**Location:** `apps/backend/agents/generation/slide_generator.py`

**Key Methods:**
- `generate_slide()` - Main entry point
- `_build_prompts()` - Builds prompts (overridden by HTML wrapper)
- **`_inject_intelligent_logo()`** - Adds logo components (just fixed!)
- `_apply_theme_structural_layout()` - Applies theme positioning

**Logo Injection:**
- Called for EVERY slide after AI generation
- Checks for logo URL in priority order:
  1. `context.deck_outline.stylePreferences.logoUrl`
  2. `theme.brandInfo.logoUrl`
  3. `theme.color_palette.metadata.logo_url`
  4. Other theme locations
- Creates logo Image component if not already present
- Intelligent positioning based on slide type

### ✅ **AISlideGenerator** (ACTIVE)
**Location:** `apps/backend/agents/generation/components/ai_generator.py`

**What it does:**
- Makes actual API calls to Claude/GPT
- Handles streaming responses
- Parses JSON from AI response

### ✅ **ComponentValidator** (ACTIVE)
**Location:** `apps/backend/agents/generation/components/component_validator.py`

**What it does:**
- Validates generated components
- Checks required props
- Fixes common issues

## 📊 Complete Slide Generation Flow

```
1. User creates outline → Frontend
   ↓
2. Outline sent to /deck/create-from-outline → Backend API
   ↓
3. ThemeDirector generates theme
   ├─ Checks stylePreferences.logoUrl (user-uploaded)
   ├─ Or scrapes brand for logo
   └─ Sets logo in theme.brandInfo.logoUrl
   ↓
4. For each slide:
   ├─ HTMLInspiredSlideGenerator.generate_slide()
   │   ├─ Builds prompts using html_inspired_system_prompt_v2
   │   │   ├─ Cached part: V2 prompt + schemas
   │   │   └─ Dynamic part: slide content + mode guidance
   │   ├─ Calls SlideGeneratorV2._generate_with_ai()
   │   │   └─ AISlideGenerator makes API call to Claude
   │   ├─ ComponentValidator validates output
   │   └─ SlideGeneratorV2._inject_intelligent_logo()
   │       ├─ Finds logo URL from theme/outline
   │       └─ Creates logo Image component
   └─ Slide JSON returned
   ↓
5. Complete deck sent to frontend
```

## 🗂️ File Importance Matrix

### Critical Files (Used Every Generation):
1. ✅ `agents/generation/adapters.py` - Entry point, creates generator chain
2. ✅ `agents/generation/html_inspired_generator.py` - Active wrapper
3. ✅ `agents/generation/slide_generator.py` - Base generator (especially `_inject_intelligent_logo`)
4. ✅ `agents/prompts/generation/html_inspired_system_prompt_v2.py` - **ACTIVE PROMPT**
5. ✅ `agents/generation/theme_director.py` - Theme generation with logos
6. ✅ `agents/generation/components/ai_generator.py` - AI API calls
7. ✅ `agents/generation/components/component_validator.py` - Validation

### Secondary Files (Fallbacks/Utilities):
- `agents/prompts/generation/rag_system_prompt.py` - Only if HTML mode disabled
- `agents/generation/theme_style_manager.py` - Only if ThemeDirector disabled
- `agents/generation/components/prompt_builder.py` - Only in RAG mode
- `agents/prompts/generation/html_inspired_system_prompt_enhanced.py` - Old, not used
- `agents/prompts/generation/html_inspired_system_prompt_dynamic.py` - Just wrapper

### Not Used:
- `agents/generation/components/prompt_builder_old.py` - Legacy

## 🎯 Where User's Changes Matter

### User just edited: `html_inspired_system_prompt_v2.py`
**Impact:** ✅ **IMMEDIATE** - This is THE active prompt!

**Their changes:**
- Chart sizing rules (CRITICAL FIT RULES)
- Boundary verification (x + width ≤ 1840, y + height ≤ 1020)
- Mode-specific sizing (Presentation ≤850×600, Detailed ≤650×450)
- Multiple chart positioning examples

**Where it's used:**
- Line 251 in `html_inspired_generator.py`
- Called EVERY slide generation
- Cached for efficiency

### Logo Changes Impact:
**Files that needed fixing:**
1. ✅ `html_inspired_system_prompt_v2.py` - Added logo instructions
2. ✅ `slide_generator.py._inject_intelligent_logo()` - Fixed logo URL detection
3. ✅ `theme_director.py._compose_theme()` - Fixed logo priority in theme

**Files that already had logos (not used in HTML mode):**
- ❌ `rag_system_prompt.py` - Has logo policy but not active
- ❌ `prompt_builder.py._add_brand_logo()` - Only in RAG mode

## 🔍 How to Verify Active System

### Check Current Mode:
```python
# In adapters.py line 52
use_html_inspired = os.getenv('USE_HTML_INSPIRED', 'true').lower() == 'true'
```

### Check Logs:
```
# HTML mode active:
🎨 HTML-inspired slide generation ENABLED (optimized prompts + caching)
✅ HTMLInspiredSlideGenerator initialized with Claude caching
🎨 HTML-inspired generation for slide {N}

# RAG mode (fallback):
📝 Using legacy RAG slide generation
```

### Check Theme System:
```python
# In config.py line 124
USE_AGENT_THEMER = os.getenv('USE_AGENT_THEMER', 'true').lower() == 'true'
```

```
# ThemeDirector active:
[THEME DIRECTOR] Using user-uploaded logo from stylePreferences: ...
[THEME DIRECTOR] Using scraped brand logo: ...

# Legacy ThemeStyleManager:
[PALETTE] 🎨 Web scrape colors: ...
```

## 🎉 Summary

### What's Actually Running:

**Prompt System:**
- ✅ HTML-Inspired V2 (active, your recent edits apply!)
- ❌ RAG System (not used unless HTML mode disabled)

**Generator Chain:**
- ✅ HTMLInspiredSlideGenerator → SlideGeneratorV2
- Logo injection via `_inject_intelligent_logo()` on every slide

**Theme System:**
- ✅ ThemeDirector (active)
- Logo URL priority: user-uploaded > scraped brand

**Key Configuration:**
- `USE_HTML_INSPIRED=true` (default)
- `USE_AGENT_THEMER=true` (default)
- Model: `claude-haiku-4-5` (from config.py)

### Your Recent Changes Are Live:
✅ Chart sizing rules in V2 prompt → **ACTIVE**
✅ Logo instructions in V2 prompt → **ACTIVE**
✅ Logo injection fixes → **ACTIVE**
✅ ThemeDirector logo priority → **ACTIVE**

All systems operational! 🚀

