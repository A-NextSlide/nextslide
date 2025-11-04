# 🎯 V3 Slide Generation Rebuild - Implementation Guide

**Date**: November 1, 2025
**Status**: Phase 1 Complete - Placement Foundation Built
**Goal**: Rebuild slide generation from scratch - placement first, design later

---

## 📋 What We Built

### 1. **File Map** (`SLIDE_GENERATION_MAP.md`)
Complete architecture documentation showing:
- Entry points (API → DeckComposer → Generators)
- All prompt files and their purposes
- Theme system flow
- Where changes need to be made

### 2. **V3 Bare-Bones Prompt** (`agents/prompts/generation/html_inspired_system_prompt_v3.py`)
**Philosophy**: Get positioning right FIRST, design comes later.

**What it does**:
- ✅ Defines simple grid zones (LEFT/CENTER/RIGHT columns)
- ✅ Strict Y-coordinate stacking rules (no overlaps!)
- ✅ **DEBUG MODE**: Shows theme info at top of every slide
- ✅ Height calculation formulas
- ✅ Only uses simple components (TiptapTextBlock, Shape placeholders, Line)
- ✅ No design complexity - just placement!

**What it doesn't do** (intentionally):
- ❌ No Image components (placeholders only)
- ❌ No Chart components (placeholders only)
- ❌ No CustomComponent (not yet)
- ❌ No styling/design focus
- ❌ No background complexity

### 3. **Generator Updates** (`agents/generation/html_inspired_generator.py`)
- Added v3 import
- Environment variable switch: `HTML_PROMPT_VERSION`
- Defaults to v3 (placement mode)
- Can switch back to v2 if needed

### 4. **Config Update** (`agents/config.py`)
```python
HTML_PROMPT_VERSION = os.getenv('HTML_PROMPT_VERSION', 'v3').lower()
# 'v3' = placement only (default)
# 'v2' = full design system
```

---

## 🚀 How to Use V3

### Option 1: Default (V3 - Placement Mode)
No environment variable needed - v3 is the default!

```bash
# Just restart your backend
cd apps/backend
# Stop current process
# Start again
python -m uvicorn api.chat_server:app --reload --port 9090
```

### Option 2: Switch Back to V2
```bash
export HTML_PROMPT_VERSION=v2
python -m uvicorn api.chat_server:app --reload --port 9090
```

### What You'll See

**Every slide will have a DEBUG HEADER at the top**:
```
THEME: Tech Minimal | VIBE: bold asymmetric | LAYOUT: 2-col split - text left, chart right
```

**Visual placeholders instead of real components**:
- Gray dashed boxes showing where charts will go
- Labels like "[CHART PLACEHOLDER: Revenue Growth 2020-2025]"
- All positioning calculated and shown

---

## 🎯 V3 Output Example

```json
{
  "components": [
    {
      "type": "TiptapTextBlock",
      "id": "debug-header",
      "props": {
        "position": {"x": 40, "y": 20},
        "texts": [{
          "text": "THEME: Tech Minimal | VIBE: bold | LAYOUT: 2-column split"
        }]
      }
    },
    {
      "type": "TiptapTextBlock",
      "id": "title",
      "props": {
        "position": {"x": 40, "y": 100},
        "width": 1840,
        "height": 96
      }
    },
    {
      "type": "Shape",
      "id": "chart-placeholder",
      "props": {
        "position": {"x": 960, "y": 280},
        "width": 880,
        "height": 600,
        "backgroundColor": "#EEEEEE",
        "borderStyle": "dashed"
      }
    }
  ]
}
```

---

## 📊 Current Status vs. Problem

### ❌ **Problem Before V3**
1. Using v2 prompt (4,399 lines) - too complex, AI gets lost
2. Same repetitive slide layouts every time
3. Theme doesn't guide structure/creativity
4. Hard to debug positioning issues
5. Design and placement mixed together

### ✅ **V3 Solution - Phase 1**
1. ✅ Simple focused prompt (placement only)
2. ✅ Debug headers show AI's thinking
3. ✅ Placeholders make it clear what goes where
4. ✅ Separation of concerns: placement now, design later
5. ✅ Easy to verify no overlaps

---

## 🛤️ Roadmap - Next Phases

### **Phase 1: Placement Foundation** ← WE ARE HERE! ✅
- [x] Create v3 bare-bones prompt
- [x] Add debug visualization
- [x] Simple grid system
- [x] Strict no-overlap rules
- [x] Placeholder components
- [ ] **TEST IT**: Generate 5-10 slides, verify positioning is correct

### **Phase 2: Theme-Driven Creative Direction** (Next!)
**Goal**: Theme generator provides layout philosophy

