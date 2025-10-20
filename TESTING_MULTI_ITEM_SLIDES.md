# Testing Multi-Item Slides Feature

## Quick Test Guide

The multi-item slides feature is now fully implemented! Here's how to test it:

## Test Case 1: Planets Slide

**Create a presentation:**
1. Title: "The Solar System"
2. Add a slide with title: "The Planets"
3. Content:
```
- Mercury: Smallest planet, no atmosphere
- Venus: Hottest planet, thick clouds
- Earth: Only known life, 71% water
- Mars: Red planet, polar ice caps
- Jupiter: Largest planet, Great Red Spot
- Saturn: Beautiful rings, 82 moons
- Uranus: Ice giant, sideways rotation
- Neptune: Strongest winds, deep blue
```

**Expected Result:**
- ✅ Each planet gets its own section (8 sections total)
- ✅ Each section has planet name + facts
- ✅ Each section has its own image (Mercury image for Mercury, Venus image for Venus, etc.)
- ✅ Layout: Grid (2x4 or 3x3) or horizontal sections
- ✅ Images are specific to each planet, not generic "planets" images

**Check Logs:**
```
🎯 Multi-item slide detected! Found 8 items: [Mercury planet, Venus planet, ...]
🎯 [MULTI-ITEM DETECTED] Slide 2 has 8 items: [Mercury, Venus, ...]
[SlideImageUpdater] Matched image by metadata.topic: Mercury planet
[SlideImageUpdater] Matched image by metadata.topic: Venus planet
...
```

## Test Case 2: Product Comparison

**Create a presentation:**
1. Title: "iPhone Lineup 2024"
2. Add slide: "Compare Our Models"
3. Content:
```
iPhone 15: Starting at $799, dual camera
iPhone 15 Plus: 6.7" display, all-day battery
iPhone 15 Pro: Titanium design, A17 Pro chip
iPhone 15 Pro Max: 5x zoom, longest battery
```

**Expected Result:**
- ✅ 4 product sections (horizontal or grid layout)
- ✅ Each product has its own image
- ✅ Images show specific iPhone model, not generic phone images
- ✅ Professional, card-based layout

## Test Case 3: Team Members

**Create a presentation:**
1. Title: "Our Company"
2. Add slide: "Leadership Team"
3. Content:
```
Sarah Chen, CEO: 15 years in tech
Michael Rodriguez, CTO: Built systems for 100M+ users
Emma Thompson, Head of Design: Award-winning expert
```

**Expected Result:**
- ✅ 3 team member sections
- ✅ Vertical stack or horizontal layout
- ✅ Each person gets individual professional headshot/portrait
- ✅ Names in bold with accent color

## Test Case 4: City Comparison

**Create a presentation:**
1. Title: "European Travel Guide"
2. Add slide: "Top Cities"
3. Content:
```
Paris, France: Eiffel Tower, world-class museums
London, UK: Big Ben, royal palaces
Barcelona, Spain: Gaudí architecture, beaches
Rome, Italy: Ancient ruins, Vatican City
```

**Expected Result:**
- ✅ 4 city sections with landmark images
- ✅ Each city has image of famous landmark
- ✅ Grid or vertical layout
- ✅ Consistent spacing and styling

## What to Look For

### In the Generated Slide JSON

Check that Image components have metadata:
```json
{
  "type": "Image",
  "props": {
    "src": "placeholder",
    "alt": "Mercury planet surface close-up",
    "metadata": {
      "topic": "Mercury planet",
      "searchQuery": "Mercury planet surface"
    },
    "position": {"x": 100, "y": 220},
    "width": 560,
    "height": 320,
    "objectFit": "cover",
    "borderRadius": "16px"
  }
}
```

### In the Browser Console

When images are applied, you should see:
```
[SlideImageUpdater] Matched image by metadata.topic: Mercury planet
[SlideImageUpdater] Applying image to component img-mercury: https://...mercury-image.jpg
```

### In the Visual Result

- Each item has a distinct section with clear visual separation
- Item names are bold and use accent color
- Each item has 2-4 facts/bullet points
- Images are relevant to their specific item
- Layout is balanced and professional
- Spacing is consistent

## Common Issues & Solutions

### Issue: All items get the same image
**Cause:** Generator didn't add metadata to Image components  
**Solution:** Check that slide was detected as multi-item (check logs for "🎯 Multi-item slide detected")

### Issue: Items are grouped together
**Cause:** Multi-item detection didn't trigger  
**Solution:** Ensure content has:
- 2+ list items with bullets/numbers, OR
- 3+ capitalized entity names, OR
- Comma-separated list of items

### Issue: No images appear
**Cause:** Image search didn't run or failed  
**Solution:** Check that image search completed and returned results for each topic

### Issue: Layout looks cramped
**Cause:** Too many items for available space  
**Solution:** System should automatically choose grid layout for 4+ items

## Verifying the Fix Works

Create a slide about planets and verify:

**Before the fix:**
- ❌ One grouped section with all planets mentioned
- ❌ Just 1 generic "solar system" or "planets" image
- ❌ No individual facts per planet

**After the fix:**
- ✅ Separate section for each planet
- ✅ Individual image for each planet (Mercury image, Venus image, etc.)
- ✅ Each planet has its own facts/details
- ✅ Beautiful grid or column layout
- ✅ Professional styling with theme colors

## Real-World Examples

The system now handles:
- 🪐 Planets (Mercury, Venus, Earth, Mars...)
- 📱 Products (iPhone 15, iPhone 15 Pro, iPhone 15 Pro Max...)
- 👥 Team members (CEO, CTO, Designer, Developer...)
- 🏙️ Locations (Paris, London, Tokyo, New York...)
- ⭐ Features (Feature A, Feature B, Feature C...)
- 🎯 Any slide listing multiple distinct entities!

## Next Steps

1. **Create a test presentation** with one of the examples above
2. **Generate the slide** and check the console logs
3. **Verify the layout** - each item should have its own section
4. **Check the images** - each should match its specific item
5. **Review the styling** - should be professional and well-spaced

If everything works as expected, you'll see:
- ✅ Multi-item detection logs
- ✅ Separate sections per item
- ✅ Relevant images per item
- ✅ Beautiful, professional layout

Enjoy creating amazing multi-item slides! 🎉

