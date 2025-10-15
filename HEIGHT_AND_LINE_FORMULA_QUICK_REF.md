# Height & Line Positioning - Formula Quick Reference

## The Two Critical Formulas

### 1. Height Formula
```
height = fontSize × 1.2
```

### 2. Line Positioning Formula
```
Line Y = Previous Component Y + Previous Component Height + Gap
```

---

## Common Height Calculations

| Font Size | Height | Calculation |
|-----------|--------|-------------|
| 24pt | 29px | 24 × 1.2 |
| 28pt | 34px | 28 × 1.2 |
| 32pt | 38px | 32 × 1.2 |
| 36pt | 43px | 36 × 1.2 |
| 40pt | 48px | 40 × 1.2 |
| 48pt | 58px | 48 × 1.2 |
| 56pt | 67px | 56 × 1.2 |
| 64pt | 77px | 64 × 1.2 |
| 72pt | 86px | 72 × 1.2 |
| 120pt | 144px | 120 × 1.2 |
| 200pt | 240px | 200 × 1.2 |

---

## Complete Layout Example

```json
// Section header (fontSize=32)
{
  "position": { "x": 120, "y": 160 },
  "height": 38,        // 32 × 1.2 = 38
  "fontSize": 32
}

// Line divider
// Line Y = 160 + 38 + 16 = 214
{
  "type": "Lines",
  "props": {
    "startPoint": { "x": 80, "y": 214 },
    "endPoint": { "x": 1840, "y": 214 }
  }
}

// Bullet 1 (fontSize=28)
// Bullet Y = 214 + 2 + 24 = 240
{
  "position": { "x": 120, "y": 240 },
  "height": 34,        // 28 × 1.2 = 34
  "fontSize": 28
}

// Bullet 2 (fontSize=28)
// Bullet Y = 240 + 34 + 28 = 302
{
  "position": { "x": 120, "y": 302 },
  "height": 34,        // 28 × 1.2 = 34
  "fontSize": 28
}

// Bullet 3 (fontSize=28)
// Bullet Y = 302 + 34 + 28 = 364
{
  "position": { "x": 120, "y": 364 },
  "height": 34,        // 28 × 1.2 = 34
  "fontSize": 28
}
```

**Result: NO OVERLAPS! Perfect spacing!**

---

## Quick Calculation Steps

### For Any Text Component:
1. **Determine fontSize** (e.g., 32)
2. **Calculate height:** 32 × 1.2 = 38
3. **Set height prop:** `"height": 38`

### For Any Line After Text:
1. **Get previous component's Y:** (e.g., 160)
2. **Get previous component's height:** (e.g., 38)
3. **Add gap:** 16-24px (detailed) or 20-40px (presentation)
4. **Calculate line Y:** 160 + 38 + 16 = 214
5. **Set line Y:** `"startPoint": { "y": 214 }`

### For Any Component After Another:
1. **Get previous component's Y and height**
2. **Calculate where it ends:** Y + Height
3. **Add appropriate gap** (mode-specific)
4. **That's your new component's Y**

---

## Common Mistakes to Avoid

### ❌ WRONG: Guessing Heights
```json
{ "fontSize": 32, "height": 80 }  // Too large!
{ "fontSize": 28, "height": 60 }  // Too large!
```

### ✅ CORRECT: Using Formula
```json
{ "fontSize": 32, "height": 38 }  // 32 × 1.2
{ "fontSize": 28, "height": 34 }  // 28 × 1.2
```

### ❌ WRONG: Random Line Position
```json
// Header at y=160, height=38 (ends at 198)
{ "startPoint": { "y": 240 } }  // Random! Wastes space!
```

### ✅ CORRECT: Calculated Line Position
```json
// Header at y=160, height=38 (ends at 198)
// Gap: 16px
{ "startPoint": { "y": 214 } }  // 198 + 16 = 214 ✅
```

---

## Remember

1. **Always multiply fontSize by 1.2** for height
2. **Always calculate line Y** from previous component
3. **Never guess** - use the formulas!
4. **Verify** no overlaps before finalizing

**These formulas eliminate overlaps and wasted space!**
