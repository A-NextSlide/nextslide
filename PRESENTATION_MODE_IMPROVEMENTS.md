# Presentation Mode Improvements

## Problem Statement
Perplexity was being used for outline generation across all modes. While excellent at gathering data and research, Perplexity struggled with creating good presentation narratives and structure. Presentations were coming out with too many paragraphs and not enough digestible, speakable content.

## Solution Implemented

### 1. **Model Configuration Changes** (`apps/backend/agents/config.py`)

#### Before:
```python
PRESENTATION_OUTLINE_MODEL = 'perplexity-sonar'  # For presentation mode
```

#### After:
```python
PRESENTATION_OUTLINE_MODEL = 'claude-haiku-4-5'  # Excellent narrative structure
USE_HYBRID_RESEARCH_MODE = True  # Perplexity research + Haiku structuring
```

### 2. **Three-Tier Approach**

The system now uses different strategies based on detail level:

#### **Quick/Standard Mode (Presentation Focus)**
- **Model**: Claude Haiku 4.5
- **Purpose**: Fast, digestible, presentation-ready content
- **Characteristics**:
  - Short, punchy bullets (8-15 words)
  - No paragraphs
  - Visual hierarchy
  - Speakable content
  - 40-80 words per slide

#### **Detailed Mode with Hybrid Research**
- **Phase 1**: Perplexity Pro gathers comprehensive research data
- **Phase 2**: Haiku 4.5 structures it into digestible presentation format
- **Result**: Best of both worlds - deep research + great narrative

#### **Detailed Mode without Hybrid**
- **Model**: Perplexity Pro
- **Purpose**: Comprehensive, fact-dense presentations
- **Use case**: When research depth is paramount

### 3. **Presentation-Optimized Prompts**

#### New System Prompt for Presentation Mode:
```
You are an expert PRESENTATION DESIGNER creating slides for live presenting.
🎯 CORE MISSION: Create DIGESTIBLE, SPEAKABLE slide content - NOT documents to read!

⚠️ CRITICAL PRINCIPLES FOR PRESENTATIONS:
1. AVOID PARAGRAPHS - Presentations are for presenting, not reading
2. SHORT, PUNCHY BULLETS - Each bullet should be 8-15 words max
3. VISUAL HIERARCHY - Use main bullets (•) and sub-bullets (  •)
4. SCANNABLE CONTENT - Audience should grasp key points in 3-5 seconds
5. EMPHASIS on KEY DATA - Use **bold** for numbers, companies, critical terms
6. ONE IDEA PER SLIDE - Break complex topics into multiple simple slides
7. SUPPORT WITH VISUALS - Include [IMAGE: description] on 70% of slides
```

#### Examples Provided to Model:

✅ **GOOD** (Presentation-Ready):
```
• Revenue grew **42%** to **$2.3B** in Q3 2024
• **Tesla** leads with **65%** market share in EVs
• Launched in **5 markets**, reaching **12M users**
```

❌ **BAD** (Document-Like):
```
• Our company has experienced significant revenue growth over the past quarter, 
  increasing by approximately 42% when compared to the same period last year, 
  resulting in total revenue of $2.3 billion.
```

### 4. **Content Guidelines**

#### Presentation Mode (Standard/Quick):
- **Bullets per slide**: 3-5 main bullets
- **Words per bullet**: 8-15 words
- **Total words per slide**: 40-80 words
- **Format**: Visual hierarchy with main bullets + sub-bullets
- **Emphasis**: **Bold** on key data

#### Detailed Mode:
- **Words per slide**: 150-250 words
- **Bullets per slide**: 5-8 with sub-bullets
- **Format**: Section headers + multi-level bullets
- **Emphasis**: Data-rich with specific metrics

### 5. **Hybrid Research Mode Implementation**

New method `_generate_with_hybrid_research()`:

