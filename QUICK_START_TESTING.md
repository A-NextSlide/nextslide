# Quick Start: Testing LayoutArchitect V2

## ✅ Implementation Status

All code is implemented and syntax-checked. Ready for live testing.

---

## 🧪 How to Test

### 1. Start Your Backend

```bash
cd /Users/ahmed/Documents/Dev/nextslide/apps/backend
python3 main.py  # or however you start your backend
```

### 2. Generate a Test Deck

Use your frontend or API to create a deck with these slide types:

**Example Deck Outline:**
```json
{
  "title": "Q4 Business Review",
  "slides": [
    {
      "title": "Q4 Business Review",
      "content": "Quarterly results and strategic outlook"
    },
    {
      "title": "Meet Our Team",
      "content": "John Smith - CEO\nJane Doe - CTO\nMike Johnson - CFO\nSarah Wilson - CMO\nDavid Chen - VP Engineering\nEmily Brown - VP Sales"
    },
    {
      "title": "Market Opportunity",
      "content": "TAM: $50B\nSAM: $15B\nSOM: $3B"
    },
    {
      "title": "Q4 Revenue Growth",
      "content": "Total revenue: $12.3M (up 45% YoY)\nMRR: $1.2M\nChurn: 2.1%\nNPS: 72"
    },
    {
      "title": "Product Features",
      "content": "- Real-time analytics\n- AI-powered insights\n- Custom dashboards\n- Team collaboration"
    }
  ]
}
```

### 3. Check Logs

Look for these indicators:

**✅ LayoutArchitect Running:**
```
[DECK COMPOSER] Generating editorial layouts with LayoutArchitect...
[LAYOUT ARCHITECT] designing_layouts: Designing editorial layouts...
```

**✅ Slide Type Detection:**
```
[LAYOUT ARCHITECT] designing_slide_layout: Designing layout for slide 1/5: Q4 Business Review...
[LAYOUT ARCHITECT] designing_slide_layout: Designing layout for slide 2/5: Meet Our Team...
[LAYOUT ARCHITECT] designing_slide_layout: Designing layout for slide 3/5: Market Opportunity...
```

**✅ Blueprints Stored:**
```
[DECK COMPOSER] ✅ Added 5 layout blueprints to ThemeSpec
```

**✅ Blueprint Injection:**
```
🎨 EDITORIAL LAYOUT BLUEPRINT (Follow this EXACT design)
================================================================================
📐 DESIGN CONCEPT:
   3×2 grid layout optimized for 6 team members...
```

### 4. Inspect Generated Deck

**Check for:**

✅ **Title Slide (Slide 1):**
- Large centered or asymmetric title
- Hero size: 140-200pt
- Optional decorative elements

✅ **Team Slide (Slide 2):**
- Grid layout (2×3 or 3×2)
- Circle images (borderRadius="50%")
- Names + titles below each photo

✅ **Market Slide (Slide 3):**
- Three concentric circles
- TAM (outer), SAM (middle), SOM (inner)
- Values centered in circles
- Large typography (72pt, 60pt, 48pt)

✅ **Data Slide (Slide 4):**
- Chart on left or top
- Stat cards on right or bottom
- Large numbers (72pt)
- Small labels (24pt)

✅ **Content Slide (Slide 5):**
- Split-screen or icon grid
- Text + visual balance
- Clear hierarchy

---

## 🔍 Verification Checklist

### Backend Logs

- [ ] `[LAYOUT ARCHITECT]` messages appear
- [ ] No errors in LayoutArchitect execution
- [ ] Blueprints count matches slide count
- [ ] SlidePromptBuilder injects blueprints

### Generated Slides

- [ ] Title slide has large hero text
- [ ] Team slide has grid of people
- [ ] Market slide has concentric circles (if applicable)
- [ ] Data slide has chart + stats
- [ ] Consistent slide numbers (bottom left)
- [ ] Consistent spacing and alignment

### Blueprint Structure

In your database or response, check `theme.slide_themes`:

