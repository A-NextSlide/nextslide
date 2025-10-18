# Testing Guide: Comprehensive Content Generation

## Quick Test via UI

The easiest way to test is through your application's UI:

### 1. Start Your Backend
```bash
cd apps/backend
# Activate your venv if you have one
python -m uvicorn main:app --reload
# or however you normally start the backend
```

### 2. Create Test Presentation

In your UI, create a new presentation with:
- **Topic:** "Deep Analysis of First Round Capital Holdings and Portfolio Companies"
- **Detail Level:** Select **"Detailed"** (critical!)
- **Slides:** 10-12 slides

### 3. Check Output Quality

Your slides should now show:

#### ✅ Expected (Investment-Grade):
```
## Founding & Leadership
• **Founded in 2005** by Josh Kopelman (Half.com founder, sold to eBay for $300M) and Howard Morgan (Renaissance Technologies partner)[1][2]
  • Created to fill critical gap between angel investing ($50K-$250K) and Series A ($5M-$15M rounds)
  • Pioneered institutional seed-stage VC model with $500K-$2M initial investments
  • Kopelman's entrepreneurial background brought operational expertise and founder empathy

## Portfolio Performance & Major Exits
• **$510K Uber investment** in 2010 seed round became **$2.5B+ return** by 2019 (nearly 5,000x ROI)[3][4]
  • Participated in seed at $5M valuation with 3-person team, pre-product
  • Maintained ownership through multiple rounds via follow-on investments
• **500+ portfolio companies** with 14 unicorns including Verkada ($3.2B), Notion ($10B), Roblox ($45B+ IPO March 2021)[5]
  • 68% enterprise B2B SaaS, 22% consumer tech, 10% healthcare/biotech
```
**Metrics:** 200-400+ words per slide, section headers, multi-level bullets, specific data

#### ❌ Old Output (Too Generic):
```
• Focuses on consumer tech and digital brands[1]
• Invests in gaming startups like Sheba Joy[1]
• Prioritizes repeat purchase behavior[1]
```
**Metrics:** 30-60 words, single level, vague statements

---

## Quality Checklist

For each content slide, verify:

