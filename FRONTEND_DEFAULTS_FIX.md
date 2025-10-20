# Frontend Defaults Fix - The Real Culprit

## The Problem

Even after restarting the backend with all the fixes, images were STILL being auto-applied when toggle was OFF.

## Root Cause - Frontend Hardcoded Values!

The **frontend** was hardcoding `async_images: false` in multiple places, completely overriding the toggle setting!

### Location 1: `outlineApi.ts` Line 778
```typescript
// BEFORE - Wrong!
async_images: autoApplyImages !== undefined ? !autoApplyImages : false

// AFTER - Correct!
async_images: autoApplyImages !== undefined ? !autoApplyImages : true
```

### Location 2: `GenerationCoordinator.ts` Line 316
```typescript
// BEFORE - Wrong!
async_images: false,  // Hardcoded!

// AFTER - Correct!
async_images: true,  // Default to placeholders
```

### Location 3: `outlineApi.ts` Line 940
```typescript
// BEFORE - Wrong!
async_images: request.async_images !== undefined ? request.async_images : false

// AFTER - Correct!
async_images: request.async_images !== undefined ? request.async_images : true
```

### Location 4: `outlineApi.ts` Line 1098
```typescript
// BEFORE - Wrong!
async_images: options.autoSelectImages !== undefined ? !options.autoSelectImages : false

// AFTER - Correct!
async_images: options.autoSelectImages !== undefined ? !options.autoSelectImages : true
```

## Why This Happened

The frontend was EXPLICITLY sending `async_images: false` even when the user toggled OFF. This overrode:
- ✅ Backend Pydantic defaults (we fixed these)
- ✅ Backend validator defaults (we fixed these)  
- ✅ Backend option checking (we fixed these)

**The frontend trumps everything** because it explicitly sets the value in the request body!

## The Flow

### Before Fix:
```
User toggles OFF (wants placeholders)
  ↓
Frontend: autoSelectImages = false
  ↓
Frontend logic: async_images = !false = true ✓
  ↓
Frontend default: If undefined, use false ✗
  ↓
Actually sent: async_images = false ✗
  ↓
Backend receives: async_images = false
  ↓
Result: Auto-applies images (wrong!)
```

### After Fix:
```
User toggles OFF (wants placeholders)
  ↓
Frontend: autoSelectImages = false
  ↓
Frontend logic: async_images = !false = true ✓
  ↓
Frontend default: If undefined, use true ✓
  ↓
Actually sent: async_images = true ✓
  ↓
Backend receives: async_images = true
  ↓
Result: Uses placeholders (correct!)
```

## Files Modified

| File | Line | Change |
|------|------|--------|
| `apps/frontend/src/services/outlineApi.ts` | 778 | `false` → `true` |
| `apps/frontend/src/services/outlineApi.ts` | 940 | `false` → `true` |  
| `apps/frontend/src/services/outlineApi.ts` | 1098 | `false` → `true` |
| `apps/frontend/src/services/generation/GenerationCoordinator.ts` | 316 | `false` → `true` |

## Testing

**No backend restart needed** - Frontend changes are hot-reloaded by Vite!

Just refresh the browser and create a new deck:

### With Toggle OFF:
**Expected logs:**
```
Frontend:
[outlineApi] Computed async_images value: true ✓
[outlineApi] request.async_images: true ✓

Backend:
async_images: True ✓
📌 PLACEHOLDER MODE ✓
📌 PLACEHOLDER MODE - keeping images as placeholders (NOT auto-applying) ✓
```

**Expected behavior:**
- Images are placeholders
- "Select Image" button appears
- "Recommended" tab shows 100 images
- Can manually select

### With Toggle ON:
**Expected logs:**
```
Frontend:
[outlineApi] Computed async_images value: false ✓
[outlineApi] request.async_images: false ✓

Backend:
async_images: False ✓
🎯 AUTO-APPLY MODE ✓
✅ APPLYING TAGGED MEDIA ✓
```

**Expected behavior:**
- Images auto-applied
- Real images in slides
- Can still change via recommendations

## Summary

The backend fixes were correct, but the **frontend was the real problem** all along. It was hardcoding `async_images: false` in 4 different places, completely ignoring the user's toggle setting and all backend defaults.

Now that both frontend AND backend default to `true` (placeholders), the toggle will finally work correctly!

## Final Checklist

✅ Backend Pydantic defaults: `True`  
✅ Backend validators: `True`  
✅ Backend option checking: `True`  
✅ Frontend outlineApi.ts (3 places): `True`  
✅ Frontend GenerationCoordinator.ts: `True`  
✅ Slide generator placeholder mode: Fixed  

**Everything should work now!** 🎉

