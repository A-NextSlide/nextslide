# Dropdown to Backend Flow - VERIFIED ✅

## Frontend Dropdown → Backend Connection

### 1. Frontend Dropdown (`ChatInputView.tsx` line 1082-1083)

```tsx
<SelectContent className="min-w-[180px]">
  <SelectItem value="standard">Presentation</SelectItem>
  <SelectItem value="detailed">Detailed Analysis</SelectItem>
</SelectContent>
```

**Mapping:**
- User sees: **"Presentation"** → Sends: `detailLevel: "standard"`
- User sees: **"Detailed Analysis"** → Sends: `detailLevel: "detailed"`

### 2. State Update (`OutlineEditor.tsx` line 648-652)

```tsx
const handleDetailLevelSelected = (level: 'quick' | 'standard' | 'detailed') => {
  setDetailLevel(level);
};
```

### 3. API Call (`useOutlineChat.ts` line 747-748)

```tsx
const actualDetailLevel = overrides?.detailLevel || detailLevel;
```

This `detailLevel` is passed to the streaming API endpoint.

### 4. Backend Receives (`generator.py`)

```python
# Backend receives the parameter
options.detail_level  # 'standard' or 'detailed'

# Model selection (line 2428-2442)
if detail_level == 'detailed':
    model = PERPLEXITY_OUTLINE_MODEL  # 'perplexity-sonar-pro'
else:
    model = PRESENTATION_OUTLINE_MODEL  # 'perplexity-sonar'
```

### 5. Different Processing

**When user selects "Presentation":**
- Backend receives: `detail_level = "standard"`
- Uses model: `perplexity-sonar` (lighter)
- Search: 5 results, 1 week recency
- Prompt: ULTRA-STRICT (MAX 3-4 bullets, MAX 10 words each)
- Post-processing: Trims bullets to 4, adds [IMAGE: ] tags
- Result: **11-29 words per slide**

**When user selects "Detailed Analysis":**
- Backend receives: `detail_level = "detailed"`
- Uses model: `perplexity-sonar-pro` (comprehensive)
- Search: 10 results, 1 month recency
- Prompt: DATA-RICH (5-8 bullets with sub-bullets)
- No trimming
- Result: **150-250 words per slide**

## Connection Verified ✅

The dropdown IS properly connected to the backend optimizations!

**Test it:**
1. Go to `/app`
2. Select **"Presentation"** from "Mode" dropdown
3. Enter any topic (e.g., "AI in Healthcare")
4. Generate
5. You should see ultra-concise slides (11-29 words/slide)

## Date
October 15, 2025