### Content Depth
- [ ] **200-400+ words per slide** (detailed mode)
- [ ] **8-12 comprehensive bullets** with sub-bullets
- [ ] **Section headers (##)** organizing content
- [ ] **3-4 levels of indentation** for hierarchical info

### Specificity
- [ ] **Specific numbers:** "$510K", "$2.5B", "5,000x ROI"
- [ ] **Named individuals:** "Josh Kopelman", "Howard Morgan"
- [ ] **Exact dates:** "2005", "2010", "March 2021"
- [ ] **Company names:** "Uber", "Roblox", "Looker", "Flatiron"
- [ ] **Concrete metrics:** "500+ companies", "14 unicorns", "$2B AUM"

### Research Quality
- [ ] **Citations present:** [1], [2], [3] throughout content
- [ ] **Verifiable facts:** Not generic statements
- [ ] **Recent information:** 2024 data when available
- [ ] **Complete context:** Background, analysis, implications

### Structure
- [ ] **Multi-level bullets:** Main points with 2-3 sub-bullet levels
- [ ] **Section organization:** Clear headers separating topics
- [ ] **Logical flow:** Background → Analysis → Implications
- [ ] **No vague statements:** Everything is specific and concrete

---

## What Changed

### Before (Generic Output)
- ❌ 500 max tokens per slide
- ❌ "One sentence per bullet (≤ 12-14 words)"
- ❌ "2-4 bullet points" total
- ❌ Generic prompts with no research emphasis

### After (Comprehensive Output)
- ✅ 4000 max tokens per slide (8x increase)
- ✅ "20-40 words per bullet with extensive data"
- ✅ "8-12 comprehensive bullets with 3-4 levels"
- ✅ Investment-grade prompts with research requirements

---

## Debugging

If you still see short, generic content:

### 1. Check Detail Level
Make sure you're selecting **"detailed"** mode, not "standard" or "quick"

### 2. Check Logs
Look for these log messages in your backend:
```
[PARALLEL] Making Perplexity API call for slide X (detailed mode)
Using 16000 max tokens for slide generation (unrestricted for comprehensive analysis)
```

### 3. Verify Model
Check that Perplexity Sonar Pro is being used:
```python
# In apps/backend/agents/config.py
OUTLINE_PLANNING_MODEL = "perplexity-sonar-pro"  # Should be Pro
OUTLINE_CONTENT_MODEL = "perplexity-sonar-pro"   # Should be Pro
```

### 4. Check Research Enabled
Research should be enabled by default:
```python
# In apps/backend/services/outline/models.py
enable_research: bool = True  # Should be True
```

### 5. Backend Restart
If you made config changes, restart your backend server to pick up the new settings.

---

## Expected Output Examples

### Slide 1: Executive Summary (Detailed Mode)
**Word Count:** 350-450 words  
**Structure:** 2-3 section headers, 10-12 bullets with sub-bullets  
**Content Sample:**
```
## Company Overview & Leadership
• **Founded in 2005** by Josh Kopelman (Half.com founder) and Howard Morgan (Renaissance Technologies)
  • Kopelman: Serial entrepreneur, sold Half.com to eBay for $300M, Forbes Midas List regular
  • Morgan: Former professor at UPenn, deep tech investment background
  • Mission: Fill gap between angel ($50K-$250K) and Series A ($5M-$15M) funding
• **Headquarters in San Francisco** with additional office in New York City
  • Team of 15+ investment professionals as of 2024
  • Partners include Bill Trenchard, Brett Berson, Meka Asonye, Todd Jackson

## Investment Track Record
• **500+ portfolio companies** funded since 2005 across multiple sectors
  • 68% enterprise/B2B SaaS (e.g., Looker, Square, Flatiron Health)
  • 22% consumer technology (e.g., Uber, Roblox, Notion)
  • 10% healthcare and biotech (e.g., Flatiron, Oscar Health)
• **14 unicorn companies** (valued at $1B+) in current portfolio
  • Verkada: $3.2B valuation (2024) - security cameras and IoT
  • Notion: $10B valuation (2021) - collaboration software
  • Roblox: $45B+ at IPO (March 2021) - gaming platform

## Legendary Returns & Exits
• **Uber: 5,000x return** - $510K seed investment (2010) → $2.5B realized by 2019
  • Invested at $5M valuation with 3-person team, pre-product
  • Maintained position through follow-on investments in Series A ($60M, 2011) and B ($258M, 2013)
• **Major acquisitions:** Looker $2.6B (Google, 2019), Flatiron Health $1.9B (Roche, 2018)
• **Fund X raised $500M** in 2024, bringing total AUM to over $2 billion
```

### Slide 4: Company Overview (Detailed Mode)
**Word Count:** 300-400 words  
**Structure:** 3 section headers, 9-11 bullets with deep sub-bullets  

### Slide 7: Portfolio Analysis (Detailed Mode)
**Word Count:** 350-450 words  
**Structure:** Multiple sections analyzing portfolio composition, sector focus, notable companies  

---

## Alternative: API Test

If you want to test via API directly:

```bash
curl -X POST http://localhost:8000/api/outline \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Deep Analysis of First Round Capital Holdings and Portfolio Companies",
    "detail_level": "detailed",
    "enable_research": true,
    "slide_count": 12
  }'
```

Check the response for:
- Word count per slide (should be 200-500+)
- Section headers (##)
- Multi-level bullets
- Specific facts with citations

---

## Success Criteria

✅ **Content matches or exceeds GenSpark quality:**
- Comprehensive depth (200-500+ words per slide)
- Specific facts, figures, and names throughout
- Investment-grade analysis with context
- Research-backed with citations
- Multi-level structure with section headers

✅ **No more generic statements:**
- "significant returns" → "$2.5B return on $510K (5,000x)"
- "successful exits" → "Looker $2.6B (Google 2019), Flatiron $1.9B (Roche 2018)"
- "founded by entrepreneurs" → "Josh Kopelman (Half.com founder) and Howard Morgan"

---

**The system is now configured for truly comprehensive, research-backed content! 🎉**

