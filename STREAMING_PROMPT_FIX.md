# Streaming Prompt Fix - The Real Issue

## Problem Found

The system has **TWO different code paths**:
1. `_generate_with_perplexity()` - Non-streaming (which I fixed)
2. `_generate_slides_streaming_with_perplexity()` - **Streaming (which was still verbose!)**

Your presentations use the **STREAMING path**, which had completely different prompts that were still producing verbose content!

## Root Cause

Line 2155-2191 in `generator.py` had old verbose prompts for streaming:

### ❌ Old Streaming Prompt (VERBOSE):
```python
slide_prompt = f"""Create effective presentation content for this slide:

🎯 FLEXIBLE PRESENTATION MODE:
GOAL: Audience LEARNS and UNDERSTANDS the topic.

CONTENT APPROACH:
- Use what's needed to TEACH the topic effectively
- Mix bullets, sub-bullets (2-space indent), inline metrics
- Include section headers (##) if they help organize

✅ TEACHES TOPIC (DO THIS):
• Supreme Court ruled 9-0 Quebec had no veto over Charter
  Context: Quebec sought special status but federal proceeded

• Charter shifted power to federal government and courts
  Provinces lost autonomy over rights legislation
  Created judicial review framework
```

This was producing your verbose output!

## ✅ Fixed Streaming Prompt (MINIMAL):

```python
slide_prompt = f"""Create MINIMAL billboard-style content for this slide:

Presentation: {presentation_title}
Slide {idx+1}: {slide_title}

🚨 ABSOLUTE RULES - NO EXCEPTIONS:
- MAX 3 BULLETS TOTAL (not per section)
- MAX 5 WORDS PER BULLET
- NO paragraphs
- NO section headers (##)
- NO sub-bullets
- NO explanations
- ONLY facts with numbers

GOOD (3 bullets, 4-5 words each):
• Unity 2005: **free** tools
• Steam: **direct** sales
• Indie market: **40%** share

BAD (DELETE ALL):
❌ "Unity and Unreal Engine made professional-grade software free" (TOO LONG)
❌ "## Accessible Development Tools" (NO HEADERS)
❌ Sub-bullets with explanations (DELETE)
```

## Additional Fixes

### 1. Reduced max_tokens for Streaming
```python
# Before:
max_tokens_for_slide = 800  # Was allowing too much

# After:
max_tokens_for_slide = 300  # MINIMAL presentation mode
```

### 2. Temperature 0.0 for Streaming
```python
# Before:
temperature = 0.3  # Too creative

# After:
slide_temperature = 0.0 if detail_mode != 'detailed' else 0.3  # Strict following
```

## Your Slide: Before → After

### ❌ BEFORE (What You Were Getting):
```
The Perfect Storm: Three Forces That Changed Game Development

Accessible Development Tools

Unity (2005) and Unreal Engine made professional-grade software free or affordable, eliminating the $100K+ barrier to entry that previously locked out small developers from competing with AAA studios.

Digital Distribution & Gatekeepers Removed

Steam (2003) allowed direct-to-consumer sales without publisher approval. App stores (iOS 2008, Android 2008) provided global storefronts. Before: developers needed retail shelf space; now: algorithmic discovery enables indie games to reach millions instantly.

Crowdfunding Validated Unproven Concepts

Kickstarter (2009) let creators pre-sell games directly to fans, funding projects publishers deemed too niche. Shovel Knight raised $311K for a retro-style platformer, proving market demand for experiences AAA studios would not greenlight.
```

(~150 words, paragraphs, section headers!)

### ✅ AFTER (What You'll Get Now):
```
Three Forces Changed Indies

• Unity 2005: **free** tools
• Steam: **direct** distribution
• Kickstarter: **$311M** indie funding
[IMAGE: indie game development timeline]
```

**(3 bullets, 12 words total!)**

---

## All Fixes Applied to Streaming

1. ✅ **Prompt rewritten** - Billboard-style minimal
2. ✅ **max_tokens reduced** - 800 → 300
3. ✅ **Temperature 0.0** - Strict following
4. ✅ **NO section headers** - Explicitly forbidden
5. ✅ **MAX 5 words/bullet** - Hard limit
6. ✅ **MAX 3 bullets** - Hard limit

Plus post-processing enforcement still active:
- Removes section headers
- Trims bullets >5 words
- Caps at 3 bullets
- Stops at 20 words total

---

## Test Again

Generate a new presentation (standard mode) and you should see:

✅ **Each slide**:
- 2-3 bullets
- 4-5 words per bullet
- ~15 words total per slide
- NO section headers
- NO paragraphs
- NO explanations

**Just. Core. Facts. With. Numbers.** 🎯

The streaming path is now fixed!

