# Font Optimization System

## Overview

The font optimization system automatically runs after the chat agent generates slides to ensure all text fits perfectly within component containers. This prevents text overflow, cropping, and poor readability.

## How It Works

### 1. Generation Flow

```
Chat Agent (AI) → Component Validation → Font Optimization → Final Slide
```

1. **Chat Agent Generation**: AI generates slide content with initial font sizes and positions
2. **Component Validation**: Validates component structure and applies theme consistency
3. **Font Optimization**: Calculates optimal font sizes and positions (NEW)
4. **Final Slide**: Slide with perfectly fitted text components

### 2. Optimization Process

The `PostGenerationOptimizer` service performs the following optimizations:

#### A. Font Size Optimization
- Uses `AdaptiveFontSizer` with binary search algorithm
- Calculates the maximum font size that fits within container bounds
- Accounts for:
  - Container width and height
  - Padding (horizontal and vertical)
  - Letter spacing
  - Font family metrics
  - Line height (locked at 1.2 for consistency)
- Maintains visual hierarchy where possible

#### B. Position Optimization
- Ensures components don't overflow canvas boundaries (1920x1080)
- Maintains minimum 80px margin from edges
- Adjusts positions only when necessary to prevent overflow
- Preserves original layout intent when possible

#### C. Metadata Tracking
Each optimized component receives metadata:
```json
{
  "fontOptimized": true,
  "optimizedSize": 42.5,
  "estimatedLines": 2,
  "fitConfidence": 0.95,
  "fitsInContainer": true
}
```

### 3. Supported Components

Font optimization works with:
- `TiptapTextBlock` - Primary text component
- `TextBlock` - Simple text component
- `Title` - Title components
- `Subtitle` - Subtitle components
- `Heading` - Heading components
- `Shape` - Shapes with text (`hasText: true`)

### 4. Configuration

Enable/disable font optimization in `agents/config.py`:

```python
# Enable post-generation font optimization (runs after chat agent)
ENABLE_FONT_OPTIMIZATION = True  # Set to False to disable
```

When disabled, the system uses AI-generated font sizes without optimization.

## Technical Details

### Font Sizing Algorithm

The adaptive font sizer uses binary search to find the optimal size:

```python
# Initial bounds
min_size = 1.0
max_size = container_height  # Can't be taller than container

# Binary search loop
while (max_size - min_size) > precision:
    test_size = (min_size + max_size) / 2
    
    if text_fits(test_size):
        optimal_size = test_size
        min_size = test_size  # Try larger
    else:
        max_size = test_size  # Try smaller
```

### Text Measurement

Text measurement accounts for:

1. **Text Width**: Calculated using font metrics and character widths
2. **Letter Spacing**: Adds extra space between characters
   ```
   adjusted_width = base_width + (char_count - 1) * letter_spacing
   ```
3. **Line Wrapping**: Estimates number of lines needed
4. **Line Height**: Fixed at 1.2 for consistent fitting calculations
5. **Padding**: Reduces available space by padding values

### Position Adjustment Logic

```python
# Check boundaries
if x + width > CANVAS_WIDTH - MARGIN:
    x = max(MARGIN, CANVAS_WIDTH - MARGIN - width)

if y + height > CANVAS_HEIGHT - MARGIN:
    y = max(MARGIN, CANVAS_HEIGHT - MARGIN - height)

# Minimum margins
if x < MARGIN: x = MARGIN
if y < MARGIN: y = MARGIN
```

## Logging

The optimizer provides detailed logging:

```
🎨 [FONT OPTIMIZER] Starting optimization for slide 1
  📏 [TiptapTextBlock] Component 0: Font 48.0px → 42.5px (confidence: 0.95)
  📍 [TiptapTextBlock] Component 1: Position (100, 900) → (100, 880)
✅ [FONT OPTIMIZER] Optimized 5/10 components in slide 1
```

### Log Levels

- **INFO**: Optimization start/end, summary statistics
- **DEBUG**: Detailed sizing calculations, iterations, confidence scores

## Performance