**Changes needed**:
1. **Update Theme Generator** (`agents/generation/theme_director.py`):
   ```python
   # Current theme output
   {
       "name": "Tech Minimal",
       "colors": {...},
       "typography": {...}
   }

   # NEW theme output (add layout_philosophy)
   {
       "name": "Tech Minimal",
       "colors": {...},
       "typography": {...},
       "layout_philosophy": {
           "structure": "asymmetric grid with bold type",
           "slide_patterns": {
               "title": "centered hero with side accent",
               "content": "60/40 split - text left, visual right",
               "data": "large charts with minimal text callouts"
           },
           "spacing": "generous whitespace, 80px gutters",
           "hierarchy": "huge numbers, tiny labels"
       }
   }
   ```

2. **Update V3 Prompt**:
   - Read layout_philosophy from theme
   - Apply it to each slide type
   - Vary patterns based on creative direction

3. **Test**: Same deck should look different with different themes

### **Phase 3: Add Real Components** (After Phase 2)
Once positioning is perfect:
- Add Image components (real images, not placeholders)
- Add Chart components (real data viz)
- Add CustomComponent (interactive elements)
- Keep the debug header for now!

### **Phase 4: Design Layer** (Final)
- Add backgrounds
- Add styling sophistication
- Add animations
- Remove debug headers (or make optional)

---

## 🧪 Testing V3

### Test Plan
1. **Generate a test deck** with v3 enabled
2. **Check every slide** for:
   - ✅ Debug header present at y=20
   - ✅ No overlapping components
   - ✅ Correct Y-coordinate calculations
   - ✅ Placeholders used instead of images/charts
   - ✅ Clean, simple positioning

3. **What to look for**:
   - Debug header shows: theme name, vibe, layout choice
   - Components don't overlap (verify formula: next.y >= prev.y + prev.height + gap)
   - Heights calculated correctly (fontSize × 1.2 for text)
   - Placeholders clearly labeled

4. **Red flags** (if you see these, v3 isn't working):
   - No debug header
   - Overlapping text
   - Real images/charts (should be placeholders)
   - Complex styling

---

## 🎨 Next Steps - IMMEDIATE

### Step 1: Test V3 Placement
```bash
# Backend should already be using v3 by default
# Generate a test deck
# Review slides - look for debug headers and clean positioning
```

### Step 2: Document Findings
- Which slides have good positioning?
- Which slides still overlap?
- Is the debug info helpful?
- Are placeholders clear?

### Step 3: Enhance Theme Generator (Phase 2)
Once positioning is solid, update theme generator to provide:
- `layout_philosophy` object
- Creative direction for each slide type
- Specific patterns to use

### Step 4: Iterate
- Fix any remaining positioning issues
- Then move to Phase 2 (theme-driven creativity)

---

## 📁 Files Changed

### Created
- `agents/prompts/generation/html_inspired_system_prompt_v3.py` ← V3 prompt
- `SLIDE_GENERATION_MAP.md` ← Architecture map
- `V3_REBUILD_GUIDE.md` ← This file

### Modified
- `agents/generation/html_inspired_generator.py` ← Added v3 support + env var switch
- `agents/config.py` ← Added HTML_PROMPT_VERSION config

### Not Changed (yet)
- `agents/generation/theme_director.py` ← Will enhance in Phase 2
- Component schemas ← Will expand in Phase 3
- User prompt builder ← Already working

---

## 🎯 Success Criteria

### Phase 1 Success =
- [ ] All slides have debug headers
- [ ] Zero overlapping components
- [ ] All positioning calculations visible and correct
- [ ] Placeholders used consistently
- [ ] Easy to understand what AI is doing

### Phase 2 Success =
- [ ] Each theme has unique layout patterns
- [ ] Same content looks different with different themes
- [ ] Theme provides creative direction
- [ ] No more repetitive slides

### Phase 3 Success =
- [ ] Real images in correct positions
- [ ] Real charts in correct positions
- [ ] Interactive components work
- [ ] Still no overlaps!

---

## 💡 Key Insights

1. **Separation of Concerns**: Placement ≠ Design
   - Get positioning right first
   - Then layer on visual sophistication

2. **Debug Visualization**: Shows AI's thinking
   - Theme info visible
   - Layout strategy visible
   - Makes debugging trivial

3. **Progressive Enhancement**: Build up, don't build all at once
   - Phase 1: Placement
   - Phase 2: Theme-driven creativity
   - Phase 3: Real components
   - Phase 4: Visual polish

4. **Theme as Director**: Theme should guide structure
   - Not just colors and fonts
   - Also: layout patterns, spacing, hierarchy

---

## 🚨 Important Notes

1. **V3 is the default** - no env var needed to use it
2. **Debug headers are intentional** - they help us see what's happening
3. **Placeholders are intentional** - we're not doing visuals yet!
4. **Don't skip phases** - get Phase 1 right before moving on

---

**Status**: Ready to test! 🚀

Generate some slides and see if the positioning is clean and the debug info is helpful.