```json
{
  "slide-0": {
    "layout_reasoning": "Hero centered title...",
    "components": [
      {"id": "bg", "type": "Background", "props": {...}},
      {"id": "title", "type": "TiptapTextBlock", "props": {...}},
      {"id": "slide_number", "type": "TiptapTextBlock", "props": {...}}
    ]
  },
  "slide-1": {
    "layout_reasoning": "3×2 grid for team...",
    "components": [...]
  }
}
```

---

## 🐛 Common Issues

### Issue: LayoutArchitect not running

**Check:**
1. API keys set: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
2. Import errors in logs
3. Theme generation completed before LayoutArchitect

**Fix:**
```bash
export ANTHROPIC_API_KEY=your_key_here
# or
export OPENAI_API_KEY=your_key_here
```

### Issue: Blueprints not in theme

**Check:**
1. `theme.slide_themes` exists
2. Blueprints stored correctly (line 1317-1324 in adapters.py)
3. Theme serialization includes slide_themes

**Fix:**
Check logs for `Added X layout blueprints to ThemeSpec`

### Issue: SlidePromptBuilder not using blueprints

**Check:**
1. `_get_slide_structure_from_theme()` returns blueprint
2. `_add_layout_architect_blueprint()` is called
3. Prompt includes "EDITORIAL LAYOUT BLUEPRINT" header

**Fix:**
Verify slide_id format matches: `"slide-0"`, `"slide-1"`, etc.

### Issue: Slides don't match blueprint

**Check:**
1. AI generator receives blueprint in prompt
2. Component validator accepts blueprint format
3. Frontend renders components correctly

**Fix:**
Review SlideGenerator logs for component generation

---

## 📊 Expected Performance

### Generation Time

- **Phase 1 (Strategy):** ~2-3 seconds
- **Phase 2 (Per Slide):** ~1-2 seconds each
- **Total overhead:** ~12-22 seconds for 10-slide deck

### API Costs

- **Phase 1:** ~1,000 tokens (strategy)
- **Phase 2:** ~2,000 tokens per slide
- **Total:** ~21,000 tokens for 10-slide deck
- **Cost:** ~$0.21 with Claude Sonnet (at $0.01/1K tokens)

---

## 🎯 Success Criteria

You'll know it's working when:

1. ✅ Logs show LayoutArchitect running
2. ✅ Team slides have grid layouts with circle images
3. ✅ Market slides have concentric circles
4. ✅ Data slides have charts + stat cards
5. ✅ All slides have consistent elements (numbers, spacing)
6. ✅ Layouts look professional and editorial
7. ✅ No random/improvised positioning
8. ✅ Components don't overlap (unless intentional)

---

## 🚀 Next Steps After Testing

### If Working:

1. Monitor performance in production
2. Gather feedback on layout quality
3. Adjust prompts if needed (in `layout_architect.py`)
4. Fine-tune slide type detection
5. Add more slide patterns if needed

### If Issues:

1. Check logs for specific errors
2. Test with simpler decks (3-5 slides)
3. Verify component schemas loaded
4. Test with different slide types individually
5. Review AI responses (check if JSON parsing fails)

---

## 💡 Tips

### For Best Results:

1. **Clear slide titles:** "Meet Our Team" → team pattern, "Market Opportunity" → market pattern
2. **Structured content:** List names for team, TAM/SAM/SOM for market
3. **Data visibility:** Include actual numbers for data slides
4. **Consistent branding:** Use stylePreferences for colors/fonts

### For Debugging:

1. Enable verbose logging:
   ```python
   logger.setLevel(logging.DEBUG)
   ```

2. Print blueprint before storing:
   ```python
   logger.info(f"Blueprint for slide {i}: {json.dumps(blueprint, indent=2)}")
   ```

3. Check prompt output:
   ```python
   logger.debug(f"Prompt includes blueprint: {'EDITORIAL LAYOUT BLUEPRINT' in prompt}")
   ```

---

## 📞 Support

If issues persist:

1. Check `THEME_DIRECTOR_V2_IMPLEMENTATION_COMPLETE.md` for full details
2. Review logs for error messages
3. Test individual components (LayoutArchitect, SlidePromptBuilder)
4. Verify theme system works without LayoutArchitect (disable temporarily)

---

**Ready to test!** 🚀

Generate your first deck and watch the magic happen! ✨
