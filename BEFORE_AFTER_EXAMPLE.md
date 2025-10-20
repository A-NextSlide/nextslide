# Before & After: Tiptap Multi-Line Formatting

## ❌ BEFORE (Text Running Together)

```
Key MetricsSNES: 49 million unitsGenesis: 30-35 million units
```

**Generated JSON (WRONG):**
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "texts": [
      {
        "text": "Key MetricsSNES: 49 million unitsGenesis: 30-35 million units",
        "style": {}
      }
    ]
  }
}
```

## ✅ AFTER (Properly Formatted)

```
Key Metrics

SNES: 49 million units
Genesis: 30-35 million units
```

**Generated JSON (CORRECT):**

### Option A: Separate TiptapTextBlocks (Recommended for Different Sections)
```json
[
  {
    "type": "TiptapTextBlock",
    "props": {
      "position": { "x": 120, "y": 200 },
      "width": 800,
      "height": 50,
      "texts": [
        { "text": "Key Metrics", "style": { "bold": true, "textColor": "{{secondary}}" } }
      ],
      "fontSize": 42
    }
  },
  {
    "type": "TiptapTextBlock",
    "props": {
      "position": { "x": 120, "y": 280 },
      "width": 800,
      "height": 80,
      "texts": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              { "type": "text", "text": "SNES: ", "style": { "textColor": "{{primary}}" } },
              { "type": "text", "text": "49 million units", "style": { "bold": true, "textColor": "{{accent}}" } }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              { "type": "text", "text": "Genesis: ", "style": { "textColor": "{{primary}}" } },
              { "type": "text", "text": "30-35 million units", "style": { "bold": true, "textColor": "{{accent}}" } }
            ]
          }
        ]
      },
      "fontSize": 32
    }
  }
]
```

### Option B: Single TiptapTextBlock with All Content (For Compact Lists)
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "position": { "x": 120, "y": 200 },
    "width": 800,
    "height": 140,
    "texts": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [
            { "type": "text", "text": "Key Metrics", "style": { "bold": true, "textColor": "{{secondary}}" } }
          ]
        },
        {
          "type": "paragraph",
          "content": [
            { "type": "text", "text": "SNES: ", "style": { "textColor": "{{primary}}" } },
            { "type": "text", "text": "49 million units", "style": { "bold": true, "textColor": "{{accent}}" } }
          ]
        },
        {
          "type": "paragraph",
          "content": [
            { "type": "text", "text": "Genesis: ", "style": { "textColor": "{{primary}}" } },
            { "type": "text", "text": "30-35 million units", "style": { "bold": true, "textColor": "{{accent}}" } }
          ]
        }
      ]
    },
    "fontSize": 32,
    "fontFamily": "{{bodyFont}}"
  }
}
```

## Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| **Line breaks** | None - text runs together | Proper paragraph structure |
| **Format** | Simple array only | CustomDoc with paragraphs |
| **Formatting** | Limited | Rich per-line styling |
| **Height calc** | Incorrect | Proper: `fontSize × lines × 1.3` |
| **Readability** | Poor | Excellent |

## Visual Appearance

### Before:
```
┌─────────────────────────────────────────┐
│ Key MetricsSNES: 49 million unitsGen... │
└─────────────────────────────────────────┘
```

### After:
```
┌─────────────────────────────────────────┐
│ Key Metrics                             │
│                                         │
│ SNES: 49 million units                 │
│ Genesis: 30-35 million units            │
└─────────────────────────────────────────┘
```

## Common Use Cases Fixed

1. **Key Metrics Lists** ✅
2. **Timeline Entries** ✅
3. **Bullet Point Lists** ✅
4. **Feature Lists** ✅
5. **Comparison Data** ✅
6. **Multi-line Labels** ✅

## What the Prompt Now Teaches

1. **Two Format Options**: Simple array vs. CustomDoc
2. **When to Use Each**: Clear decision guide
3. **Structure Rules**: Each line = separate paragraph
4. **Practical Examples**: 3+ real-world patterns
5. **Common Mistakes**: What NOT to do
6. **Height Calculation**: Proper sizing for multi-line content
7. **Styling Flexibility**: Mix bold, colors, highlights per line