### Efficiency
- Binary search converges in ~10-20 iterations per component
- Batch processing for multiple components
- Negligible overhead (< 50ms per slide)

### Confidence Scores

The optimizer provides confidence scores based on space utilization:
- **0.9-1.0**: Excellent fit (text uses 90%+ of available space)
- **0.7-0.9**: Good fit (text uses 70-90% of space)
- **0.5-0.7**: Acceptable fit (text uses 50-70% of space)
- **< 0.5**: Poor fit (text too small for container)

## Examples

### Example 1: Title Slide

**Before Optimization:**
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "width": 1800,
    "height": 400,
    "fontSize": 72,  // AI's initial guess
    "text": "Very Long Title That Might Overflow The Container"
  }
}
```

**After Optimization:**
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "width": 1800,
    "height": 400,
    "fontSize": 58.5,  // Optimized to fit
    "fontSizeMin": 58.5,
    "fontSizeMax": 58.5,
    "lineHeight": 1.2,
    "metadata": {
      "fontOptimized": true,
      "optimizedSize": 58.5,
      "estimatedLines": 2,
      "fitConfidence": 0.92,
      "fitsInContainer": true
    }
  }
}
```

### Example 2: Position Adjustment

**Before Optimization:**
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "position": {"x": 100, "y": 950},
    "width": 800,
    "height": 200  // Would overflow bottom edge (950 + 200 = 1150 > 1080)
  }
}
```

**After Optimization:**
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "position": {"x": 100, "y": 880},  // Adjusted to fit
    "width": 800,
    "height": 200  // Now fits (880 + 200 = 1080)
  }
}
```

## Troubleshooting

### Text Still Overflowing?

1. **Check padding values**: Large padding reduces available space
   ```python
   available_width = width - (2 * padding_x)
   available_height = height - (2 * padding_y)
   ```

2. **Check letter spacing**: Positive spacing increases text width
   ```python
   # Negative spacing = tighter text = larger font possible
   # Positive spacing = wider text = smaller font required
   ```

3. **Check container dimensions**: Very small containers may not fit text
   ```python
   # Minimum viable container: ~100x50 for single word
   ```

4. **Enable debug logging**: See detailed optimization steps
   ```python
   import logging
   logging.getLogger('services.post_generation_optimizer').setLevel(logging.DEBUG)
   ```

### Font Too Small?

The optimizer maximizes font size within constraints. If fonts are too small:

1. **Increase container size**: Give more space for text
2. **Reduce padding**: More available space = larger fonts
3. **Reduce text content**: Shorter text = larger fonts
4. **Use negative letter spacing**: Tighter text = larger fonts possible

## Future Enhancements

Potential improvements:

1. **Multi-column layout support**: Optimize text across multiple columns
2. **Dynamic container resizing**: Adjust container size to fit desired font size
3. **Font substitution**: Try different fonts if current font doesn't fit well
4. **Smart line breaking**: Optimize line breaks for better fit
5. **Hierarchical optimization**: Ensure titles are always larger than body text

## API Reference

### PostGenerationOptimizer

```python
class PostGenerationOptimizer:
    def optimize_slide(
        self, 
        slide_data: Dict[str, Any],
        slide_index: int = 0
    ) -> Tuple[Dict[str, Any], List[OptimizationResult]]
    
    def batch_optimize_slides(
        self,
        slides: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]
```

### OptimizationResult

```python
@dataclass
class OptimizationResult:
    component_index: int
    component_type: str
    original_font_size: float
    optimized_font_size: float
    original_position: Tuple[int, int]
    optimized_position: Tuple[int, int]
    position_adjusted: bool
    size_adjusted: bool
    fits_in_container: bool
    confidence: float
```

## Integration

The font optimizer is automatically integrated into the slide generation pipeline:

```python
# In SlideGeneratorV2._post_process_slide()
validated_components = self.component_validator.validate_components(...)

if ENABLE_FONT_OPTIMIZATION:
    slide_data, optimization_results = post_generation_optimizer.optimize_slide(
        slide_data,
        slide_index=context.slide_index
    )
```

No additional integration code is required - it runs automatically after each slide is generated by the chat agent.

