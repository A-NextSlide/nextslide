# Debugging Detailed Mode Issue

## Backend is Working ✅

Tested and verified:
- Presentation mode (detail_level="standard"): 40 words/slide
- Detailed mode (detail_level="detailed"): 440 words/slide

## If You're Still Seeing Short Content

The backend works, so the issue is likely:

### 1. Frontend Not Sending "detailed"

Check browser console (F12) for:
```
[useOutlineChat] detailLevel being sent: ???
[outlineApi] request.detailLevel: ???
```

Should see:
- `detailLevel: "detailed"` when you select "Detailed Analysis"
- `detailLevel: "standard"` when you select "Presentation"

### 2. Check Backend Logs

When you generate, backend should log:
```
[OUTLINE DEBUG] Request detail level: detailed
[STREAMING] detail_level = detailed
[STREAMING] ✅ DETAILED MODE ACTIVE - will generate 250-500+ words per slide
```

If you see:
```
[STREAMING] ✅ PRESENTATION MODE ACTIVE
```

Then the frontend is sending "standard" instead of "detailed".

### 3. Verify Dropdown State

In `OutlineEditor.tsx` line 196:
```tsx
const [detailLevel, setDetailLevel] = useState<'quick' | 'standard' | 'detailed'>('standard');
```

The dropdown in `ChatInputView.tsx` line 1081:
```tsx
<SelectItem value="detailed">Detailed Analysis</SelectItem>
```

This should call:
```tsx
handleDetailLevelSelected(value);  // value = "detailed"
```

Which should call:
```tsx
setDetailLevel(level);  // level = "detailed"
```

### 4. Possible Issues

**A. Cached Results**
- Try with a completely new topic/prompt
- Clear browser cache if needed

**B. State Not Updating**
- The `detailLevel` state might not update before API call
- Check console for the actual value being sent

**C. Wrong Endpoint**
- Make sure you're using the streaming endpoint
- Check Network tab in browser for the actual request body

### 5. Manual Test

Try this in browser console while on `/app`:
```javascript
// Check current detail level
console.log('Current detail level:', detailLevel);

// Try setting it manually
setDetailLevel('detailed');
console.log('After setting:', detailLevel);
```

## Quick Fix to Try

If the dropdown isn't working, try adding a console.log in `handleDetailLevelSelected`:

```tsx
const handleDetailLevelSelected = (level: 'quick' | 'standard' | 'detailed') => {
  console.warn('⚠️ DETAIL LEVEL SELECTED:', level);
  setDetailLevel(level);
  console.warn('⚠️ State should now be:', level);
};
```

## Expected Backend Logs

### Presentation Mode:
```
[OUTLINE DEBUG] Request detail level: standard
[STREAMING] detail_level = standard
[STREAMING] ✅ PRESENTATION MODE ACTIVE - will generate MAX 50 words per slide
[STREAMING] Using perplexity-sonar for outline structure
[PRESENTATION] Slide X: Using minimal tokens (800) and search (5 results, 1 week)
```

### Detailed Mode:
```
[OUTLINE DEBUG] Request detail level: detailed
[STREAMING] detail_level = detailed
[STREAMING] ✅ DETAILED MODE ACTIVE - will generate 250-500+ words per slide
[STREAMING] Using perplexity-sonar-pro for outline structure
[STREAMING] Slide X: Using DETAILED mode prompt (250-500+ words)
```

## If All Else Fails

The backend IS working. To force detailed mode for testing, you can temporarily hardcode it in the frontend:

`apps/frontend/src/hooks/useOutlineChat.ts` line 805:
```tsx
detailLevel: 'detailed',  // Force detailed mode for testing
```

This will prove the backend works and help isolate if it's a frontend state issue.

## Date
October 16, 2025

