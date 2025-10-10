# TextPadding Root Cause Fixed - No More 30pt Defaults!

## The Root Cause 🔍

The textPadding was defaulting to 30 because:

**THE PROBLEM:**
The `SchemaExtractor` in `apps/backend/agents/rag/schema_extractor.py` was **stripping out `defaultProps`** when creating minimal schemas for the AI!

This meant:
1. ✅ Frontend schema correctly had `textPadding: 16`
2. ✅ Backend `typebox_schemas_latest.json` correctly had `textPadding: 16`
3. ❌ **But the extracted schema sent to AI had NO defaultProps!**
4. ❌ AI would either guess or use old context, resulting in 30

## The Fix ✅

Added defaultProps inclusion to `schema_extractor.py`:

```python
# CRITICAL: Include defaultProps if present in the full component schema
# This ensures AI knows the correct default values (e.g., textPadding=16 for Shape)
full_component_schema = self.schemas.get(component_name, {})
if "defaultProps" in full_component_schema:
    minimal["defaultProps"] = full_component_schema["defaultProps"]
    if component_name == "Shape":
        logger.info(f"Shape defaultProps included: textPadding={minimal['defaultProps'].get('textPadding', 'NOT SET')}")
```

**Verified Result:**
```bash
$ python3 -c "from agents.rag.schema_extractor import SchemaExtractor; ..."
Shape textPadding after fix: 16
Shape defaultProps included: textPadding=16
```

## Multiple Layers of Protection 🛡️

### 1. **Schema Defaults**
- ✅ Frontend: `shape.ts` defaultProps.textPadding = 16
- ✅ Backend: `typebox_schemas_latest.json` textPadding = 16
- ✅ **NEW**: RAG schema extractor now includes defaultProps

### 2. **Backend Validator** (Hard Cap)
```python
# Caps textPadding at 20 if AI generates higher
if text_padding > 20:
    props['textPadding'] = 20
```

### 3. **AI Prompts** (Multiple Warnings)
```
ALWAYS use textPadding=16 (default) or max 20. NEVER use 30 or higher!
DEFAULT=16, max 20, NEVER 30+!
WRONG ❌: textPadding=30
RIGHT ✅: textPadding=16
```

### 4. **UI Settings**
```typescript
currentValue={props.textPadding || 16}  // Default to 16 in UI
```

## Files Modified

### Backend
- ✅ `agents/rag/schema_extractor.py` - **ROOT CAUSE FIX**: Now includes defaultProps
- ✅ `agents/generation/components/component_validator.py` - Caps at 20
- ✅ `agents/generation/html_inspired_generator.py` - Explicit examples
- ✅ `agents/prompts/generation/html_inspired_system_prompt_dynamic.py` - Multiple warnings

### Frontend
- ✅ `registry/components/shape.ts` - Default textPadding: 16
- ✅ `components/settings/ShapeSettingsEditor.tsx` - UI default: 16

## Before vs After

### Before (BROKEN)
```
AI sees: { "type": "Shape", "properties": {...} }
         // NO defaultProps!
AI generates: "textPadding": 30  // Guessing or using old context
```

### After (FIXED)
```
AI sees: { 
  "type": "Shape", 
  "properties": {...},
  "defaultProps": { "textPadding": 16, ... }  // NOW INCLUDED!
}
AI generates: "textPadding": 16  // Uses correct default!
```

## Test Results ✅

```bash
# Schema has correct default
$ grep -A 1 textPadding apps/backend/schemas/typebox_schemas_latest.json
"textPadding": 16,

# Extracted schema now includes it
$ python test
Shape textPadding after fix: 16
Shape defaultProps included: textPadding=16

# No hardcoded 30 values in backend
$ grep -r "textPadding.*30" apps/backend/ --include="*.py" | grep -v "NEVER\|WRONG"
(no results - only warnings against 30!)
```

## Summary

The issue was that the **RAG schema extractor was removing defaultProps**, so the AI never knew that textPadding should default to 16. 

Now:
✅ **AI sees defaultProps with textPadding=16**
✅ **Backend validator caps at 20** (just in case)
✅ **Multiple warnings in prompts** against using 30
✅ **UI defaults to 16**

**Result:** Shapes will now generate with textPadding=16, and any value >20 will be automatically capped!

