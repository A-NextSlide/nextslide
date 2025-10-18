# Slide Generation Testing Plan

## Test Date: 2025-10-02
## Frontend Running: http://localhost:8081/

---

## 1. FORMATTING TESTS

### Title Slides (First Slide)
- [ ] **Centering**: Title text should be centered (`align: 'center'`)
- [ ] **Slide Type**: First slide should have `slide_type: 'title'`
- [ ] **Components**: Should have title and subtitle components
- [ ] **No Duplication**: No repeated text or components

### Content Slides
- [ ] **Proper Alignment**: Content should follow design patterns
- [ ] **No Overlap**: Components shouldn't overlap
- [ ] **Spacing**: Proper vertical/horizontal spacing
- [ ] **Background**: Each slide has proper background component

---

## 2. OUTLINE GENERATION TESTS

### Check Outline Service (`outlineApi.ts:1030`)
- [ ] **Title Page**: First slide in outline is marked as title type
- [ ] **Slide Count**: Matches requested count
- [ ] **No Repetition**: Slides don't repeat same content
- [ ] **Narrative Flow**: Slides follow logical progression

### Streaming Events
- [ ] `outline_structure` event fires correctly
- [ ] `slide_complete` events for each slide
- [ ] `outline_complete` with full outline
- [ ] No duplicate slide generation

---

## 3. DECK COMPOSITION TESTS

### API Endpoint (`/compose-deck-stream`)
- [ ] **Deck Creation**: Properly creates deck in DB
- [ ] **Slide Order**: Maintains correct order
- [ ] **Component Generation**: All components present
- [ ] **No Post-Processing Issues**: Clean data, no extra transformations

### Component Issues to Check
- [ ] **Duplicate IDs**: Check `componentIds` for duplicates
- [ ] **Missing Components**: Ensure all slides have components
- [ ] **Background Component**: Always present, never deleted
- [ ] **Text Centering**: Title slides use `props.align = 'center'`

---

## 4. DATABASE CHECKS

### Tables to Inspect
```sql
-- Check recent decks
SELECT uuid, title, created_at FROM decks ORDER BY created_at DESC LIMIT 5;

-- Check slides for a specific deck
SELECT id, title, slide_type, slide_order FROM slides
WHERE deck_id = 'DECK_UUID' ORDER BY slide_order;

-- Check for duplicate components
SELECT slide_id, COUNT(*) as component_count
FROM slides
GROUP BY slide_id;
```

### Issues to Look For
- [ ] **First Slide**: Should be `slide_type = 'title'`
- [ ] **Slide Order**: Sequential, no gaps
- [ ] **Components JSON**: Valid structure
- [ ] **Title Centering**: Title slide text components have center alignment

---

## 5. MULTIPLE TEST RUNS

Run generation 5 times with different prompts:

### Test 1: Simple Topic
**Prompt**: "Introduction to Machine Learning"
- Expected: ~6-8 slides, title + content slides
- Check: Title centering, no overlap

### Test 2: Longer Topic
**Prompt**: "Complete Guide to Web Development with React, Node.js, and PostgreSQL"
- Expected: ~10-12 slides
- Check: No repetitive content, proper flow

### Test 3: Data-Heavy Topic
**Prompt**: "Quarterly Sales Report Q4 2024"
- Expected: Charts, data tables
- Check: Component positioning, no overlap

### Test 4: List-Heavy Topic
**Prompt**: "10 Best Practices for Software Engineering"
- Expected: Bullet point slides
- Check: Text spacing, list formatting

### Test 5: Image-Heavy Topic
**Prompt**: "Travel Guide to Japan"
- Expected: Image placeholders/components
- Check: Image component sizing, positioning

---

## 6. CODE INSPECTION POINTS

### Title Page Generation
File: `apps/frontend/src/utils/slideUtils.ts` (likely)
- Check if `slide_type === 'title'` sets `align: 'center'`

### Outline Generation
File: `apps/frontend/src/services/outlineApi.ts:1030`
- Check `outline_structure` event
- Verify first slide is marked as title

### Component Deduplication
File: `apps/frontend/src/stores/deckSlideOperations.ts`
- Check `mergeComponents` function
- Verify no duplicate IDs

---

## 7. SPECIFIC BUGS TO LOOK FOR

### Repetition Issues
- [ ] Same slide content appearing twice
- [ ] Same component ID appearing multiple times
- [ ] Title repeated in body text

### Formatting Issues
- [ ] Title slide not centered
- [ ] Text overflowing slide bounds
- [ ] Components overlapping
- [ ] Misaligned elements

### Post-Generation Issues
- [ ] Components changed after generation
- [ ] Slide order changed
- [ ] Missing components
- [ ] Extra processing modifying content

---

## 8. MANUAL TESTING STEPS

1. **Open**: http://localhost:8081/
2. **Create New Presentation** with prompt: "Introduction to AI"
3. **Observe**:
   - Streaming progress
   - Slide previews as they generate
   - Final deck composition
4. **Check First Slide**:
   - Open developer tools
   - Inspect title component
   - Verify `props.align === 'center'`
   - Verify `slide_type === 'title'`
5. **Check All Slides**:
   - Look for duplicate content
   - Check component positioning
   - Verify no overlap
6. **Repeat** 4 more times with different prompts

---

## 9. FINDINGS LOG

### Issue Format:
```
[ISSUE-001] Title slide not centered
- File: slideUtils.ts:123
- Expected: align='center'
- Actual: align='left'
- Fix: Set align to center for slide_type==='title'
```

### Current Issues:
_(Document issues found during testing)_

---

## 10. FIXES TO IMPLEMENT

Based on testing, create targeted fixes for:
- [ ] Title centering
- [ ] Outline generation (first slide type)
- [ ] Component deduplication
- [ ] Post-generation processing
- [ ] Overlap prevention