```python
async def _generate_with_hybrid_research(self, options: OutlineOptions):
    # PHASE 1: Research with Perplexity Pro
    research_data = invoke(
        perplexity_client,
        "perplexity-sonar-pro",
        research_prompt  # Focus on gathering data, stats, facts
    )
    
    # PHASE 2: Structure with Haiku 4.5
    enriched_prompt = f"""
    {original_prompt}
    
    RESEARCH CONTEXT: {research_data}
    
    CRITICAL: Transform research into DIGESTIBLE presentation format
    - AVOID long paragraphs
    - Short, punchy bullets (8-15 words)
    - Break complex info into multiple simple slides
    - Emphasize key numbers with **bold**
    """
    
    result = invoke(haiku_client, enriched_prompt)
    return result
```

## How It Works

### For Standard/Quick Presentations:
1. User requests a presentation (standard or quick mode)
2. System uses Haiku 4.5 directly
3. Haiku creates digestible, speakable slides
4. Content optimized for presenting (not reading)

### For Detailed Presentations (with hybrid mode):
1. User requests detailed presentation
2. **Phase 1**: Perplexity Pro researches the topic
   - Gathers statistics, data, facts
   - Finds real-world examples
   - Collects citations
3. **Phase 2**: Haiku 4.5 receives research + prompt
   - Structures research into presentation format
   - Creates short, digestible bullets
   - Maintains data/charts from research
   - Adds visual hierarchy
4. Result: Deep research + excellent presentation structure

## Benefits

### ✅ Better Presentation Structure
- Slides are speakable, not just readable
- Content is digestible in 3-5 seconds
- Clear visual hierarchy

### ✅ Maintained Data Quality
- Still leverages Perplexity for research (detailed mode)
- All statistics and facts preserved
- Charts and data visualizations intact

### ✅ Audience-Friendly
- No walls of text
- Emphasis on key points
- Easy to follow during presenting

### ✅ Configurable
- Toggle `USE_HYBRID_RESEARCH_MODE` on/off
- Different strategies for different needs
- Maintains backward compatibility

## Configuration

### Enable/Disable Hybrid Mode
```python
# apps/backend/agents/config.py
USE_HYBRID_RESEARCH_MODE = True   # Enable hybrid (recommended)
USE_HYBRID_RESEARCH_MODE = False  # Use single-model approach
```

### Model Selection
```python
PRESENTATION_OUTLINE_MODEL = 'claude-haiku-4-5'  # For standard/quick
PERPLEXITY_OUTLINE_MODEL = 'perplexity-sonar-pro'  # For detailed research
```

## Testing Recommendations

### Test Cases:

1. **Standard Presentation** (e.g., "AI in Healthcare")
   - Should use Haiku 4.5
   - Short bullets (8-15 words)
   - Total 40-80 words per slide
   - No paragraphs

2. **Detailed Presentation** (e.g., "Comprehensive AI Market Analysis")
   - Should trigger hybrid mode
   - Phase 1: Perplexity research
   - Phase 2: Haiku structuring
   - Rich data + digestible format

3. **Quick Presentation** (e.g., "Quick update on Q3 results")
   - Should use Haiku 4.5
   - Minimal slides (3-5)
   - Very concise bullets

## Files Modified

1. `/apps/backend/agents/config.py`
   - Changed `PRESENTATION_OUTLINE_MODEL` to Haiku 4.5
   - Added `USE_HYBRID_RESEARCH_MODE` flag

2. `/apps/backend/services/outline/generator.py`
   - Added `_generate_with_hybrid_research()` method
   - Updated `_generate_with_perplexity()` to route to hybrid mode
   - Rewrote system prompts for presentation mode
   - Updated bullet guidance and examples
   - Emphasized digestible, speakable content

## Key Differences

### Before (Perplexity for All):
- ❌ Presentation mode used Perplexity Sonar
- ❌ Often generated paragraph-like content
- ❌ Too wordy for presenting
- ❌ Not optimized for speakability

### After (Haiku for Presentations):
- ✅ Presentation mode uses Haiku 4.5
- ✅ Short, punchy bullets
- ✅ Digestible content (40-80 words/slide)
- ✅ Optimized for live presenting
- ✅ Hybrid mode for detailed research + structure

## Conclusion

The new system provides:
- **Perplexity's strength**: Research, data gathering, statistics
- **Haiku's strength**: Narrative structure, digestible content, presentation flow

Result: Presentations that are both **data-rich** and **presentation-ready**, without walls of text or overly complex paragraphs.

